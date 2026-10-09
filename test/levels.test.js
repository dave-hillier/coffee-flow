// node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Sim, Levels, Bot } = require('../headless/load');

// A way through each level on its own seed: a preset, or genes and a layout picked by hand. If balance changes
// break one of these, the level has probably become unwinnable.
const NEVER = Bot.NEVER;
const REFERENCE = {
  kiosk: 'steady',
  rush: 'rush',
  corner: { genes: { espressoSpare: 0, cakeSpare: NEVER, hireQueue: 3, hireUtil: 0.6, hireMax: 2, hireGapMin: 60, specialise: 0, spare: 5000, standingFirst: 0,
    researchSerial: 1, reorderPoint: 50, reorderQty: 4, storeSpare: NEVER, brewer2Queue: NEVER, espresso2Queue: NEVER, till2Queue: NEVER, crew: 1 },
    layout: { till: [[4, 8, 0]], pickup: [[6, 8, 0]], brewer: [[2, 6, 0]], grinder: [[3, 6, 0]], espresso: [[7, 6, 0]] } },
  high: { genes: { espressoSpare: 0, cakeSpare: NEVER, hireQueue: 1, hireUtil: 0, hireMax: 4, hireGapMin: 5, specialise: 1, spare: 0, standingFirst: 0, researchSerial: 1,
    reorderPoint: 80, reorderQty: 6, storeSpare: NEVER, brewer2Queue: 3, espresso2Queue: 2, till2Queue: 5, crew: 3, closeToBuild: 1 },
    layout: { till: [[4, 8, 0], [1, 8, 0]], pickup: [[7, 8, 0]], brewer: [[0, 5, 0], [1, 5, 0]], grinder: [[2, 5, 0], [3, 5, 0]], espresso: [[4, 5, 0], [6, 5, 0]] } },
  flagship: { genes: { espressoSpare: 0, cakeSpare: 20000, hireQueue: 2, hireUtil: 0.5, hireMax: 5, hireGapMin: 15, specialise: 0, spare: 5000, standingFirst: 1, researchSerial: 1,
    reorderPoint: 80, reorderQty: 6, storeSpare: NEVER, brewer2Queue: 3, espresso2Queue: 3, till2Queue: 5, crew: 3, closeToBuild: 1 } }
};

for (const L of Levels.LEVELS) {
  test('level ' + L.n + ', ' + L.title + ', can be won', () => {
    const r = Bot.trial(REFERENCE[L.id], L.seed, 20, {}, L);
    assert.ok(r.end && r.end.won, L.id + ': ' + JSON.stringify(r.end) + ', goals met ' + r.goals);
  });
}

test('every level starts from an empty room and has goals', () => {
  for (const L of Levels.LEVELS) {
    const S = Sim.create(L.seed, null, {}, L);
    assert.strictEqual(S.items.length, 0, L.id);
    assert.ok(L.goals.length, L.id);
    assert.ok(Sim.inRoom(S, S.door), L.id + ' back door is in the room');
  }
});

test('the room bounds building, and its back door sits in its back corner', () => {
  const S = Sim.create(1, null, { 'room.x0': 2, 'room.x1': 7, 'room.z0': 6 });
  assert.deepStrictEqual(S.door, { x: 7, z: 6 });
  assert.match(Sim.act(S, 'place', 'brewer', 1, 7, 0), /Outside the shop/);
  assert.match(Sim.act(S, 'place', 'brewer', 3, 5, 0), /Outside the shop/);
  assert.match(Sim.act(S, 'place', 'brewer', 7, 6, 0), /Keep the back door clear/);
  assert.strictEqual(Sim.act(S, 'place', 'brewer', 3, 6, 0), null);
  assert.throws(() => Sim.create(1, null, { 'room.x0': 6 }), /room must cover/);
});

test('a shop only sells what its level allows, and only researches its lanes', () => {
  const S = Sim.create(1, null, { 'allow.items': 'till pickup brewer', 'allow.lanes': 'counter' });
  assert.match(Sim.act(S, 'place', 'grinder', 9, 0, 0), /Not for this shop/);
  assert.match(Sim.act(S, 'research', 'espresso', 1), /Not for this shop/);
  assert.match(Sim.act(S, 'plan', 'burrs'), /Not for this shop/);
  assert.strictEqual(Sim.act(S, 'research', 'rail1', 1), null);
});

