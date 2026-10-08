// node --test test/
// Workshop mode teaches four lessons on the real simulation. These tests check that each lesson still holds,
// so a balance change that quietly breaks one shows up here rather than in front of a room.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Sim } = require('../headless/load');
require('../src/lessons.js');
const L = globalThis.CoffeeLessons;

test('round 1: time in the shop climbs steeply as the barista nears 100% busy', () => {
  const sc = L.SCENARIOS.rush, avg = (key) => {
    const rs = sc.chartSeeds.map((seed) => L.run('rush', key, { seed }));
    return { lead: rs.reduce((a, r) => a + r.lead, 0) / rs.length, busy: rs.reduce((a, r) => a + r.busy, 0) / rs.length };
  };
  const steady = avg('steady'), busy = avg('busy'), rush = avg('rush');
  assert.ok(steady.busy < busy.busy && busy.busy < rush.busy, 'busier levels keep Bo busier');
  assert.ok(rush.busy > 0.9, 'rush hour keeps Bo over 90% busy');
  assert.ok(rush.lead > 2 * steady.lead, `rush hour more than doubles time in the shop (${steady.lead.toFixed(1)} → ${rush.lead.toFixed(1)})`);
  assert.ok(rush.lead - busy.lead > 3 * (busy.lead - steady.lead), 'the last step up costs far more than the one before');
});

test('round 2: one topic at a time lands the first improvement far sooner than all at once', () => {
  const focus = L.run('study', 'focus'), split = L.run('study', 'split');
  assert.ok(focus.all != null && split.all != null, 'all three topics finish within the round');
  assert.ok(focus.first * 3 < split.first, `first finished at ${focus.first} vs ${split.first} min`);
  assert.ok(focus.all < split.all, 'and everything is done sooner too, once switching costs count');
  assert.ok(focus.avgLead * 3 < split.avgLead, 'each topic spends far less time in progress (Little\'s Law)');
  assert.ok(split.lost > 0 && focus.lost === 0, 'only the split loses capacity to switching');
});

test('round 3: the AI grinder barely helps; cross-training does', () => {
  const base = L.run('guild', 'base'), ai = L.run('guild', 'ai'), cross = L.run('guild', 'cross'), skip = L.run('guild', 'skip');
  assert.strictEqual(base.busy[0].name, 'Gustavo');
  assert.ok(base.busy[0].share > 0.85, 'Gustavo is the bottleneck');
  assert.ok(base.busy[2].share < 0.6, 'while others have slack');
  assert.ok(Math.abs(ai.lead - base.lead) / base.lead < 0.1, `AI grinder changes time in shop by under 10% (${base.lead.toFixed(1)} → ${ai.lead.toFixed(1)})`);
  assert.ok(cross.lead < base.lead * 0.75, `cross-training cuts time in shop by over a quarter (${base.lead.toFixed(1)} → ${cross.lead.toFixed(1)})`);
  assert.ok(cross.walked <= base.walked && cross.sat > base.sat, 'with fewer walk-outs and happier customers');
  assert.ok(skip.lead < base.lead, 'cutting lattes also helps');
});

test('round 4: opening now and adding drinks as they land beats waiting for the full menu', () => {
  const big = L.run('mocha', 'bigbang'), iter = L.run('mocha', 'iterate'), filt = L.run('mocha', 'filter');
  assert.ok(big.menu.includes('mocha') && iter.menu.includes('mocha'), 'both routes get mochas on the menu within the day');
  assert.ok(iter.served > 2 * big.served, `served ${iter.served} vs ${big.served}`);
  assert.ok(iter.revenue > big.revenue && iter.revenue > filt.revenue, 'and earns the most');
  assert.ok(iter.menuAt.espresso < big.menuAt.espresso, 'espresso reaches customers hours sooner');
});

test('a live round nobody touches ends exactly as the headless run does', () => {
  // the browser builds the game itself, then the CoffeeUI onTick hook ticks the lesson after every Sim.step
  const sc = L.SCENARIOS.guild, S = Sim.create(sc.seed, null, sc.rules('cross'));
  const g = L.begin(S, 'guild', 'cross');
  while (S.t < 1800) { Sim.step(S); g.tick(); }
  const head = L.run('guild', 'cross', { hours: 0.5 });
  assert.strictEqual(Sim.hash(S), Sim.hash(head.S));
});
