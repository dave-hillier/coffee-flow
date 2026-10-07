#!/usr/bin/env node
// Coffee Flow headless runner. Uses the same src/sim.js and src/bot.js as the browser game.
//
//   node headless/cli.js rules                          list every balance rule and its default
//   node headless/cli.js play   --bot steady --seed 3   play one game, print the hour-by-hour story and a replay code
//   node headless/cli.js replay CF1-...                 re-run a replay code (from the game or the solver)
//   node headless/cli.js bench  --seeds 8               compare the preset bots
//   node headless/cli.js solve  --gens 10 --pop 20      search for the best policy
//   node headless/cli.js sweep  --rule demand.growAt=0.55,0.45,0.35   best achievable result for each rule value
//   node headless/cli.js explore --samples 60 --refine 3   Monte Carlo: random rule sets and setups, ranked by how interesting they are
//
// Common options: --hours 8  --seeds 6  --rule key=value (repeatable)  --json  --workers N  --out file.json
'use strict';
const fs = require('fs');
const path = require('path');
const { Sim, Bot } = require('./load');
const { Pool } = require('./pool');

// ---------- args ----------
function parseArgs(argv) {
  const o = { _: [], rule: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (k === 'rule') o.rule.push(v); else o[k] = v;
  }
  return o;
}
const num = (v) => (v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v);
function rulesFrom(list) {
  const r = {};
  for (const s of list) { const i = s.indexOf('='); if (i < 0) throw new Error('Rules look like key=value, got ' + s); r[s.slice(0, i)] = num(s.slice(i + 1)); }
  Sim.rulesWith(r);   // validates names and types
  return r;
}

const { money, pct, med, table, summarise, verdict, COLS, evalSpec, seedList, search, genesText } = require('./lib');
const { explore, printExplore, toCSV } = require('./explore');

// ---------- commands ----------
async function cmdBench(o, pool, rules) {
  const hours = +o.hours || 8, seeds = seedList(+o.seeds || 6);
  const start = Sim.rulesWith(rules).startCash, rows = [];
  for (const [k, p] of Object.entries(Bot.PRESETS)) rows.push({ name: p.name, s: summarise(await evalSpec(pool, k, seeds, hours, rules), start) });
  return { kind: 'bench', hours, seeds: seeds.length, rules, rows };
}

async function cmdSolve(o, pool, rules) {
  const res = await search(pool, o, rules);
  const s = summarise(res.heldRs, res.start);
  return Object.assign({ kind: 'solve', rules, s, verdict: verdict(s), genes: res.best.g, plan: genesText(res.best.g), code: res.heldRs[0].code }, res, { best: undefined, heldRs: undefined, bestScore: res.best.score });
}

async function cmdSweep(o, pool) {
  // cartesian product of every --rule key=a,b,c
  const axes = o.rule.map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).split(',').map(num)]; });
  let combos = [{}];
  for (const [k, vs] of axes) combos = combos.flatMap((c) => vs.map((v) => Object.assign({}, c, { [k]: v })));
  const rows = [];
  for (const rules of combos) {
    Sim.rulesWith(rules);
    process.stderr.write('\n' + (Object.entries(rules).map(([k, v]) => k + '=' + v).join(' ') || 'defaults') + '\n');
    const res = await search(pool, Object.assign({ gens: 6, pop: 16, seeds: 4, holdout: 6 }, o, { rule: [] }), rules);
    const s = summarise(res.heldRs, res.start), bestPreset = res.presetRows.slice().sort((a, b) => b.s.worth - a.s.worth)[0];
    rows.push({ rules, s, verdict: verdict(s), bestPreset: bestPreset.name + ' ' + money(bestPreset.s.worth), plan: genesText(res.best.g), code: res.heldRs[0].code });
  }
  return { kind: 'sweep', rows };
}

function cmdPlay(o, rules) {
  const spec = o.bot || 'steady', seed = +o.seed || 1, hours = +o.hours || 8;
  const S = Sim.create(seed, null, rules), bot = Bot.create(spec), story = [];
  const say = (m) => story.push([S.t, m]);
  const rows = [];
  for (let t = 0; t < hours * 3600; t++) {
    Bot.tick(bot, S, say); Sim.step(S);
    if (S.t % 3600 === 0) rows.push({ h: S.t / 3600, cash: S.cash, served: S.st.served, walked: S.st.abandoned, sat: S.st.sat, demand: S.st.demand, rate: Sim.rate(S), staff: S.workers.length, kit: S.items.filter((i) => i.built).map((i) => i.type).join(' ') });
  }
  return { kind: 'play', name: bot.name, seed, hours, rules, story, rows, code: Sim.encode(S), hash: Sim.hash(S) };
}

function cmdReplay(o) {
  const code = o._[1]; if (!code) throw new Error('Give a replay code: node headless/cli.js replay CF1-...');
  const d = Sim.decode(code);
  const last = d.log.length ? d.log[d.log.length - 1][0] : 0, ticks = o.hours ? +o.hours * 3600 : last + 1;
  const S = Sim.create(d.seed, d.log, d.rules);
  for (let t = 0; t < ticks; t++) Sim.step(S);
  const T = Sim.create(d.seed, d.log, d.rules);
  for (let t = 0; t < ticks; t++) Sim.step(T);
  return { kind: 'replay', seed: d.seed, rules: d.rules, version: d.version, current: d.current, actions: d.log.length, ticks,
    cash: S.cash, served: S.st.served, walked: S.st.abandoned, sat: S.st.sat, hash: Sim.hash(S), deterministic: Sim.hash(S) === Sim.hash(T) };
}

