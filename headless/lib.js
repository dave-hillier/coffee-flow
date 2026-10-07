// Shared helpers for the headless commands: formatting, scoring and the policy search.
'use strict';
const { Sim, Bot } = require('./load');

// ---------- formatting ----------
const money = (p) => (p < 0 ? '-£' : '£') + (Math.abs(p) / 100).toFixed(0);
const pct = (x) => Math.round(x * 100) + '%';
const med = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2; };
function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.h.length, ...rows.map((r) => String(c.f(r)).length)));
  const line = (cells) => cells.map((s, i) => (cols[i].left ? String(s).padEnd(w[i]) : String(s).padStart(w[i]))).join('  ');
  return [line(cols.map((c) => c.h)), w.map((n) => '─'.repeat(n)).join('  ')].concat(rows.map((r) => line(cols.map((c) => c.f(r))))).join('\n');
}
function summarise(rs, start) {
  return {
    worth: med(rs.map((r) => r.worth)), cash: med(rs.map((r) => r.finalCash)), lo: Math.min(...rs.map((r) => r.worth)), hi: Math.max(...rs.map((r) => r.worth)),
    minCash: med(rs.map((r) => r.minCash)), debtGames: rs.filter((r) => r.minCash < 0).length,
    lastHour: med(rs.map((r) => r.lastHour)), served: med(rs.map((r) => r.served)), walked: med(rs.map((r) => r.abandoned / Math.max(1, r.arrived))),
    sat: med(rs.map((r) => r.sat)), demand: med(rs.map((r) => r.demand)), staff: med(rs.map((r) => r.workers)), dry: med(rs.map((r) => r.dryMins || 0)),
    espresso: rs.filter((r) => r.espressoAt >= 0).length, n: rs.length, start
  };
}
function verdict(s) {
  if (s.lastHour > 0 && s.worth >= s.start) return 'growing';
  if (s.lastHour > 0) return 'paying back';
  return 'losing money';
}
const COLS = [
  { h: 'policy', f: (r) => r.name, left: true },
  { h: 'worth', f: (r) => money(r.s.worth) },
  { h: 'range', f: (r) => money(r.s.lo) + '..' + money(r.s.hi) },
  { h: 'cash', f: (r) => money(r.s.cash) },
  { h: 'lowest', f: (r) => money(r.s.minCash) },
  { h: 'last hr', f: (r) => money(r.s.lastHour) },
  { h: 'served', f: (r) => Math.round(r.s.served) },
  { h: 'walked', f: (r) => pct(r.s.walked) },
  { h: 'sat', f: (r) => pct(r.s.sat) },
  { h: 'staff', f: (r) => r.s.staff },
  { h: 'dry min', f: (r) => Math.round(r.s.dry) },
  { h: 'espresso', f: (r) => r.s.espresso + '/' + r.s.n },
  { h: 'verdict', f: (r) => verdict(r.s), left: true }
];

// Objective: business worth (cash + resale value of kit), with debt punished because a real shop can't run on it.
function score(rs) {
  const s = summarise(rs, 0);
  return s.worth - 2 * med(rs.map((r) => Math.max(0, -r.minCash)));
}

async function evalSpec(pool, spec, seeds, hours, rules) {
  return Promise.all(seeds.map((seed) => pool.run({ spec, seed, hours, rules })));
}
const seedList = (n, from) => Array.from({ length: n }, (_, i) => (from || 1) + i);

