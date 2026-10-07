// Monte Carlo exploration of the rule space.
//
// Outer loop: sample rule sets (balance + starting setup) at random from headless/space.json, spread out with
// Latin hypercube sampling so every range is covered evenly.
// Inner loop: under each rule set, play a fixed panel of contrasting policies over several random seeds.
// The spread of outcomes says how interesting the rule set is to play:
//   can a good player grow?  does good play beat typical play by much?  can bad play fail?
//   does the winner use the intended arc (hire, specialise, espresso)?
// The best few are then handed to the full policy search, and every rule set comes with a scenario code
// that starts a fresh game with those rules in the browser.
'use strict';
const fs = require('fs');
const path = require('path');
const { Sim, Bot } = require('./load');
const { money, pct, med, table, search, genesText, seedList } = require('./lib');

const N = Bot.NEVER;
// The probe panel: contrasting ways to play. Genes not listed fall back to Solo's.
const PROBES = {
  Solo: 'solo', Steady: 'steady', Rush: 'rush',
  'Hire early': { hireQueue: 2, hireUtil: 0.3, hireMax: 3, hireGapMin: 20, spare: 5000, specialise: 1 },
  'Espresso first': { espressoSpare: 0 },
  'Espresso, then hire': { espressoSpare: 5000, hireQueue: 4, hireUtil: 0.5, hireMax: 3, hireGapMin: 30, spare: 10000, specialise: 1 },
  'Lean team': { hireQueue: 5, hireUtil: 0.6, hireMax: 2, hireGapMin: 45, fireUtil: 0.3, spare: 10000 },
  'Cake first': { cakeSpare: 0 },
  'Big team': { hireQueue: 3, hireUtil: 0.4, hireMax: 5, hireGapMin: 15, specialise: 1, brewer2Queue: 4, espresso2Queue: 4, espressoSpare: 10000, spare: 5000 }
};
function probeSpecs(r) {
  const out = Object.entries(PROBES).map(([name, g]) => ({ name, spec: typeof g === 'string' ? g : { name, genes: Object.assign({}, Bot.PRESETS.solo.genes, g) } }));
  for (let k = 1; k <= 2; k++) out.push({ name: 'Random ' + k, spec: { name: 'Random ' + k, genes: Bot.randomGenes(r) } });
  return out;
}

