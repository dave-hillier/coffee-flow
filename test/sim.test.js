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

for (const type of ['stock', 'store']) {
  test(type + ' storage fills from the door and refills hoppers', () => {
    const S = Sim.create(9, null, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, ['start.' + type]: 1, 'start.workers': 2, 'start.sacks': 6, 'research.topics.standing.work': 0 });
    Sim.act(S, 'open'); Sim.act(S, 'auto', 80, 4);
    const shelf = () => S.items.find((i) => i.type === type);
    let stocked = 0, fromStore = 0;
    for (let t = 0; t < 4 * 3600; t++) {
      const before = shelf().sacks;
      Sim.step(S);
      const after = shelf().sacks;
      if (after > before) stocked++; if (after < before) fromStore++;
    }
    assert.ok(stocked > 0, 'workers stocked it');
    assert.ok(fromStore > 0, 'hoppers were refilled from it');
    assert.ok(S.hist.store.some((v) => v > 0));
    assert.match(Sim.whyNotRemove(S, shelf()) || 'empty', /sacks|empty|use/);
  });
}

test('a stock area is free, needs no research and is ready at once', () => {
  const S = Sim.create(1);
  const cash = S.cash;
  assert.strictEqual(Sim.act(S, 'place', 'stock', 0, 0, 0), null);
  const it = S.items.find((i) => i.type === 'stock');
  assert.ok(it.built, 'no crate to build');
  assert.strictEqual(S.cash, cash);
});

test('stock tiles can be laid as a block, as long as staff can reach every tile', () => {
  const S = Sim.create(1);
  for (const [x, z] of [[2, 0], [3, 0], [2, 1], [3, 1]]) assert.strictEqual(Sim.act(S, 'place', 'stock', x, z, 0), null, x + ',' + z);
  const T = Sim.create(1);
  for (let z = 3; z < 6; z++) for (let x = 3; x < 6; x++) if (x !== 4 || z !== 4) assert.strictEqual(Sim.act(T, 'place', 'stock', x, z, 0), null, x + ',' + z);
  assert.match(Sim.act(T, 'place', 'stock', 4, 4, 0), /reach/);
});

test('a stock cupboard needs no research and stores as much as a stock area', () => {
  const S = Sim.create(1);
  assert.ok(!Sim.TKEYS.includes('storage'), 'no stockroom research');
  assert.strictEqual(Sim.needsResearch(S, 'store'), null);
  assert.strictEqual(Sim.act(S, 'place', 'store', 0, 0, 0), null);
  assert.strictEqual(S.R.items.store.sacks, S.R.items.stock.sacks);
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

test('capacity research grows the order rail and pickup counter to 8, 12 and 16 cups, one tier at a time', () => {
  const S = Sim.create(1, null, { 'start.till': 1, 'start.pickup': 1 });
  const caps = () => S.items.map((it) => it.type + ' ' + it.cap).sort();
  const finish = (k) => { assert.strictEqual(Sim.act(S, 'research', k, 1), null, k); while (!S.research[k].complete) Sim.step(S); };
  assert.deepStrictEqual(caps(), ['pickup 4', 'till 4']);
  assert.match(Sim.act(S, 'research', 'rail2', 1), /Needs research: Order rail: 8 cups/);
  finish('rail1'); finish('counter1');
  assert.deepStrictEqual(caps(), ['pickup 8', 'till 8']);
  finish('rail2'); finish('rail3'); finish('counter2');
  assert.deepStrictEqual(caps(), ['pickup 12', 'till 16']);
  Sim.act(S, 'place', 'till', 2, 6, 0);
  assert.strictEqual(S.items[S.items.length - 1].cap, 16, 'a till placed later gets the researched rail');
});

test('a planned topic researches what it needs first, in turn, then itself', () => {
  const S = Sim.create(1);
  assert.strictEqual(Sim.act(S, 'plan', 'art2'), null);
  assert.deepStrictEqual(S.resPlan, ['espresso', 'foam', 'art1', 'art2']);
  assert.strictEqual(S.research.espresso.weight, 1, 'starts with the first step');
  while (!S.research.art2.complete) Sim.step(S);
  assert.ok(S.research.espresso.finished < S.research.foam.finished && S.research.art1.finished < S.research.art2.finished);
  assert.deepStrictEqual(S.resPlan, []);
  Sim.act(S, 'plan', 'rail3'); Sim.act(S, 'research', 'music', 1);
  assert.deepStrictEqual(S.resPlan, [], 'choosing by hand drops the plan');
});

test('finished research changes the rules it names, for new and existing equipment and staff', () => {
  const S = Sim.create(1, null, { 'start.brewer': 1 });
  const finish = (k) => { Sim.act(S, 'plan', k); while (!S.research[k].complete) Sim.step(S); };
  finish('blend'); finish('hoppers'); finish('shoes'); finish('barista2');
  assert.strictEqual(S.R.PROD.filter.price, 290);
  assert.strictEqual(S.R.items.brewer.hopper, 80);
  assert.strictEqual(S.R.PROD.filter.make, 65, 'two 15% cuts compound: 90, 77, 65');
  assert.ok(S.workers.every((w) => w.spd === 8));
  assert.strictEqual(Sim.create(1, null, { 'research.enabled': 0 }).R.PROD.latte.price, 462, 'with research off, everything is known: 360 up 8%, 8%, then 10%');
});

test('a flavoured latte follows its recipe: grinder, espresso machine, milk station, syrup station, pickup', () => {
  const rules = { 'start.till': 1, 'start.pickup': 1, 'start.grinder': 1, 'start.espresso': 1, 'start.milk': 1, 'start.syrup': 1, 'start.workers': 2,
    'research.topics.espresso.work': 0, 'research.topics.foam.work': 0, 'research.topics.syrup1.work': 0,
    'mix.espresso': 0, 'mix.filter': 0, 'mix.cake': 0, 'mix.vanilla': 100 };
  const S = Sim.create(3, null, rules);
  assert.deepStrictEqual(Sim.recipe(S, 'vanilla').map((r) => r.type + ' ' + r.secs), ['grinder 30', 'espresso 150', 'milk 40', 'syrup 15']);
  assert.deepStrictEqual(Sim.offered(S), ['espresso', 'latte', 'vanilla']);
  Sim.act(S, 'menu', 'espresso'); Sim.act(S, 'menu', 'latte'); Sim.act(S, 'order', 5); Sim.act(S, 'open');
  const busy = new Set();
  for (let t = 0; t < 2 * 3600; t++) { Sim.step(S); for (const it of S.items) if (it.busy === S.t) busy.add(it.type); }
  assert.ok(S.st.served > 3, 'vanilla lattes get served: ' + S.st.served);
  for (const t of ['grinder', 'espresso', 'milk', 'syrup']) assert.ok(busy.has(t), t + ' was worked at');
  assert.match(Sim.act(Sim.create(1), 'place', 'syrup', 11, 0, 0), /Needs research: Syrup station/);
});

test('the back door stays clear: nothing is built on it or walls it off', () => {
  const S = Sim.create(1);
  assert.match(Sim.act(S, 'place', 'stock', S.door.x, S.door.z, 0), /Keep the back door clear/);
  assert.strictEqual(Sim.act(S, 'place', 'stock', S.door.x - 1, S.door.z, 0), null);
  assert.match(Sim.act(S, 'place', 'stock', S.door.x, S.door.z + 1, 0), /cut off/);
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