async function search(pool, o, rules, quiet) {
  const hours = +o.hours || 8, pop = +o.pop || 20, gens = +o.gens || 10, elite = Math.max(2, Math.round(pop / 5));
  const train = seedList(+o.seeds || 5), held = seedList(+o.holdout || 8, 1001);
  const r = Bot.rng(+o.searchSeed || 7), cache = new Map();
  const key = (g) => JSON.stringify(g);
  async function fitness(g) {
    const k = key(g); if (cache.has(k)) return cache.get(k);
    const p = evalSpec(pool, { genes: g }, train, hours, rules).then((rs) => ({ g, rs, score: score(rs) }));
    cache.set(k, p); return p;
  }
  let popn = Object.values(Bot.PRESETS).map((p) => Object.assign({}, p.genes));
  while (popn.length < pop) popn.push(Bot.randomGenes(r));
  let best = null; const t0 = Date.now(); const history = [];
  for (let gen = 0; gen < gens; gen++) {
    const scored = (await Promise.all(popn.map(fitness))).sort((a, b) => b.score - a.score);
    if (!best || scored[0].score > best.score) best = scored[0];
    history.push({ gen, best: scored[0].score, median: med(scored.map((x) => x.score)) });
    if (!quiet) process.stderr.write('  generation ' + String(gen + 1).padStart(2) + '/' + gens + '  best worth ' + money(scored[0].score).padStart(6) + '  median ' + money(med(scored.map((x) => x.score))).padStart(6) + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's\n');
    const parents = scored.slice(0, elite).map((x) => x.g);
    const next = parents.slice();
    while (next.length < pop) {
      const a = parents[Math.floor(r() * parents.length)], b = scored[Math.floor(r() * Math.min(scored.length, elite * 2))].g;
      const child = {}; for (const k in Bot.GENES) child[k] = r() < 0.5 ? a[k] : b[k];
      next.push(Bot.mutate(child, r, 0.25));
    }
    popn = next;
  }
  // Confirm on games the search never saw.
  const start = Sim.rulesWith(rules).startCash;
  const heldRs = await Promise.all(held.map((seed) => pool.run({ spec: { genes: best.g }, seed, hours, rules, keepCode: seed === held[0] })));
  const presetRows = [];
  for (const [k, p] of Object.entries(Bot.PRESETS)) presetRows.push({ name: p.name, s: summarise(await evalSpec(pool, k, held, hours, rules), start) });
  return { best, heldRs, start, hours, train: train.length, held: held.length, history, presetRows, evaluated: cache.size };
}

function genesText(g) {
  const N = Bot.NEVER, m = (v) => money(v);
  const lines = [];
  lines.push(g.espressoSpare === N ? 'never buys espresso' : 'buys grinder + espresso once it has ' + m(g.espressoSpare) + ' to spare');
  lines.push(g.cakeSpare === N ? 'never buys cake' : 'buys cake display with ' + m(g.cakeSpare) + ' to spare');
  ['brewer', 'espresso', 'till'].forEach((t) => { const q = g[t + '2Queue']; if (q !== N) lines.push('adds a second ' + t + ' at a queue of ' + q); });
  lines.push(g.hireQueue === N ? 'never hires' : 'hires up to ' + g.hireMax + ' staff when the queue hits ' + g.hireQueue + ' and staff are ' + pct(g.hireUtil) + '+ busy, at most every ' + g.hireGapMin + ' min, keeping ' + m(g.spare) + ' back');
  if (g.fireUtil !== N) lines.push('lets staff go below ' + pct(g.fireUtil) + ' busy');
  lines.push(g.specialise ? 'splits roles: till vs making' : 'everyone covers every station');
  lines.push(g.storeSpare === N ? 'keeps sacks at the door' : 'marks out a stock area with ' + m(g.storeSpare) + ' to spare');
  lines.push(g.researchSerial ? 'researches one topic at a time' : 'researches everything it wants at once');
  lines.push('standing order of ' + g.reorderQty + ' sacks when beans drop below ' + g.reorderPoint + ' cups');
  lines.push('builds with ' + (g.crew >= 3 ? 'everyone' : g.crew + ' worker' + (g.crew > 1 ? 's' : '')) + ' once open' + (g.closeToBuild ? ', closes while espresso goes in' : ''));
  if (g.dropFilter) lines.push('drops filter once espresso is on');
  return lines;
}


module.exports = { money, pct, med, table, summarise, verdict, COLS, score, evalSpec, seedList, search, genesText };