// ---------- the space ----------
const FLAT = Sim.flatRules(Sim.DEFAULT_RULES);
function loadSpace(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.entries(raw).filter(([k]) => !k.startsWith('_')).map(([key, d]) => {
    const keys = key.includes('*') ? Object.keys(FLAT).filter((k) => new RegExp('^' + key.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$').test(k)) : [key];
    if (!keys.length) throw new Error('No rules match ' + key);
    keys.forEach((k) => Sim.rulesWith({ [k]: d.scale ? 1 : (d.range ? d.range[0] : 0) }));    // validates the path
    return Object.assign({ key, keys }, d);
  });
}
function lhs(n, dims, r) {
  // one shuffled column of strata per dimension
  return Array.from({ length: dims }, () => {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    return p;
  });
}
function defaultOf(k) { const p = k.split('.'); let o = Sim.DEFAULT_RULES; for (const x of p) o = o[x]; return o; }
function sampleRules(space, i, n, strata, r) {
  const rules = {}, dims = {};
  space.forEach((d, j) => {
    const u = strata ? (strata[j][i] + r()) / n : r();
    const [lo, hi] = d.scale || d.range;
    const x = d.log ? lo * Math.pow(hi / lo, u) : lo + u * (hi - lo);
    dims[d.key] = d.int && d.range ? Math.round(x) : Math.round(x * 1000) / 1000;
    for (const k of d.keys) {
      let v = d.scale ? defaultOf(k) * x : x;
      v = d.int ? Math.round(v) : Math.round(v * 1000) / 1000;
      rules[k] = v;
    }
    if (d.with) for (const [k, how] of Object.entries(d.with)) rules[k] = how === 'same' ? rules[d.keys[0]] : how;
  });
  // keep only real changes so scenario codes stay short
  for (const k of Object.keys(rules)) if (rules[k] === defaultOf(k)) delete rules[k];
  Sim.rulesWith(rules);
  return { rules, dims };
}

// What the business is worth before anything happens: cash plus the resale value of any starting kit.
function baseline(rules) {
  const S = Sim.create(1, null, rules);
  return S.cash + S.items.reduce((v, i) => v + Math.floor(S.R.CAT[i.type].cost / 2), 0);
}

// ---------- scoring ----------
function judge(probes, base, rules) {
  const R = Sim.rulesWith(rules);
  const ranked = probes.slice().sort((a, b) => b.worth - a.worth), best = ranked[0], worst = ranked[ranked.length - 1];
  const solo = probes.find((p) => p.name === 'Solo');
  const typical = med(probes.map((p) => p.worth));
  const growth = (best.worth - base) / base, gap = (best.worth - typical) / base, spread = (best.worth - worst.worth) / base;
  const failRate = probes.filter((p) => p.worth < base).length / probes.length;
  const tags = [];
  let score;
  if (best.lastHour <= 0 || growth < 0) { tags.push('impossible'); score = Math.min(0, growth); }
  else {
    score = 1 + 0.5 * Math.min(growth, 1) + 2 * Math.min(gap, 0.75);
    if (best.staff > R.start.workers) { score += 0.3; tags.push('hire to grow'); }
    if (best.espresso >= 0.5 && !R.start.espresso) { score += 0.3; tags.push('espresso pays'); }
    if (R.start.espresso && best.espresso) tags.push('starts with espresso');
    if (best.name === 'Solo') { score -= 0.5; tags.push('stay small'); }
    if (failRate === 0) { score -= 0.6; tags.push('no way to lose'); }
    else if (failRate >= 0.3) tags.push('easy to lose');
    if (best.walked > 0.2) { score -= best.walked - 0.2; tags.push('overrun'); }
    if (gap > 0.3) tags.push('skill matters');
    if (best.minCash < 0.1 * base) tags.push('tight cash');
    if (growth > 1.5) { score -= 0.3; tags.push('runaway'); }
  }
  return { score: Math.round(score * 1000) / 1000, growth, gap, spread, failRate, best: best.name, bestWorth: best.worth, worst: worst.name, worstWorth: worst.worth, solo: solo ? solo.worth : null, typical, bestStaff: best.staff, bestEspresso: best.espresso, bestWalked: best.walked, tags };
}

// Spearman rank correlation between each sampled dimension and an outcome.
function spearman(xs, ys) {
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(xs), ry = rank(ys), n = xs.length, mx = (n - 1) / 2;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - mx); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - mx) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

async function explore(pool, o) {
  const n = +o.samples || 60, hours = +o.hours || 8, seeds = seedList(+o.seeds || 3), refine = o.refine === undefined ? 3 : +o.refine;
  const space = loadSpace(o.space || path.join(__dirname, 'space.json'));
  const r = Bot.rng(+o.searchSeed || 11), strata = o.plain ? null : lhs(n, space.length, r);
  const probes = probeSpecs(Bot.rng(5));
  const samples = [{ i: -1, rules: {}, dims: Object.fromEntries(space.map((d) => [d.key, d.scale ? 1 : defaultOf(d.keys[0])])) }];
  for (let i = 0; i < n; i++) samples.push(Object.assign({ i }, sampleRules(space, i, n, strata, r)));
  const t0 = Date.now();
  let done = 0;
  await Promise.all(samples.map(async (smp) => {
    const base = baseline(smp.rules);
    const res = await Promise.all(probes.map(async (p) => {
      const rs = await Promise.all(seeds.map((seed) => pool.run({ spec: p.spec, seed, hours, rules: smp.rules })));
      return { name: p.name, worth: med(rs.map((x) => x.worth)), lastHour: med(rs.map((x) => x.lastHour)), staff: med(rs.map((x) => x.workers)),
        espresso: rs.filter((x) => x.espressoAt >= 0).length / rs.length, walked: med(rs.map((x) => x.abandoned / Math.max(1, x.arrived))), minCash: med(rs.map((x) => x.minCash)) };
    }));
    smp.base = base; smp.probes = res; smp.judge = judge(res, base, smp.rules);
    smp.scenario = Sim.encode(Sim.create(1, null, smp.rules));
    done++;
    if (!o.quiet && (done % 5 === 0 || done === samples.length)) process.stderr.write('  ' + done + '/' + samples.length + ' rule sets · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's\n');
  }));
  const ref = samples[0], pool2 = samples.slice(1);
  const top = pool2.slice().sort((a, b) => b.judge.score - a.judge.score);
  // what drives outcomes
  const drivers = space.map((d) => ({
    key: d.key,
    growth: spearman(pool2.map((s) => s.dims[d.key]), pool2.map((s) => s.judge.growth)),
    gap: spearman(pool2.map((s) => s.dims[d.key]), pool2.map((s) => s.judge.gap)),
    interest: spearman(pool2.map((s) => s.dims[d.key]), pool2.map((s) => s.judge.score))
  })).sort((a, b) => Math.abs(b.growth) + Math.abs(b.interest) - Math.abs(a.growth) - Math.abs(a.interest));
  const counts = {}; pool2.forEach((s) => s.judge.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  // hand the most interesting few to the full policy search
  const refined = [];
  for (const s of top.slice(0, refine)) {
    if (!o.quiet) process.stderr.write('\nsearching policies for sample #' + s.i + ' (score ' + s.judge.score + ')\n');
    const res = await search(pool, Object.assign({ gens: 8, pop: 16, seeds: 4, holdout: 6 }, o, { rule: [] }), s.rules, !!o.quiet);
    const worth = med(res.heldRs.map((x) => x.worth));
    refined.push({ i: s.i, solvedWorth: worth, base: s.base, plan: genesText(res.best.g), genes: res.best.g, code: res.heldRs[0].code,
      presetBest: Math.max(...res.presetRows.map((p) => p.s.worth)) });
  }
  return { kind: 'explore', hours, seeds: seeds.length, n, probes: probes.map((p) => p.name), space: space.map((d) => d.key), spaceDefs: space.map((d) => ({ key: d.key, scale: !!d.scale })), reference: ref, samples: pool2, top: top.map((s) => s.i), drivers, counts, refined };
}

function describe(dims, defs) {
  // the sampled values furthest from the defaults, as plain text
  const parts = [];
  for (const { key: k, scale } of defs) {
    const v = dims[k], isScale = scale, def = isScale ? 1 : defaultOf(k.replace('*', Object.keys(Sim.DEFAULT_RULES.items)[0]));
    if (v === undefined) continue;
    const rel = def ? Math.abs(v - def) / Math.abs(def) : Math.abs(v);
    parts.push([rel, k, v, def]);
  }
  const scaled = new Set(defs.filter((d) => d.scale).map((d) => d.key));
  return parts.sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, k, v]) => {
    if (scaled.has(k)) return k.replace('.*.', ' ') + ' ×' + v.toFixed(2);
    if (k.includes('*')) return k.replace('.*.', ' ') + ' ' + v;
    if (/cash|Cost|cost|price/i.test(k)) return k + ' ' + money(v);
    return k + ' ' + v;
  }).join(' · ');
}