// ---------- printing ----------
function print(out) {
  const rr = (r) => Object.keys(r || {}).length ? Object.entries(r).map(([k, v]) => k + '=' + v).join(' ') : 'default rules';
  if (out.kind === 'rules') { console.log(Object.entries(out.rules).map(([k, v]) => k.padEnd(30) + JSON.stringify(v)).join('\n')); return; }
  if (out.kind === 'bench') {
    console.log('Preset bots · ' + out.seeds + ' games × ' + out.hours + 'h · ' + rr(out.rules) + '\n');
    console.log(table(out.rows, COLS)); return;
  }
  if (out.kind === 'play') {
    console.log(out.name + ' · seed ' + out.seed + ' · ' + rr(out.rules) + '\n');
    out.story.forEach(([t, m]) => console.log('  ' + String(Math.floor(t / 3600)).padStart(2) + 'h' + String(Math.floor(t / 60) % 60).padStart(2, '0') + '  ' + m));
    console.log('\n' + table(out.rows, [
      { h: 'hour', f: (r) => r.h }, { h: 'cash', f: (r) => money(r.cash) }, { h: 'served', f: (r) => r.served }, { h: 'walked', f: (r) => r.walked },
      { h: 'sat', f: (r) => pct(r.sat) }, { h: 'demand', f: (r) => r.demand.toFixed(2) }, { h: 'arrivals/h', f: (r) => r.rate.toFixed(0) }, { h: 'staff', f: (r) => r.staff }, { h: 'kit', f: (r) => r.kit, left: true }]));
    console.log('\nreplay code (paste into the game\'s Replay box):\n' + out.code); return;
  }
  if (out.kind === 'replay') {
    console.log('seed ' + out.seed + ' · ' + rr(out.rules) + ' · ' + out.actions + ' actions · ran ' + out.ticks + ' ticks' + (out.current ? '' : ' · WARNING: made with sim version ' + out.version + ', this is ' + Sim.VERSION));
    console.log('cash ' + money(out.cash) + ' · served ' + out.served + ' · walked out ' + out.walked + ' · satisfaction ' + pct(out.sat));
    console.log('state hash ' + out.hash + ' · ' + (out.deterministic ? 'two runs match' : 'RUNS DIFFER')); return;
  }
  if (out.kind === 'solve') {
    console.log('\nBest policy found · ' + rr(out.rules) + ' · ' + out.evaluated + ' policies tried on ' + out.train + ' games each, checked on ' + out.held + ' new games\n');
    console.log(table([{ name: 'solved', s: out.s }].concat(out.presetRows), COLS));
    console.log('\nWhat it does:\n' + out.plan.map((l) => '  · ' + l).join('\n'));
    console.log('\nVerdict: ' + out.verdict + '\n\nreplay code for a held-out game:\n' + out.code); return;
  }
  if (out.kind === 'explore') { printExplore(out); return; }
  if (out.kind === 'sweep') {
    console.log('\nBest achievable per rule set (searched policy, checked on new games)\n');
    console.log(table(out.rows, [
      { h: 'rules', f: (r) => rr(r.rules), left: true }, { h: 'worth', f: (r) => money(r.s.worth) }, { h: 'cash', f: (r) => money(r.s.cash) },
      { h: 'lowest', f: (r) => money(r.s.minCash) }, { h: 'last hr', f: (r) => money(r.s.lastHour) }, { h: 'espresso', f: (r) => r.s.espresso + '/' + r.s.n },
      { h: 'staff', f: (r) => r.s.staff }, { h: 'verdict', f: (r) => r.verdict, left: true }, { h: 'best preset', f: (r) => r.bestPreset, left: true }]));
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2)), cmd = o._[0] || 'help';
  const rules = rulesFrom(cmd === 'sweep' ? [] : o.rule);
  let out, pool;
  try {
    if (cmd === 'rules') out = { kind: 'rules', rules: Sim.flatRules(Sim.DEFAULT_RULES) };
    else if (cmd === 'play') out = cmdPlay(o, rules);
    else if (cmd === 'replay') out = cmdReplay(o);
    else if (['bench', 'solve', 'sweep', 'explore'].includes(cmd)) {
      pool = new Pool(+o.workers || undefined);
      out = cmd === 'bench' ? await cmdBench(o, pool, rules) : cmd === 'solve' ? await cmdSolve(o, pool, rules) : cmd === 'sweep' ? await cmdSweep(o, pool) : await explore(pool, o);
    } else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); return; }
  } finally { if (pool) await pool.close(); }
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(out, null, 2));
  if (o.csv && out.kind === 'explore') fs.writeFileSync(o.csv, toCSV(out));
  if (o.json) console.log(JSON.stringify(out, null, 2)); else print(out);
}
main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
