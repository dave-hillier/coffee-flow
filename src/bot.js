/* Coffee Flow policies: the shared player model.
   A policy is a player: it reads sim state and issues the same actions a person can (place, build, open, close,
   hire, fire, patch, menu). Everything it does lands in the action log, so a bot game replays like any other.
   One parameterised policy covers every strategy; named bots are presets of its genes, and the headless solver
   searches the gene space. Deterministic: decisions depend only on sim state, on a fixed cadence. */
(function (root) {
  'use strict';
  const Sim = root.CoffeeSim;
  const EVERY = 30;                     // decide every 30 game seconds
  const NEVER = -1;

  // Policies build into the sim's standard layout, so starting equipment and bought equipment line up.
  const SLOTS = Sim.LAYOUT;

  // The gene space. Each gene: [min, max, kind]. kind: 'int', 'num', 'bool', or 'opt' (NEVER or a value in range).
  const GENES = {
    espressoSpare: [0, 60000, 'opt'],   // buy grinder + espresso once cash covers them plus this much (NEVER = don't)
    cakeSpare:     [0, 60000, 'opt'],   // same for the cake display
    brewer2Queue:  [2, 10, 'opt'],      // add a second brewer when the till queue reaches this
    espresso2Queue:[2, 10, 'opt'],
    till2Queue:    [3, 12, 'opt'],
    spare:         [0, 40000, 'int'],   // cash kept back for second machines and hiring
    hireQueue:     [1, 10, 'opt'],      // hire when the queue reaches this ...
    hireUtil:      [0, 0.95, 'num'],    // ... and staff are at least this busy
    hireMax:       [1, 5, 'int'],
    hireGapMin:    [5, 90, 'int'],      // minutes between hires
    fireUtil:      [0.05, 0.5, 'opt'],  // let someone go when staff are less busy than this
    specialise:    [0, 1, 'bool'],      // one on the till, the rest making
    crew:          [1, 3, 'int'],       // builders per crate once open (3 = everyone)
    closeToBuild:  [0, 1, 'bool'],      // close to new customers while the espresso machine is installed
    dropFilter:    [0, 1, 'bool'],      // take filter off the menu once espresso is on
    reorderPoint:  [0, 200, 'int'],     // standing order: when beans (cups' worth) in the shop, at the door and on order drop below this ...
    reorderQty:    [1, 10, 'int'],      // ... order this many sacks
    storeSpare:    [0, 30000, 'opt'],   // build a bean store once trading and cash covers it plus this much
    researchSerial:[0, 1, 'bool'],      // research one topic at a time (1) or everything wanted at once (0)
    standingFirst: [0, 1, 'bool']       // research standing orders before anything else
  };

  const PRESETS = {
    solo: {
      name: 'Solo', blurb: 'One worker, filter coffee only. Never hires, never expands.',
      genes: { espressoSpare: NEVER, cakeSpare: NEVER, brewer2Queue: NEVER, espresso2Queue: NEVER, till2Queue: NEVER, spare: 0,
        hireQueue: NEVER, hireUtil: 0, hireMax: 1, hireGapMin: 30, fireUtil: NEVER, specialise: 0, crew: 1, closeToBuild: 0, dropFilter: 0, reorderPoint: 30, reorderQty: 3, storeSpare: NEVER, researchSerial: 1, standingFirst: 1 }
    },
    steady: {
      name: 'Steady', blurb: 'Opens cheaply, then adds espresso, staff and cake only when cash and queues justify it.',
      genes: { espressoSpare: 15000, cakeSpare: 15000, brewer2Queue: 4, espresso2Queue: 4, till2Queue: NEVER, spare: 15000,
        hireQueue: 3, hireUtil: 0.7, hireMax: 4, hireGapMin: 20, fireUtil: NEVER, specialise: 1, crew: 1, closeToBuild: 0, dropFilter: 0, reorderPoint: 50, reorderQty: 4, storeSpare: 10000, researchSerial: 1, standingFirst: 1 }
    },
    rush: {
      name: 'Rush', blurb: 'Hires straight away and buys everything as soon as it can afford it.',
      genes: { espressoSpare: 0, cakeSpare: 0, brewer2Queue: 2, espresso2Queue: 2, till2Queue: 3, spare: 0,
        hireQueue: 1, hireUtil: 0, hireMax: 5, hireGapMin: 10, fireUtil: NEVER, specialise: 1, crew: 3, closeToBuild: 0, dropFilter: 0, reorderPoint: 80, reorderQty: 6, storeSpare: 0, researchSerial: 0, standingFirst: 0 }
    }
  };

  function create(spec) {
    const p = typeof spec === 'string' ? PRESETS[spec] : spec;
    const genes = Object.assign({}, PRESETS.solo.genes, p.genes || p);
    return { name: p.name || 'Solved', blurb: p.blurb || '', g: genes, lastHire: -1e9, lastFire: -1e9, said: {}, roleKey: '' };
  }

  const count = (S, t) => S.items.filter((i) => i.type === t).length;
  const builtOf = (S, t) => S.items.filter((i) => i.type === t && i.built);
  const cost = (S, t) => S.R.CAT[t].cost;
  function tryPlace(S, type) {
    for (const [x, z, r] of SLOTS[type] || []) if (!Sim.canPlace(S, type, x, z, r)) return !Sim.act(S, 'place', type, x, z, r);
    return false;
  }
  function pressure(S) {
    const tills = builtOf(S, 'till');
    const queue = tills.reduce((n, t) => n + t.queue.length, 0);
    const railFull = tills.some((t) => t.buf.length >= t.cap);
    const ws = S.workers.filter((w) => !w.leaving);
    const util = ws.length ? ws.reduce((n, w) => n + w.util, 0) / ws.length : 0;
    return { queue, railFull, util, ws };
  }
  function setPatch(S, w, ids) {
    const cur = w.all ? null : w.patch.slice().sort().join();
    if (cur === ids.slice().sort().join()) return;
    Sim.act(S, 'all', w.id);
    ids.forEach((id) => Sim.act(S, 'patch', w.id, id));
  }

  function decide(bot, S, say) {
    const g = bot.g, p = pressure(S), ws = p.ws;
    const log = (k, m) => { if (say && !bot.said[k]) { bot.said[k] = 1; say(m); } };

    // 0. Keep beans coming: a standing order once it is researched, by hand until then.
    const sp = S.supply, sack = S.R.supply.sackDoses;
    if (!Sim.needsResearch(S, 'auto')) {
      if (sp.auto.point !== g.reorderPoint || sp.auto.qty !== g.reorderQty) { Sim.act(S, 'auto', g.reorderPoint, g.reorderQty); log('auto', 'standing order: ' + g.reorderQty + ' sacks below ' + g.reorderPoint + ' cups of beans'); }
    } else if (!sp.onOrder) {
      const position = S.items.reduce((n, i) => n + (i.built ? i.beans + (i.sacks || 0) * sack : 0), 0) + sp.door * sack;
      if (position < g.reorderPoint && !Sim.act(S, 'order', g.reorderQty)) log('order' + S.t, 'ordering ' + g.reorderQty + ' sacks by hand');
    }

    // 0b. Research what the plan needs: one topic at a time, or all at once.
    const want = [];
    if (g.standingFirst) want.push('standing');
    if (g.espressoSpare !== NEVER) want.push('espresso');
    if (g.storeSpare !== NEVER) want.push('storage');
    if (g.cakeSpare !== NEVER) want.push('cake');
    if (!g.standingFirst) want.push('standing');
    const open = want.filter((k) => S.research[k] && !S.research[k].complete);
    const focus = g.researchSerial ? open.slice(0, 1) : open;
    for (const k of Sim.TKEYS) {
      const r = S.research[k]; if (r.complete) continue;
      const wt = focus.includes(k) ? 1 : 0;
      if (r.weight !== wt) { Sim.act(S, 'research', k, wt); if (wt) log('research' + k, 'researching ' + Sim.TOPICS[k].name.toLowerCase()); }
    }

    // 1. Opening kit, in order, as cash allows.
    for (const t of ['till', 'pickup', 'brewer']) {
      if (count(S, t)) continue;
      if (S.cash >= cost(S, t) && tryPlace(S, t)) log('kit' + t, 'ordering a ' + S.R.CAT[t].name.toLowerCase());
      return;
    }

    // 2. Expansion, only once trading.
    if (S.open || count(S, 'espresso')) {
      if (g.espressoSpare !== NEVER && !count(S, 'espresso')) {
        const need = cost(S, 'espresso') + (count(S, 'grinder') ? 0 : cost(S, 'grinder')) + g.espressoSpare;
        if (S.cash >= need) {
          if (!count(S, 'grinder')) tryPlace(S, 'grinder');
          if (tryPlace(S, 'espresso')) log('esp', 'buying a grinder and espresso machine');
        }
      } else if (g.storeSpare !== NEVER && !count(S, 'store') && S.cash >= cost(S, 'store') + g.storeSpare) {
        if (tryPlace(S, 'store')) log('store', 'buying a bean store');
      } else if (g.cakeSpare !== NEVER && !count(S, 'pastry') && S.cash >= cost(S, 'pastry') + g.cakeSpare) {
        if (tryPlace(S, 'pastry')) log('cake', 'buying a cake display');
      } else {
        const second = [['brewer', g.brewer2Queue], ['espresso', g.espresso2Queue], ['till', g.till2Queue]];
        for (const [t, q] of second) {
          if (q === NEVER || count(S, t) !== 1 || !builtOf(S, t).length || p.queue < q) continue;
          if (t === 'espresso' && !count(S, 'espresso')) continue;
          if (S.cash < cost(S, t) + g.spare) continue;
          if (tryPlace(S, t)) { log(t + '2', 'queue is ' + p.queue + ', adding another ' + S.R.CAT[t].name.toLowerCase()); break; }
        }
      }
    }

    // 3. Every crate needs builders. Before opening everyone builds; after, the least busy few.
    for (const cr of S.items.filter((i) => !i.built)) {
      if (ws.some((w) => w.builds.includes(cr.id))) continue;
      const n = S.open ? Math.min(ws.length, g.crew >= 3 ? ws.length : g.crew) : ws.length;
      const crew = ws.slice().sort((a, b) => a.util - b.util || a.id - b.id).slice(0, n);
      crew.forEach((w) => Sim.act(S, 'build', w.id, cr.id));
      log('build' + cr.id, crew.map((w) => w.name).join(' and ') + ' to build the ' + S.R.CAT[cr.type].name.toLowerCase());
    }

    // 4. Open when able; optionally close while the espresso machine goes in.
    const espCrate = S.items.some((i) => i.type === 'espresso' && !i.built);
    if (g.closeToBuild && espCrate && S.open && count(S, 'espresso') === 1) { Sim.act(S, 'open'); log('close', 'closing to install the espresso machine'); }
    else if (!S.open && !Sim.whyNotOpen(S) && !(g.closeToBuild && espCrate && count(S, 'espresso') === 1)) { Sim.act(S, 'open'); log('open' + count(S, 'espresso'), 'opening the shop'); }

    // 5. Staffing.
    const gap = g.hireGapMin * 60;
    if (g.hireQueue !== NEVER && ws.length < g.hireMax && S.t - bot.lastHire >= gap && S.cash >= S.R.hireCost + g.spare && S.open &&
        p.util >= g.hireUtil && (p.queue >= g.hireQueue || p.railFull)) {
      if (!Sim.act(S, 'hire')) { bot.lastHire = S.t; log('hire' + S.workers.length, 'hiring: queue ' + p.queue + ', staff ' + Math.round(p.util * 100) + '% busy'); }
    }
    if (g.fireUtil !== NEVER && ws.length > 1 && S.t - Math.max(bot.lastHire, bot.lastFire) >= gap && p.util < g.fireUtil && S.open) {
      const w = ws.slice().sort((a, b) => a.util - b.util || b.id - a.id)[0];
      if (!w.builds.length && !Sim.act(S, 'fire', w.id)) { bot.lastFire = S.t; log('fire' + S.t, 'letting ' + w.name + ' go: staff only ' + Math.round(p.util * 100) + '% busy'); }
    }

    // 6. Roles.
    const live = ws.filter((w) => !w.leaving);
    if (g.specialise && live.length >= 2) {
      const tills = builtOf(S, 'till').map((i) => i.id);
      const rest = S.items.filter((i) => i.built && i.type !== 'till').map((i) => i.id);
      const key = live.map((w) => w.id).join() + '|' + tills.join() + '|' + rest.join();
      if (tills.length && rest.length && key !== bot.roleKey) {
        bot.roleKey = key;
        const nT = Math.max(1, Math.min(tills.length, Math.floor(live.length / 3)));
        live.forEach((w, k) => setPatch(S, w, k < nT ? [tills[k % tills.length]] : rest));
        log('roles' + live.length, live.slice(0, nT).map((w) => w.name).join(', ') + ' on the till, the rest making');
      }
    } else if (!g.specialise && live.some((w) => !w.all)) live.forEach((w) => { if (!w.all) Sim.act(S, 'all', w.id); });

    // 7. Menu.
    if (g.dropFilter && Sim.unlocked(S, 'espresso') && !S.menuOff.filter) { Sim.act(S, 'menu', 'filter'); log('menu', 'taking filter off the menu'); }
  }

  function tick(bot, S, say) { if (S.t % EVERY === 0) decide(bot, S, say); }

  // Play a whole game headlessly. Returns a summary; the replay code rebuilds the game exactly.
  function trial(spec, seed, hours, rules) {
    const S = Sim.create(seed, null, rules), bot = create(spec), T = hours * 3600;
    const cash = [];
    let minCash = S.cash, opened = -1, espressoAt = -1;
    const hourly = [];
    for (let t = 0; t < T; t++) {
      tick(bot, S);
      Sim.step(S);
      if (S.cash < minCash) minCash = S.cash;
      if (opened < 0 && S.open) opened = S.t;
      if (espressoAt < 0 && Sim.unlocked(S, 'espresso')) espressoAt = S.t;
      if (S.t % 600 === 0) cash.push(S.cash);
      if (S.t % 3600 === 0) hourly.push(S.cash);
    }
    const st = S.st, n = hourly.length;
    // what the business is worth if sold now: cash plus what the equipment would fetch
    const worth = S.cash + S.items.reduce((v, i) => v + (i.built ? Math.floor(S.R.CAT[i.type].cost / 2) : S.R.CAT[i.type].cost), 0);
    return {
      seed, hours, cash, finalCash: S.cash, worth, minCash, opened, espressoAt,
      research: Object.fromEntries(Sim.TKEYS.map((k) => [k, S.research[k].finished])), researchLost: st.researchLost || 0,
      lastHour: n >= 2 ? hourly[n - 1] - hourly[n - 2] : 0,
      served: st.served, abandoned: st.abandoned, arrived: st.arrived, sat: st.sat, lead: st.lead, demand: st.demand,
      workers: S.workers.length, items: S.items.filter((i) => i.built).map((i) => i.type), code: Sim.encode(S), hash: Sim.hash(S),
      dryMins: st.dryMins, beansUsed: st.beansUsed, beansBought: st.beansBought
    };
  }

  // Random genes and small mutations, all from a seeded generator so searches are repeatable.
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // fractional genes (anything ranging within 0..1) keep two decimals; the rest are whole numbers
  function round(k, v) { const [, hi, kind] = GENES[k]; return kind === 'num' || hi <= 1 ? Math.round(v * 100) / 100 : Math.round(v); }
  function geneValue(k, r) {
    const [lo, hi, kind] = GENES[k];
    if (kind === 'bool') return r() < 0.5 ? 0 : 1;
    if (kind === 'opt' && r() < 0.3) return NEVER;
    return round(k, lo + r() * (hi - lo));
  }
  function randomGenes(r) { const g = {}; for (const k in GENES) g[k] = geneValue(k, r); return g; }
  function mutate(genes, r, rate) {
    const g = Object.assign({}, genes);
    for (const k in GENES) {
      if (r() > rate) continue;
      const [lo, hi, kind] = GENES[k];
      if (kind === 'bool') { g[k] = 1 - g[k]; continue; }
      if (kind === 'opt') {
        if (g[k] === NEVER) { g[k] = round(k, lo + r() * (hi - lo)); continue; }
        if (r() < 0.15) { g[k] = NEVER; continue; }
      }
      const span = (hi - lo) * 0.25;
      g[k] = round(k, Math.min(hi, Math.max(lo, g[k] + (r() * 2 - 1) * span)));
    }
    return g;
  }

  root.CoffeeBot = { PRESETS, STRATS: PRESETS, GENES, NEVER, SLOTS, EVERY, create, tick, trial, rng, randomGenes, mutate };
})(typeof window !== 'undefined' ? window : globalThis);