function printExplore(out) {
  const S = out.samples, byI = Object.fromEntries(S.map((s) => [s.i, s]));
  const ref = out.reference.judge;
  console.log('\nMonte Carlo exploration · ' + out.n + ' rule sets × ' + out.probes.length + ' policies × ' + out.seeds + ' seeds × ' + out.hours + 'h = ' + (out.n * out.probes.length * out.seeds) + ' games\n');
  console.log('Current rules for reference: best ' + ref.best + ' worth ' + money(ref.bestWorth) + ' from ' + money(out.reference.base) + ' · score ' + ref.score + ' · ' + (ref.tags.join(', ') || '-') + '\n');
  console.log('How the sampled worlds turned out: ' + Object.entries(out.counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => t + ' ' + c).join(' · ') + '\n');
  const rows = out.top.slice(0, 10).map((i) => byI[i]);
  console.log('Most interesting rule sets\n');
  console.log(table(rows, [
    { h: '#', f: (s) => s.i }, { h: 'score', f: (s) => s.judge.score.toFixed(2) },
    { h: 'start', f: (s) => money(s.base) }, { h: 'best', f: (s) => s.judge.best, left: true }, { h: 'worth', f: (s) => money(s.judge.bestWorth) },
    { h: 'typical', f: (s) => money(s.judge.typical) }, { h: 'worst', f: (s) => money(s.judge.worstWorth) }, { h: 'lose', f: (s) => pct(s.judge.failRate) },
    { h: 'tags', f: (s) => s.judge.tags.join(', '), left: true }, { h: 'biggest changes from today', f: (s) => describe(s.dims, out.spaceDefs), left: true }]));
  console.log('\nWhat drives outcomes (rank correlation across all samples; + means more of it helps)\n');
  console.log(table(out.drivers.slice(0, 12), [
    { h: 'rule', f: (d) => d.key, left: true }, { h: 'growth', f: (d) => (d.growth >= 0 ? '+' : '') + d.growth.toFixed(2) },
    { h: 'skill gap', f: (d) => (d.gap >= 0 ? '+' : '') + d.gap.toFixed(2) }, { h: 'interest', f: (d) => (d.interest >= 0 ? '+' : '') + d.interest.toFixed(2) }]));
  for (const ref2 of out.refined) {
    const s = byI[ref2.i];
    console.log('\n#' + ref2.i + ' · searched policy worth ' + money(ref2.solvedWorth) + ' from ' + money(ref2.base) + ' (best preset ' + money(ref2.presetBest) + ')');
    console.log('  rules: ' + Object.entries(s.rules).map(([k, v]) => k + '=' + v).join(' '));
    console.log('  plan: ' + ref2.plan.join('; '));
    console.log('  scenario (play it yourself): ' + s.scenario);
    console.log('  solved run (watch it):       ' + ref2.code);
  }
  if (!out.refined.length) rows.slice(0, 3).forEach((s) => console.log('\n#' + s.i + ' scenario: ' + s.scenario));
}

function toCSV(out) {
  const keys = out.space, cols = ['sample', 'score', 'tags', 'start', 'best', 'bestWorth', 'typical', 'worstWorth', 'growth', 'gap', 'failRate'].concat(keys).concat(['scenario']);
  const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
  return [cols.join(',')].concat(out.samples.map((s) => [s.i, s.judge.score, s.judge.tags.join(' '), s.base, s.judge.best, s.judge.bestWorth, s.judge.typical, s.judge.worstWorth,
    s.judge.growth.toFixed(3), s.judge.gap.toFixed(3), s.judge.failRate.toFixed(2)].concat(keys.map((k) => s.dims[k])).concat([s.scenario]).map(esc).join(','))).join('\n');
}

module.exports = { explore, printExplore, toCSV, loadSpace, sampleRules };