// a shop with no money and nothing to sell: wages and rent take it 20p further into the red every minute
function broke(over) {
  return Sim.create(1, null, Object.assign({ startCash: 0, 'fail.overdraft': 100000, 'fail.overdrawnMins': 30 }, over));
}
const runMins = (S, n) => { for (let t = 0; t < n * 60 && !S.end; t++) Sim.step(S); };

test('overdrawn for too long, the bank closes the shop', () => {
  const S = broke();
  runMins(S, 60);
  assert.ok(S.end && !S.end.won, 'lost');
  assert.strictEqual(S.end.why, 'bankrupt');
  assert.strictEqual(S.end.t, 30 * 60, 'in the red from the first minute, so out at the thirtieth');
});

test('going past the overdraft limit closes the shop at once', () => {
  const S = broke({ 'fail.overdraft': 100 });
  runMins(S, 10);
  assert.ok(S.end && S.end.why === 'bankrupt');
  assert.strictEqual(S.end.t, 6 * 60, 'the minute it passes £1 overdrawn');
});

test('the overdrawn timer runs back down while cash is positive', () => {
  const S = broke();
  runMins(S, 20);
  assert.ok(S.judge.red > 10);
  S.cash += 100000;
  runMins(S, 40);
  assert.strictEqual(S.end, null);
  assert.strictEqual(S.judge.red, 0);
});

test('poor service for too long ends the game; good service winds the timer back', () => {
  const S = Sim.create(1, null, { 'fail.sat': 0.4, 'fail.satMins': 20, 'fail.after': 0 });
  S.st.sat = 0.3; runMins(S, 10);
  assert.strictEqual(S.judge.poor, 10);
  S.st.sat = 0.6; runMins(S, 5);
  assert.strictEqual(S.judge.poor, 5);
  S.st.sat = 0.3; runMins(S, 30);
  assert.ok(S.end && S.end.why === 'service');
});

test('service is only judged once enough customers have finished', () => {
  const S = Sim.create(1, null, { 'fail.sat': 0.4, 'fail.satMins': 5, 'fail.after': 10 });
  S.st.sat = 0.1; runMins(S, 30);
  assert.strictEqual(S.end, null);
});

const testLevel = (goals) => ({ id: 'test', n: 0, title: 'Test', seed: 1, rules: {}, goals });

test('goals are met in order, then the level is won and the clock stops', () => {
  const L = testLevel([{ kind: 'cash', n: 70000, title: 'Cash' }, { kind: 'menu', p: 'filter', title: 'Filter' }]);
  const S = Sim.create(1, null, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1 }, L);
  runMins(S, 2);
  assert.strictEqual(S.goal, 0, 'filter is on the menu, but cash comes first');
  S.cash = 80000; runMins(S, 2);
  assert.ok(S.end && S.end.won);
  const t = S.t; Sim.step(S);
  assert.strictEqual(S.t, t, 'nothing moves once the game is over');
  assert.match(Sim.act(S, 'open'), /over/);
});

test('hands off: the hour starts again after any action', () => {
  const S = Sim.create(1, null, {}, testLevel([{ kind: 'handsOff', mins: 30, walkPct: 0, title: 'Hands off' }]));
  runMins(S, 20);
  assert.strictEqual(S.judge.streak, 19);
  Sim.act(S, 'order', 1); runMins(S, 1);
  assert.strictEqual(S.judge.streak, 0);
});

test('a level travels in its replay code and rebuilds exactly', () => {
  const L = Levels.byId('rush'), r = Bot.trial('rush', L.seed, 3, {}, L);
  const d = Sim.decode(r.code);
  assert.strictEqual(d.level, 'rush');
  assert.deepStrictEqual(d.rules, {});
  const S = Sim.create(d.seed, d.log, d.rules, Levels.byId(d.level));
  for (let t = 0; t < r.t; t++) Sim.step(S);
  assert.strictEqual(Sim.hash(S), r.hash);
});
