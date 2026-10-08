/* Coffee Flow workshop lessons: the scenarios behind Workshop mode (src/workshop.js).
   Pure and deterministic like src/sim.js: no DOM. The browser and test/workshop.test.js load this file unchanged.
   Each round is a rule set plus scripted actions on the unchanged simulation, so sim.js and its replays are untouched.
   A coach is the scripted part of a round: it acts at the start and again after every tick, in the browser
   (through the CoffeeUI onTick hook) and headless alike. So a live round that nobody touches ends with exactly
   the numbers a headless run of the same round gives, and the reveal cards can quote either. */
(function (root) {
  'use strict';
  const Sim = root.CoffeeSim;
  const MIN = 60;

  // Customers who have been served, and how long each spent in the shop (minutes). Call poll() every tick:
  // a served customer stays in S.customers only while they walk out.
  function tracker(S) {
    const seen = new Set(), all = [], byProd = {};
    return {
      all, byProd,
      poll() {
        for (const c of S.customers) {
          if (c.state !== 'leave' || !(c.outcome > 0) || seen.has(c.id)) continue;
          seen.add(c.id);
          const m = (S.t - c.arrive) / MIN;
          all.push(m); (byProd[c.prod] = byProd[c.prod] || []).push(m);
        }
      },
      mean(list) { const l = list || all; return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; }
    };
  }
  // Share of time a worker spent on a task (walking, working or held up) since `from`, from Sim's activity log.
  function busyShare(S, w, from) {
    const a = S.acts[w.id]; if (!a) return 0;
    let busy = 0; const t0 = from || 0;
    for (const [code, s, e] of a.segs) if (code !== 'idle' && e >= t0) busy += e - Math.max(s, t0) + 1;
    return busy / Math.max(1, S.t - t0);
  }
  const itemOf = (S, type) => S.items.find((i) => i.type === type);
  const named = (S, names) => S.workers.forEach((w, i) => { if (names[i]) w.name = names[i]; });

  // Every scenario shares this: a café whose demand does not drift, so each run measures one thing.
  const STEADY = { 'demand.gain': 0, 'demand.walkoutLoss': 0, 'start.sacks': 40, startCash: 300000 };

  // ---------- Round 1: rush hour. One barista, demand stepped up. ----------
  // Long patience, so the queue shows the whole effect instead of walk-outs capping it.
  // Played live on seed 5, whose rush hour is close to the average; the reveal averages the chart seeds,
  // since a single afternoon is noisy (rush hour ranges from about 13 to 40 minutes in the shop across seeds).
  const RUSH = { seed: 5, chartSeeds: [1, 3, 4, 5], hours: 3, levels: [
    { key: 'quiet', label: 'Quiet', rate: 4 },
    { key: 'steady', label: 'Steady', rate: 5.5 },
    { key: 'busy', label: 'Busy', rate: 7 },
    { key: 'rush', label: 'Rush hour', rate: 11 }] };
  const rush = {
    id: 'rush', hours: RUSH.hours, seed: RUSH.seed, chartSeeds: RUSH.chartSeeds, levels: RUSH.levels,
    rules(level) {
      const L = RUSH.levels.find((l) => l.key === level) || RUSH.levels[0];
      return Object.assign({}, STEADY, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.workers': 1,
        'demand.base': L.rate, 'patience.min': 5400, 'patience.spread': 1800 });
    },
    coach(S) { named(S, ['Bo']); Sim.act(S, 'open'); return { tick() {} }; },
    measure(S, tr) {
      return { lead: tr.mean(), served: S.st.served, walked: S.st.abandoned, busy: busyShare(S, S.workers[0], 1800),
        queue: S.items.reduce((n, i) => n + (i.type === 'till' ? i.queue.length : 0), 0) };
    }
  };

  // ---------- Round 2: start everything. Three research topics, worked one at a time or all at once. ----------
  // Research is shared capacity: split three ways, each goes at a third of the pace, less a switching cost.
  const TOPICS3 = ['blend', 'cake', 'music'];
  const study = {
    id: 'study', hours: 2.5, seed: 1, topics: TOPICS3,
    rules() {
      return Object.assign({}, STEADY, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.workers': 1, 'demand.base': 6,
        'research.switchPct': 25, 'research.topics.blend.work': 300, 'research.topics.cake.work': 300, 'research.topics.music.work': 300 });
    },
    coach(S, variant) {
      named(S, ['Ana']); Sim.act(S, 'open');
      const rs = S.research;
      if (variant === 'split') { TOPICS3.forEach((k) => Sim.act(S, 'research', k, 1)); return { tick() {} }; }
      Sim.act(S, 'research', TOPICS3[0], 1);
      return { tick() {     // focus: when one topic finishes, start the next
        if (TOPICS3.some((k) => !rs[k].complete && rs[k].weight > 0)) return;
        const next = TOPICS3.find((k) => !rs[k].complete); if (next) Sim.act(S, 'research', next, 1);
      } };
    },
    measure(S) {
      const rs = S.research;
      const span = TOPICS3.map((k) => ({ key: k, name: Sim.TOPICS[k].name, done: rs[k].done, work: S.R.research.topics[k].work,
        start: rs[k].started >= 0 ? rs[k].started / MIN : null, end: rs[k].complete ? rs[k].finished / MIN : null }));
      const ends = span.map((s) => s.end).filter((x) => x != null), leads = span.filter((s) => s.end != null).map((s) => s.end - s.start);
      return { span, first: ends.length ? Math.min(...ends) : null, all: ends.length === TOPICS3.length ? Math.max(...ends) : null,
        avgLead: leads.length === TOPICS3.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null,
        lost: S.st.researchLost || 0, cash: S.cash, revenue: S.st.revenue };
    }
  };

  // ---------- Round 3: the latte art guild. Gustavo is the only one allowed on the espresso machines. ----------
  const ESPRESSO_DRINKS = ['espresso', 'latte', 'cappuccino'];
  const guild = {
    id: 'guild', hours: 3, seed: 1,
    rules(variant) {
      const r = Object.assign({}, STEADY, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.grinder': 1, 'start.espresso': 2, 'start.milk': 1,
        'start.workers': 3, 'research.topics.espresso.work': 0, 'research.topics.foam.work': 0, 'demand.base': 14,
        'patience.min': 2400, 'patience.spread': 1200, startCash: 500000 });
      if (variant === 'ai') r['research.topics.burrs.work'] = 0;     // the AI grinder: every dose ground in half the time
      return r;
    },
    coach(S, variant) {
      named(S, ['Gustavo', 'Gio', 'Sam']);
      const [g, a, b] = S.workers;
      if (variant !== 'cross') {
        S.items.filter((i) => i.type === 'espresso').forEach((m) => Sim.act(S, 'patch', g.id, m.id));
        for (const w of [a, b]) { Sim.act(S, 'patch', w.id, itemOf(S, 'till').id); Sim.act(S, 'patch', w.id, itemOf(S, 'brewer').id); }
      }
      if (variant === 'skip') Sim.act(S, 'menu', 'latte');
      Sim.act(S, 'open');
      return { tick() {} };
    },
    measure(S, tr) {
      const esp = [].concat(...ESPRESSO_DRINKS.map((p) => tr.byProd[p] || []));
      return { lead: tr.mean(), espLead: tr.mean(esp), served: S.st.served, walked: S.st.abandoned, sat: S.st.sat,
        busy: S.workers.map((w) => ({ name: w.name, share: busyShare(S, w, 1800) })) };
    }
  };

  // ---------- Round 4: impossible orders. Customers want mochas; the full set-up takes hours of research and building. ----------
  // The coach plays operations manager: it researches the route to mochas and builds each station as it unlocks.
  const ROUTE = [['espresso', ['grinder', 'espresso']], ['foam', ['milk']], ['syrup1', ['syrup']], ['cream', []]];
  const mocha = {
    id: 'mocha', hours: 5, seed: 3,
    rules() {
      return Object.assign({}, STEADY, { 'start.till': 1, 'start.pickup': 1, 'start.brewer': 1, 'start.workers': 2, 'demand.base': 9,
        startCash: 400000, 'mix.mocha': 40 });
    },
    coach(S, variant) {
      named(S, ['Yas', 'Kit']);
      const rs = S.research, open = () => { if (!S.open && !Sim.whyNotOpen(S)) Sim.act(S, 'open'); };
      if (variant !== 'filter') Sim.act(S, 'plan', 'cream');
      if (variant !== 'bigbang') open();
      const placed = new Set(), menuAt = {};
      return { extra: () => ({ menuAt }), tick() {
        if (S.open && S.t % MIN === 0) for (const p of Sim.offered(S)) if (menuAt[p] == null) menuAt[p] = S.t / MIN;
        if (variant === 'filter') return;
        for (const [topic, types] of ROUTE) {
          if (!rs[topic].complete) continue;
          for (const type of types) {
            if (placed.has(type)) continue;
            placed.add(type);
            const [x, z, r] = Sim.LAYOUT[type][0];
            if (Sim.act(S, 'place', type, x, z, r)) continue;
            const crate = S.items[S.items.length - 1];
            S.workers.forEach((w) => Sim.act(S, 'build', w.id, crate.id));
          }
        }
        // the big bang opens only once mochas can be made
        if (variant === 'bigbang' && Sim.offered(S).includes('mocha')) open();
      } };
    },
    measure(S, tr) {
      return { served: S.st.served, revenue: S.st.revenue, cash: S.cash, sat: S.st.sat, mochas: (tr.byProd.mocha || []).length, menu: Sim.offered(S) };
    }
  };

  const SCENARIOS = { rush, study, guild, mocha };

  // Set up a scenario on a game the caller has created (so the browser can use its own newGame): coach plus tracker.
  function begin(S, id, variant) {
    const sc = SCENARIOS[id];
    const coach = sc.coach(S, variant), tr = tracker(S);
    return { sc, coach, tr, variant, tick() { coach.tick(); tr.poll(); },
      measure() { return Object.assign(sc.measure(S, tr, variant), coach.extra ? coach.extra() : {}); } };
  }
  // Run a scenario to the end without a browser.
  function run(id, variant, opts) {
    const sc = SCENARIOS[id], o = opts || {};
    const S = Sim.create(o.seed != null ? o.seed : sc.seed || 1, [], sc.rules(variant));
    const g = begin(S, id, variant), end = Math.round((o.hours || sc.hours) * 3600);
    while (S.t < end) { Sim.step(S); g.tick(); }
    return Object.assign({ S }, g.measure());
  }

  root.CoffeeLessons = { SCENARIOS, begin, run, tracker, busyShare };
})(typeof window !== 'undefined' ? window : globalThis);
