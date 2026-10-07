// node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Sim, Bot } = require('../headless/load');

test('a replay code rebuilds the exact game', () => {
  for (const key of Object.keys(Bot.PRESETS)) {
    const r = Bot.trial(key, 3, 4);
    const d = Sim.decode(r.code), S = Sim.create(d.seed, d.log, d.rules);
    for (let t = 0; t < 4 * 3600; t++) Sim.step(S);
    assert.strictEqual(Sim.hash(S), r.hash, key);
  }
});

test('rule overrides travel in the replay code', () => {
  const rules = { startCash: 90000, 'demand.growAt': 0.45, 'items.espresso.cost': 25000 };
  const r = Bot.trial('rush', 2, 3, rules), d = Sim.decode(r.code);
  assert.deepStrictEqual(d.rules, rules);
  const S = Sim.create(d.seed, d.log, d.rules);
  for (let t = 0; t < 3 * 3600; t++) Sim.step(S);
  assert.strictEqual(Sim.hash(S), r.hash);
});

test('default rules match the shipped game', () => {
  const S = Sim.create(1);
  assert.strictEqual(S.cash, 60000);
  assert.strictEqual(S.R.CAT.espresso.cost, 38000);
  assert.strictEqual(Sim.decode(Sim.encode(S)).current, true);
});

test('unknown or mistyped rules are refused', () => {
  assert.throws(() => Sim.rulesWith({ startcash: 1 }), /Unknown rule/);
  assert.throws(() => Sim.rulesWith({ startCash: '1' }), /must be a number/);
});

test('standing workers never share a square', () => {
  const S = Sim.create(7); S.cash += 200000;
  ['hire', 'hire', 'hire'].forEach((a) => Sim.act(S, a));
  Sim.act(S, 'place', 'till', 4, 3, 0); Sim.act(S, 'place', 'pickup', 7, 3, 0); Sim.act(S, 'place', 'brewer', 2, 0, 0);
  Sim.act(S, 'place', 'grinder', 9, 0, 0); Sim.act(S, 'place', 'espresso', 6, 0, 0);
  S.items.forEach((it) => S.workers.forEach((w) => Sim.act(S, 'build', w.id, it.id)));
  let clashes = 0;
  for (let t = 0; t < 20000; t++) {
    if (t === 2000) { Sim.act(S, 'open'); S.st.demand = 1.5; }
    Sim.step(S);
    const seen = new Set();
    for (const w of S.workers) { if (w.path.length || w.prog || w.z >= 10) continue; const k = w.x + ',' + w.z; if (seen.has(k)) clashes++; seen.add(k); }
  }
  assert.strictEqual(clashes, 0);
});

test('beans run out without orders, and a standing order keeps a shop going', () => {
  const run = (auto) => {
    const S = Sim.create(4, null, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.demand': 0.5, 'start.sacks': 1, 'research.topics.standing.work': 0 });
    Sim.act(S, 'open'); if (auto) Sim.act(S, 'auto', 40, 3);
    for (let t = 0; t < 8 * 3600; t++) Sim.step(S);
    return S;
  };
  const dry = run(false), fed = run(true);
  // 1 sack at the door + a full hopper = 60 cups, then nothing
  assert.ok(dry.st.beansUsed <= 60, 'used ' + dry.st.beansUsed);
  assert.ok(dry.st.dryMins > 0);
  assert.ok(fed.st.served > dry.st.served, fed.st.served + ' vs ' + dry.st.served);
  assert.ok(fed.st.groundsOut > 0, 'grounds were taken out');
  assert.strictEqual(fed.hist.t.length, 480);
});

test('a bean store fills from the door and refills hoppers', () => {
  const S = Sim.create(9, null, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.store': 1, 'start.workers': 2, 'start.sacks': 6, 'research.topics.standing.work': 0 });
  Sim.act(S, 'open'); Sim.act(S, 'auto', 80, 4);
  let stocked = 0, fromStore = 0;
  for (let t = 0; t < 4 * 3600; t++) {
    const before = S.items.find((i) => i.type === 'store').sacks;
    Sim.step(S);
    const after = S.items.find((i) => i.type === 'store').sacks;
    if (after > before) stocked++; if (after < before) fromStore++;
  }
  assert.ok(stocked > 0, 'workers stocked the store');
  assert.ok(fromStore > 0, 'hoppers were refilled from the store');
  assert.ok(S.hist.store.some((v) => v > 0));
  assert.match(Sim.whyNotRemove(S, S.items.find((i) => i.type === 'store')) || 'empty', /sacks|empty|use/);
});

test('research: splitting shares the pace, so one at a time finishes the first sooner and the rest no later', () => {
  const run = (plan) => {
    const S = Sim.create(1);
    plan(S);
    for (let t = 0; t < 4 * 3600; t++) { Sim.step(S); if (S.research.espresso.complete && S.research.cake.weight === 0 && !S.research.cake.complete && plan.serial) Sim.act(S, 'research', 'cake', 1); }
    return S;
  };
  const serial = (S) => Sim.act(S, 'research', 'espresso', 1); serial.serial = true;
  const parallel = (S) => { Sim.act(S, 'research', 'espresso', 1); Sim.act(S, 'research', 'cake', 1); };
  const a = run(serial), b = run(parallel);
  assert.ok(a.research.espresso.finished < b.research.espresso.finished, 'focus finishes espresso first');
  const allDone = (S) => Math.max(S.research.espresso.finished, S.research.cake.finished);
  assert.ok(allDone(a) <= allDone(b) + 60, 'and both are done no later: ' + allDone(a) + ' vs ' + allDone(b));
  assert.ok(!b.st.researchLost && !a.st.researchLost, 'no capacity lost by default');
  // with the optional switching cost, splitting also loses capacity
  const c = Sim.create(1, null, { 'research.switchPct': 25 }); parallel(c);
  for (let t = 0; t < 3600; t++) Sim.step(c);
  assert.ok(c.st.researchLost > 0);
  assert.match(Sim.act(Sim.create(1), 'place', 'grinder', 9, 0, 0), /Needs research/);
});

test('cumulative flow lines stay ordered and their gaps equal stock at each stage', () => {
  const S = Sim.create(4, null, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.workers': 2, 'start.demand': 0.8, 'research.topics.standing.work': 0 });
  Sim.act(S, 'open'); Sim.act(S, 'auto', 40, 3);
  for (let t = 0; t < 4 * 3600; t++) Sim.step(S);
  const H = S.hist;
  for (let i = 0; i < H.t.length; i++) {
    assert.ok(H.cArrived[i] >= H.cOrdered[i] && H.cOrdered[i] >= H.cClaimed[i] && H.cClaimed[i] >= H.cMade[i] && H.cMade[i] >= H.cDone[i]);
    assert.strictEqual(H.cArrived[i] - H.cDone[i], H.queue[i] + H.rail[i] + H.making[i] + H.ready[i], 'minute ' + i);
  }
  assert.ok(Object.values(S.acts)[0].segs.length > 10);
});
