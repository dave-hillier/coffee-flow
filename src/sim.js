/* Coffee Flow simulation kernel: the shared domain model.
   The browser game and the headless tools (headless/*.js) both load this file unchanged.
   Pure and deterministic: integer ticks, seeded RNG, no DOM, no Math.random.
   A game is reproduced exactly from (sim version, rules overrides, seed, action log). 1 tick = 1 game second. */
(function (root) {
  'use strict';
  const GW = 12, GH = 12, IN = 10;          // grid; interior rows z 0..9, z 10 = front wall (gap at x 4,5), z 11 = street
  const VERSION = 11;                         // bump whenever a change makes old replays play out differently
  const TPM = 60;
  const NAMES = ['Pip', 'Bo', 'Mo', 'Jun', 'Ada', 'Kit', 'Rue', 'Fen', 'Ola', 'Tam'];
  const STREET = { x: 5, z: 11 };
  const DIRS = [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }];

  // What things are: names, footprints, which side staff and customers use ('any': whichever side is free). Never tuned.
  const SHAPE = {
    till:     { name: 'Till',             w: 2, d: 1, ws: 'back',  cs: 'front', blurb: 'Takes orders and payment. Labelled cups wait on its rail.' },
    pickup:   { name: 'Pickup counter',   w: 2, d: 1, ws: 'back',  cs: 'front', blurb: 'Finished drinks wait here for their customer.' },
    brewer:   { name: 'Batch brewer',     w: 1, d: 1, ws: 'front', cs: null, blurb: 'Pours filter coffee. Quick and steady.' },
    grinder:  { name: 'Grinder',          w: 1, d: 1, ws: 'front', cs: null, blurb: 'Every espresso is ground here first.' },
    espresso: { name: 'Espresso machine', w: 2, d: 1, ws: 'front', cs: null, blurb: 'Pulls espresso. Needs a grinder.' },
    pastry:   { name: 'Cake display',     w: 2, d: 1, ws: 'back',  cs: null, blurb: 'Plates cake to order.' },
    stock:    { name: 'Stock area',       w: 1, d: 1, ws: 'any',   cs: null, blurb: 'A patch of floor marked out for sacks of beans. Workers stock it from the back door and refill hoppers from it.' },
    store:    { name: 'Stock cupboard',   w: 1, d: 1, ws: 'front', cs: null, blurb: 'Tidy shelves for sacks of beans. Holds the same as a stock area, but looks the part.' },
    milk:     { name: 'Milk station',     w: 1, d: 1, ws: 'front', cs: null, blurb: 'A milk fridge and steaming jugs. Milk drinks get their milk steamed here after the shot is pulled.' },
    syrup:    { name: 'Syrup station',    w: 1, d: 1, ws: 'front', cs: null, blurb: 'Syrup pumps and whipped cream. Flavoured drinks are finished here on the way to pickup.' }
  };
  // A product is made at its machine, then visits each of its stations in turn (rule products.<p>.<station> is the time there).
  const PSHAPE = {
    filter:      { name: 'Filter coffee',     machine: 'brewer' },
    espresso:    { name: 'Espresso',          machine: 'espresso', grinds: true },
    cake:        { name: 'Cake',              machine: 'pastry' },
    latte:       { name: 'Latte',             machine: 'espresso', grinds: true, stations: ['milk'] },
    cappuccino:  { name: 'Cappuccino',        machine: 'espresso', grinds: true, stations: ['milk'] },
    vanilla:     { name: 'Vanilla latte',     machine: 'espresso', grinds: true, stations: ['milk', 'syrup'] },
    caramel:     { name: 'Caramel latte',     machine: 'espresso', grinds: true, stations: ['milk', 'syrup'] },
    gingerbread: { name: 'Gingerbread latte', machine: 'espresso', grinds: true, stations: ['milk', 'syrup'] },
    mocha:       { name: 'Mocha with cream',  machine: 'espresso', grinds: true, stations: ['milk', 'syrup'] }
  };
  const PKEYS = Object.keys(PSHAPE);
  const BASE = ['filter', 'espresso', 'cake'];   // the starting menu; every customer ranks these
  // Research: a tree of topics in lanes. A topic either unlocks things to buy, or sets rule values once finished
  // (the paths in `sets`, to the topic's `to` rule, or by its `pct` rule). `needs` lists the topics that come first.
  // Work, `to` and `pct` are rules.
  const MILKY_PRICES = ['products.latte.price', 'products.cappuccino.price'];
  const MAKES = PKEYS.map((p) => 'products.' + p + '.make');
  const TOPICS = {
    rail1:     { lane: 'counter', name: 'Order rail: 8 cups',   sets: ['items.till.slots'], blurb: 'Each till\'s rail holds 8 waiting orders, so the till keeps taking orders through a rush.' },
    rail2:     { lane: 'counter', name: 'Order rail: 12 cups',  sets: ['items.till.slots'], needs: ['rail1'], blurb: 'Each till\'s rail holds 12 waiting orders.' },
    rail3:     { lane: 'counter', name: 'Order rail: 16 cups',  sets: ['items.till.slots'], needs: ['rail2'], blurb: 'Each till\'s rail holds 16 waiting orders.' },
    cards:     { lane: 'counter', name: 'Card readers',         sets: ['orderTime'], needs: ['rail1'], blurb: 'Paying by card is quicker, so each order takes less time at the till.' },
    counter1:  { lane: 'counter', name: 'Pickup counter: 8 cups',  sets: ['items.pickup.slots'], blurb: 'Each pickup counter holds 8 finished drinks, so staff put drinks down and move on.' },
    counter2:  { lane: 'counter', name: 'Pickup counter: 12 cups', sets: ['items.pickup.slots'], needs: ['counter1'], blurb: 'Each pickup counter holds 12 finished drinks.' },
    counter3:  { lane: 'counter', name: 'Pickup counter: 16 cups', sets: ['items.pickup.slots'], needs: ['counter2'], blurb: 'Each pickup counter holds 16 finished drinks.' },
    names:     { lane: 'counter', name: 'Names on cups',        sets: ['collectTime'], needs: ['counter1'], blurb: 'Customers spot their drink at once and leave the counter sooner.' },
    espresso:  { lane: 'bar', name: 'Espresso training',     unlocks: ['grinder', 'espresso'], blurb: 'Lets you buy a grinder and espresso machine.' },
    burrs:     { lane: 'bar', name: 'Sharper burrs',         sets: ['products.espresso.grind'], needs: ['espresso'], blurb: 'Grinders get through a dose in half the time.' },
    barista1:  { lane: 'bar', name: 'Barista course',        sets: MAKES, needs: ['espresso'], blurb: 'Staff make every drink and plate faster.' },
    barista2:  { lane: 'bar', name: 'Bar workflow',          sets: MAKES, needs: ['barista1'], blurb: 'A tidier bar: everything is made faster again.' },
    hoppers:   { lane: 'bar', name: 'Bigger hoppers',        sets: ['items.brewer.hopper', 'items.grinder.hopper'], blurb: 'Brewers and grinders hold twice the beans, so refills come half as often.' },
    knock:     { lane: 'bar', name: 'Deeper knock boxes',    sets: ['items.brewer.knock', 'items.espresso.knock'], needs: ['hoppers'], blurb: 'Knock boxes hold twice the grounds, so they need emptying half as often.' },
    foam:      { lane: 'drinks', name: 'Steamed milk',       unlocks: ['milk', 'latte'], needs: ['espresso'], blurb: 'Lets you buy a milk station and put lattes on the menu.' },
    micro:     { lane: 'drinks', name: 'Microfoam',          unlocks: ['cappuccino'], needs: ['foam'], blurb: 'Silky foam for cappuccinos.' },
    art1:      { lane: 'drinks', name: 'Latte art: hearts',   sets: MILKY_PRICES, needs: ['foam'], blurb: 'A heart on top: milk drinks sell for more.' },
    art2:      { lane: 'drinks', name: 'Latte art: rosettas', sets: MILKY_PRICES, needs: ['art1'], blurb: 'Rosettas: milk drinks sell for more again.' },
    art3:      { lane: 'drinks', name: 'Latte art: swans',    sets: MILKY_PRICES, needs: ['art2'], blurb: 'Swans: the dearest milk drinks in town.' },
    syrup1:    { lane: 'drinks', name: 'Syrup station',      unlocks: ['syrup', 'vanilla'], needs: ['foam'], blurb: 'Lets you buy a syrup station and put vanilla lattes on the menu.' },
    syrup2:    { lane: 'drinks', name: 'Caramel syrup',      unlocks: ['caramel'], needs: ['syrup1'], blurb: 'Caramel lattes for the syrup station.' },
    syrup3:    { lane: 'drinks', name: 'Seasonal syrups',    unlocks: ['gingerbread'], needs: ['syrup2'], blurb: 'Gingerbread lattes, the priciest drink on the menu.' },
    cream:     { lane: 'drinks', name: 'Whipped cream',      unlocks: ['mocha'], needs: ['syrup1'], blurb: 'Mochas topped with cream at the syrup station.' },
    blend:     { lane: 'menu', name: 'House blend',          sets: ['products.filter.price'], blurb: 'A blend of your own: filter coffee sells for more.' },
    cake:      { lane: 'menu', name: 'Cake supplier',        unlocks: ['pastry'], blurb: 'Lets you buy a cake display.' },
    bake:      { lane: 'menu', name: 'Bake in-house',        sets: ['products.cake.cost'], needs: ['cake'], blurb: 'Cake costs less to make.' },
    standing:  { lane: 'beans', name: 'Standing orders',     unlocks: ['auto'], blurb: 'Lets the supplier deliver automatically when beans run low.' },
    roaster:   { lane: 'beans', name: 'Local roaster',       sets: ['supply.leadMins'], blurb: 'A roaster round the corner: deliveries arrive sooner.' },
    wholesale: { lane: 'beans', name: 'Wholesale account',   sets: ['supply.sackCost'], needs: ['roaster'], blurb: 'Sacks of beans cost less.' },
    music:     { lane: 'guests', name: 'Queue music',        sets: ['patience.min'], blurb: 'Customers wait longer before they give up.' },
    loyalty:   { lane: 'guests', name: 'Loyalty cards',      sets: ['demand.gain'], needs: ['music'], blurb: 'Happy customers bring trade back faster.' },
    press:     { lane: 'guests', name: 'Local press',        sets: ['demand.max'], needs: ['loyalty'], blurb: 'A write-up in the paper: the shop can grow busier than before.' },
    fitout:    { lane: 'team', name: 'Flat-pack fit-out',    sets: ['items.till.buildMins', 'items.pickup.buildMins', 'items.brewer.buildMins', 'items.grinder.buildMins', 'items.espresso.buildMins', 'items.pastry.buildMins', 'items.store.buildMins'], blurb: 'New equipment goes up faster.' },
    shoes:     { lane: 'team', name: 'Comfy shoes',          sets: ['walkStep'], blurb: 'Staff walk faster.' },
    rota:      { lane: 'team', name: 'Rota planning',        sets: ['maxWorkers'], needs: ['shoes'], blurb: 'Room on the rota for more staff.' }
  };
  const prereqs = (k) => TOPICS[k].needs || [];
  const TKEYS = Object.keys(TOPICS);
  // Standard layout: where starting equipment goes and where the bots build. [x, z, rotation] per copy.
  const LAYOUT = {
    till: [[4, 3, 0], [2, 3, 0]],
    pickup: [[7, 3, 0]],
    brewer: [[2, 0, 0], [3, 0, 0]],
    grinder: [[9, 0, 0], [10, 0, 0]],
    espresso: [[6, 0, 0], [4, 0, 0]],
    pastry: [[9, 3, 0]],
    stock: [[0, 0, 0], [1, 0, 0]],
    store: [[0, 0, 0], [1, 0, 0]],
    milk: [[8, 0, 0]],
    syrup: [[11, 3, 0]]
  };

  // The balance. Money in pence, times in game seconds unless named otherwise.
  // Override any leaf by dotted path, e.g. { 'startCash': 90000, 'items.espresso.cost': 25000, 'demand.growAt': 0.45 }.
  const DEFAULT_RULES = {
    startCash: 60000,
    // The starting setup. Equipment listed here starts built, in the standard layout (LAYOUT below).
    start: { workers: 1, demand: 0, sacks: 3, till: 0, pickup: 0, brewer: 0, grinder: 0, espresso: 0, pastry: 0, stock: 0, store: 0, milk: 0, syrup: 0 },
    // The shop floor: columns x0..x1 and rows z0..9, inside the 12×10 plot. It must take in the front door (x 4 and 5)
    // and the squares staff start on (x 4..6, z 7..8). The back door is in its back corner, at (x1, z0).
    room: { x0: 0, x1: 11, z0: 0 },
    // What this shop can have: equipment types and research lanes, as space-separated names.
    allow: { items: 'till pickup brewer grinder espresso pastry stock store milk syrup', lanes: 'counter bar drinks menu beans guests team' },
    // Losing. Overdrawn for overdrawnMins game minutes in all, or more than `overdraft` pence in the red, and the bank
    // closes the shop. Satisfaction under `sat` for satMins minutes, judged once `after` customers have finished, and
    // trade dries up. Each timer runs back down at the same pace while things are good. 0 minutes turns a check off.
    fail: { overdraft: 0, overdrawnMins: 0, sat: 0, satMins: 0, after: 10 },
    // Beans come in sacks, ordered from a supplier and delivered to the back door after a lead time.
    supply: { sackDoses: 20, sackCost: 600, leadMins: 20 },
    // Research: capacity in units per game minute, split evenly (by weight) across the topics in progress, so three topics
    // each go at a third of the pace. Nothing pays off until a topic is finished: that is the whole cost of splitting.
    // switchPct (optional, 0 by default) adds a context-switching loss per extra topic. work 0 = known from the start.
    // Each topic: work to finish it, then `to` (the new value) or `pct` (change in percent, rounded to whole units).
    research: { enabled: 1, rate: 10, switchPct: 0, topics: {
      rail1: { work: 150, to: 8 }, rail2: { work: 300, to: 12 }, rail3: { work: 500, to: 16 }, cards: { work: 250, to: 50 },
      counter1: { work: 150, to: 8 }, counter2: { work: 300, to: 12 }, counter3: { work: 500, to: 16 }, names: { work: 200, to: 8 },
      espresso: { work: 600 }, burrs: { work: 300, pct: -50 }, barista1: { work: 400, pct: -15 }, barista2: { work: 700, pct: -15 },
      hoppers: { work: 200, pct: 100 }, knock: { work: 250, pct: 100 },
      foam: { work: 400 }, micro: { work: 300 }, art1: { work: 300, pct: 8 }, art2: { work: 450, pct: 8 }, art3: { work: 650, pct: 10 },
      syrup1: { work: 450 }, syrup2: { work: 350 }, syrup3: { work: 550 }, cream: { work: 400 },
      blend: { work: 300, to: 290 }, cake: { work: 300 }, bake: { work: 350, to: 70 },
      standing: { work: 250 }, roaster: { work: 300, to: 10 }, wholesale: { work: 450, to: 450 },
      music: { work: 250, to: 1700 }, loyalty: { work: 400, to: 0.025 }, press: { work: 600, to: 2.6 },
      fitout: { work: 250, pct: -40 }, shoes: { work: 300, to: 8 }, rota: { work: 350, to: 7 } } },
    // Worker chores: tipping a sack into a hopper, emptying a knock box, tipping grounds in the bin by the back door.
    chores: { refill: 15, empty: 20, dump: 10 },
    wagePerMin: 15,           // per worker per game minute (£9/h)
    rentPerMin: 5,            // £3/h
    hireCost: 8000,
    maxWorkers: 5,
    walkStep: 10,             // ticks per grid step, staff
    customerStep: 12,
    orderTime: 75,
    collectTime: 15,
    patience: { min: 1200, spread: 1200 },
    // how many customers in a hundred pick each first; drinks beyond the starting three only count while on the menu
    mix: { espresso: 45, filter: 35, cake: 20, latte: 25, cappuccino: 20, vanilla: 12, caramel: 10, gingerbread: 8, mocha: 10 },
    fit: [1, 0.7, 0.45],                                     // satisfaction for 1st, 2nd, 3rd choice
    demand: { base: 9, perLevel: 45, menuBonus: 0.15, growAt: 0.55, gain: 0.015, walkoutLoss: 0.02, max: 2 },
    items: {
      till:     { cost: 12000, buildMins: 6,  slots: 4 },
      pickup:   { cost: 5000,  buildMins: 3,  slots: 4 },
      brewer:   { cost: 15000, buildMins: 5, hopper: 40, knock: 15 },   // hopper in doses; knock box holds this many drinks' grounds
      grinder:  { cost: 10000, buildMins: 4, hopper: 60 },
      espresso: { cost: 38000, buildMins: 14, knock: 25 },
      pastry:   { cost: 22000, buildMins: 8 },
      stock:    { cost: 0,     buildMins: 0, sacks: 10 },               // floor space, in sacks; free and ready at once
      store:    { cost: 4000,  buildMins: 2, sacks: 10 },               // shelf space, in sacks
      milk:     { cost: 9000,  buildMins: 3 },
      syrup:    { cost: 7000,  buildMins: 3 }
    },
    products: {
      filter:   { price: 250, cost: 10,  make: 90, doses: 1 },              // cost is the cup; beans are bought separately
      espresso: { price: 320, cost: 30,  make: 150, grind: 30, doses: 1 },
      cake:     { price: 380, cost: 120, make: 60 },
      // milk drinks: the shot at the espresso machine, then seconds at each station
      latte:       { price: 360, cost: 45, make: 150, grind: 30, doses: 1, milk: 40 },
      cappuccino:  { price: 370, cost: 45, make: 150, grind: 30, doses: 1, milk: 50 },
      vanilla:     { price: 400, cost: 60, make: 150, grind: 30, doses: 1, milk: 40, syrup: 15 },
      caramel:     { price: 420, cost: 65, make: 150, grind: 30, doses: 1, milk: 40, syrup: 15 },
      gingerbread: { price: 460, cost: 75, make: 150, grind: 30, doses: 1, milk: 40, syrup: 20 },
      mocha:       { price: 440, cost: 80, make: 150, grind: 30, doses: 1, milk: 40, syrup: 30 }
    }
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function rulesWith(over) {
    const R = clone(DEFAULT_RULES);
    for (const k of Object.keys(over || {}).sort()) {
      const path = k.split('.'); let o = R;
      for (let i = 0; i < path.length - 1; i++) { if (!(path[i] in o)) throw new Error('Unknown rule: ' + k); o = o[path[i]]; }
      const leaf = path[path.length - 1];
      if (!(leaf in o)) throw new Error('Unknown rule: ' + k);
      if (typeof o[leaf] !== typeof over[k]) throw new Error('Rule ' + k + ' must be a ' + typeof o[leaf]);
      o[leaf] = over[k];
    }
    R.CAT = {}; R.PROD = {};
    return derive(R);
  }
  // merged views the game reads: shape + numbers, refreshed in place so anything holding them sees research changes
  function derive(R) {
    for (const t in SHAPE) { const n = R.items[t]; R.CAT[t] = Object.assign(R.CAT[t] || {}, SHAPE[t], { cost: n.cost, mins: n.buildMins, cap: n.slots || 0 }); }
    for (const p in PSHAPE) R.PROD[p] = Object.assign(R.PROD[p] || {}, PSHAPE[p], R.products[p]);
    return R;
  }
  // what a topic changes: [{ path, from, to }] against the given rules
  function topicChanges(R, k) {
    const T = TOPICS[k], n = R.research.topics[k];
    return (T.sets || []).map((path) => {
      const keys = path.split('.'), leaf = keys.pop(), o = keys.reduce((o, key) => o[key], R), from = o[leaf];
      return { path, from, to: n.pct != null ? Math.round(from * (100 + n.pct) / 100) : n.to };
    });
  }
  function flatRules(o, pre, out) {
    out = out || {};
    for (const k in o) { const v = o[k], key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flatRules(v, key, out); else out[key] = v; }
    return out;
  }
  const DEFAULTS = rulesWith({});
  const CAT = DEFAULTS.CAT, PROD = DEFAULTS.PROD;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  const rm = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); };
  const clampD = (v, S) => Math.max(0, Math.min(S.R.demand.max, v));
  const same = (a, b) => a && b && a.x === b.x && a.z === b.z;
  const at = (a, c) => a.x === c.x && a.z === c.z && a.prog === 0;
  const dist = (a, c) => Math.abs(a.x - c.x) + Math.abs(a.z - c.z);

  // ---------- geometry ----------
  function dimsOf(type, r) { const c = SHAPE[type]; return (r & 1) ? [c.d, c.w] : [c.w, c.d]; }
  function footprint(it) {
    const [w, d] = dimsOf(it.type, it.r), o = [];
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) o.push({ x: it.x + dx, z: it.z + dz });
    return o;
  }
  function side(it, s) {
    const fs = s === 'any' ? DIRS : [DIRS[s === 'front' ? it.r : (it.r + 2) % 4]], fp = footprint(it), o = [];
    fs.forEach((f) => fp.forEach((c) => {
      const n = { x: c.x + f.x, z: c.z + f.z };
      if (!fp.some((q) => same(q, n)) && !o.some((q) => same(q, n))) o.push(n);
    }));
    return o;
  }
  const inside = (c) => c.x >= 0 && c.x < GW && c.z >= 0 && c.z < IN;
  const inRoom = (S, c) => { const R = S.R.room; return c.x >= R.x0 && c.x <= R.x1 && c.z >= R.z0 && c.z < IN; };
  // Where staff stand to use it. An 'any' item takes the first free side that can be reached (seen), if there is one.
  function wcell(it, g, seen) {
    const ns = side(it, SHAPE[it.type].ws);
    if (SHAPE[it.type].ws !== 'any' || !g) return ns[0];
    const free = ns.filter((c) => inside(c) && !g[c.z * GW + c.x]);
    return free.find((c) => !seen || seen[c.z * GW + c.x]) || free[0] || ns[0];
  }
  const reachable = (it, g, seen) => side(it, 'any').some((c) => inside(c) && !g[c.z * GW + c.x] && seen[c.z * GW + c.x]);
  const ccell = (it) => (SHAPE[it.type].cs ? side(it, SHAPE[it.type].cs)[0] : null);

  function rebuild(S) {
    const g = new Uint8Array(GW * GH);
    for (let x = 0; x < GW; x++) if (x !== 4 && x !== 5) g[10 * GW + x] = 1;
    for (let z = 0; z < IN; z++) for (let x = 0; x < GW; x++) if (!inRoom(S, { x, z })) g[z * GW + x] = 1;
    S.items.forEach((it) => footprint(it).forEach((c) => { g[c.z * GW + c.x] = 1; }));
    S.grid = g; S.qcache = {}; S.wcache = null; S.acache = null;
    if (S.items.some((it) => SHAPE[it.type].ws === 'any')) {
      const seen = flood(g, STREET);
      S.items.forEach((it) => { if (SHAPE[it.type].ws === 'any') { it.wc = wcell(it, g, seen); it.wsc = [it.wc]; } });
    }
    S.workers.forEach((a) => { a.tx = null; });
    S.customers.forEach((a) => { a.tx = null; });
  }
  function flood(g, s) {
    const seen = new Uint8Array(GW * GH), q = [s.z * GW + s.x]; seen[q[0]] = 1;
    while (q.length) {
      const i = q.shift(), x = i % GW, z = (i / GW) | 0;
      for (const d of DIRS) {
        const nx = x + d.x, nz = z + d.z; if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const ni = nz * GW + nx; if (seen[ni] || g[ni]) continue; seen[ni] = 1; q.push(ni);
      }
    }
    return seen;
  }
  function findPath(S, a, b) {
    if (same(a, b)) return [];
    const N = GW * GH, g = S.grid, ti = b.z * GW + b.x, si = a.z * GW + a.x;
    const dd = new Int32Array(N).fill(1e9), prev = new Int16Array(N).fill(-1), done = new Uint8Array(N);
    const h = (i) => { const dx = Math.abs(i % GW - b.x), dz = Math.abs(((i / GW) | 0) - b.z); return 10 * (dx + dz) - 6 * Math.min(dx, dz); };
    dd[si] = 0; const open = [si];
    while (open.length) {
      let bi = 0, bf = 1e9;
      for (let k = 0; k < open.length; k++) { const f = dd[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k; } }
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (done[cur]) continue; done[cur] = 1; if (cur === ti) break;
      const cx = cur % GW, cz = (cur / GW) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const ni = nz * GW + nx; if (g[ni] && ni !== ti) continue;
        if (dx && dz && (g[cz * GW + nx] || g[nz * GW + cx])) continue;
        const nd = dd[cur] + (dx && dz ? 14 : 10);
        if (nd < dd[ni]) { dd[ni] = nd; prev[ni] = cur; open.push(ni); }
      }
    }
    if (prev[ti] < 0) return null;
    const out = []; for (let i = ti; i !== si; i = prev[i]) out.push({ x: i % GW, z: (i / GW) | 0 });
    return out.reverse();
  }
  function goTo(S, a, c) {
    if (a.tx === c.x && a.tz === c.z) return;
    a.tx = c.x; a.tz = c.z;
    if (a.prog > 0 && a.path.length) { const n = a.path[0]; a.path = [n].concat(findPath(S, n, c) || []); }
    else { a.path = findPath(S, { x: a.x, z: a.z }, c) || []; a.prog = 0; }
  }
  function move(a) {
    if (!a.path.length) return false;
    const n = a.path[0];
    const cost = (n.x !== a.x && n.z !== a.z) ? Math.round(a.spd * 1.4) : a.spd;
    if (++a.prog >= cost) { a.x = n.x; a.z = n.z; a.prog = 0; a.path.shift(); }
    return true;
  }

  // ---------- lookups ----------
  function label(S, it) {
    const n = S.items.filter((o) => o.type === it.type).length;
    return SHAPE[it.type].name + (n > 1 || it.n > 1 ? ' ' + it.n : '');
  }
  function unlocked(S, p) {
    const P = PSHAPE[p];
    if (!S.items.some((i) => i.built && i.type === P.machine)) return false;
    if (P.grinds && !S.items.some((i) => i.built && i.type === 'grinder')) return false;
    if ((P.stations || []).some((t) => !S.items.some((i) => i.built && i.type === t))) return false;
    return !needsResearch(S, p);
  }
  // a product's recipe: each stop on the way to pickup and the seconds spent there, from the current rules
  function recipe(S, p) {
    const P = S.R.PROD[p], out = [];
    if (P.grind) out.push({ type: 'grinder', secs: P.grind });
    out.push({ type: P.machine, secs: P.make });
    for (const t of P.stations || []) out.push({ type: t, secs: P[t] });
    return out;
  }
  const offered = (S) => PKEYS.filter((p) => !S.menuOff[p] && unlocked(S, p));
  function rate(S) {
    const m = offered(S).length; if (!m) return 0;
    const D = S.R.demand;
    return (D.base + D.perLevel * S.st.demand) * (1 + D.menuBonus * (m - 1));
  }
  function nearest(S, a, pred) {
    let best = null, bd = 1e9;
    for (const it of S.items) if (pred(it)) { const d = dist(a, it.wc); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  function qcells(S, till) {
    let q = S.qcache[till.id]; if (q) return q;
    const p = findPath(S, STREET, till.cc) || [];
    q = [till.cc];
    for (let i = p.length - 2; i >= 0; i--) q.push(p[i]);
    q.push(STREET);
    S.qcache[till.id] = q; return q;
  }
  function qcell(S, till, i) {
    const q = qcells(S, till);
    return i < q.length ? q[i] : { x: Math.max(0, STREET.x - (i - q.length + 1)), z: 11 };
  }
  function wcells(S) {
    if (S.wcache) return S.wcache;
    const pk = S.items.find((i) => i.built && i.type === 'pickup');
    const start = pk ? pk.cc : { x: 5, z: 8 };
    const ex = new Set();
    S.items.forEach((i) => {
      if (i.cc) ex.add(i.cc.z * GW + i.cc.x); ex.add(i.wc.z * GW + i.wc.x);
      if (i.type === 'till' && i.built) qcells(S, i).forEach((c) => ex.add(c.z * GW + c.x));
    });
    const seen = new Uint8Array(GW * GH), q = [start.z * GW + start.x], out = []; seen[q[0]] = 1;
    while (q.length) {
      const i = q.shift(), x = i % GW, z = (i / GW) | 0;
      if (!ex.has(i) && !S.grid[i]) out.push({ x, z });
      for (const d of DIRS) {
        const nx = x + d.x, nz = z + d.z; if (nx < 0 || nz < 0 || nx >= GW || nz >= IN) continue;
        const ni = nz * GW + nx; if (seen[ni] || S.grid[ni]) continue; seen[ni] = 1; q.push(ni);
      }
    }
    S.wcache = out.length ? out : [start]; return S.wcache;
  }

  function canPlace(S, type, x, z, r) {
    const it = { type, x, z, r }, fp = footprint(it);
    for (const c of fp) {
      if (!inRoom(S, c)) return 'Outside the shop';
      if (S.grid[c.z * GW + c.x]) return 'That space is taken';
      if (same(c, S.door)) return 'Keep the back door clear';
    }
    for (const o of S.items) for (const a of [SHAPE[o.type].ws === 'any' ? null : o.wc, o.cc]) if (a && fp.some((c) => same(c, a))) return 'Blocks access to ' + label(S, o);
    const any = SHAPE[type].ws === 'any', wc = wcell(it, S.grid), cc = ccell(it);
    for (const a of [any ? null : wc, cc]) {
      if (!a) continue;
      const who = a === wc ? 'staff' : 'customers';
      if (!inRoom(S, a) || S.grid[a.z * GW + a.x]) return 'No room for ' + who + ' to stand';
    }
    if (cc && same(wc, cc)) return 'No room';
    const g = S.grid.slice(); fp.forEach((c) => { g[c.z * GW + c.x] = 1; });
    const seen = flood(g, STREET);
    if (any && !reachable(it, g, seen)) return 'No room for staff to reach it';
    const need = any ? [S.door] : [S.door, wc]; if (cc) need.push(cc);
    for (const o of S.items) {
      if (SHAPE[o.type].ws !== 'any') need.push(o.wc);
      else if (!reachable(o, g, seen)) return 'Blocks access to ' + label(S, o);
      if (o.cc) need.push(o.cc);
    }
    for (const a of need) if (!seen[a.z * GW + a.x]) return 'Would cut off part of the shop';
    return null;
  }
  function whyNotRemove(S, it) {
    if (it.res != null || it.chore != null) return 'In use right now';
    if (it.sacks > 0) return 'Still holding sacks of beans';
    if (it.buf.length) return 'Still holding cups';
    if (it.queue.length) return 'Customers are queuing';
    if (!it.built) return null;
    const lastOf = (t) => S.items.filter((i) => i.built && i.type === t).length <= 1;
    const live = (pred) => S.cups.some((c) => c.state !== 'ready' && pred(c));
    if (it.type === 'pickup' && lastOf('pickup') && S.cups.some((c) => c.state !== 'ready')) return 'Drinks in progress need it';
    if (it.type === 'grinder' && lastOf('grinder') && live((c) => PSHAPE[c.prod].grinds)) return 'Espresso orders need it';
    for (const p of PKEYS) if ((PSHAPE[p].machine === it.type || (PSHAPE[p].stations || []).includes(it.type)) && lastOf(it.type) && live((c) => c.prod === p)) return 'Open orders need it';
    return null;
  }
  function whyNotOpen(S) {
    const b = (t) => S.items.some((i) => i.built && i.type === t);
    if (!b('till')) return 'Build a till first';
    if (!b('pickup')) return 'Build a pickup counter first';
    if (!offered(S).length) return 'Build something to sell first';
    return null;
  }

  // ---------- creation ----------
  const allowed = (S, type) => S.R.allow.items.split(' ').includes(type);
  const topicOpen = (S, k) => S.R.allow.lanes.split(' ').includes(TOPICS[k].lane);
  function ev(S, text, kind) { S.events.push({ n: ++S.evn, t: S.t, text, kind: kind || 'info' }); if (S.events.length > 40) S.events.shift(); }
  function addWorker(S, x, z) {
    const id = S.nextId++;
    const w = { id, name: NAMES[S.hired++ % NAMES.length], x, z, path: [], prog: 0, spd: S.R.walkStep, load: null, tx: null, tz: null,
      all: true, patch: [], builds: [], task: null, claim: null, claimIdle: true, carry: null, util: 0, status: 'Idle', anim: 'idle', face: null, leaving: false, gone: false };
    S.workers.push(w); S.wmap[id] = w; return w;
  }
  // the room has to hold the front door, the back door and the squares staff start on
  function checkRoom(R) {
    const { x0, x1, z0 } = R.room;
    if (!(x0 >= 0 && x0 <= 4 && x1 >= 6 && x1 < GW && z0 >= 0 && z0 <= 7)) throw new Error('The room must cover x 4..6 and rows 7..9 of the plot');
  }
  // A game: seed, the action log to replay, rule overrides, and optionally a level (see src/levels.js). A level brings
  // its own rules, under any overrides, plus goals to meet and an optional time limit.
  function create(seed, log, over, level) {
    const R = rulesWith(Object.assign({}, level ? level.rules : {}, over));
    checkRoom(R);
    const S = {
      v: VERSION, R, over: Object.assign({}, over || {}), seed: seed >>> 0, t: 0, cash: R.startCash, open: false, nextId: 1, hired: 0, evn: 0,
      level: level || null, door: doorOf(R), goal: 0, end: null,
      judge: { red: 0, poor: 0, streak: 0, since: 0, from: { t: 0, served: 0, walked: 0, cash: R.startCash } },
      items: [], workers: [], customers: [], cups: [], imap: {}, wmap: {}, cmap: {}, upmap: {}, counts: {},
      menuOff: {}, log: [], pending: log ? log.map((a) => a.slice()) : [], events: [], served: [],
      supply: { door: R.start.sacks, onOrder: 0, orders: [], auto: { point: 0, qty: 0 }, grindPending: 0 },
      resPlan: [], research: Object.fromEntries(TKEYS.map((k) => [k, { done: 0, weight: 0, complete: !R.research.enabled || R.research.topics[k].work <= 0, started: -1, finished: R.research.topics[k].work <= 0 ? 0 : -1 }])),
      // cumulative exits from each stage of the order value chain; a lost order counts as leaving every later stage too
      flow: { arrived: 0, ordered: 0, claimed: 0, made: 0, served: 0, lostQueue: 0, lostRail: 0, lostMaking: 0, lostReady: 0 },
      acts: {}, marks: [],
      hist: { t: [], queue: [], rail: [], making: [], ready: [], beans: [], door: [], store: [], onOrder: [], grounds: [], cash: [], served: [], walked: [], used: [],
        cArrived: [], cOrdered: [], cClaimed: [], cMade: [], cDone: [], rAvailable: [], rActive: [], rDone: [] },
      st: { arrived: 0, served: 0, abandoned: 0, revenue: 0, refunds: 0, wasted: 0, costs: 0, capex: 0, sat: 0.7, demand: 0, lead: 0,
        beansBought: 0, beansUsed: 0, groundsOut: 0, dryMins: 0 }
    };
    S.r = rng(S.seed);
    rebuild(S);
    for (const k of TKEYS) if (S.research[k].complete) applyTopic(S, k);   // known from the start
    // starting setup
    const st = R.start;
    for (const type of Object.keys(LAYOUT)) {
      const n = Math.max(0, Math.min(LAYOUT[type].length, Math.round(st[type])));
      for (let k = 0; k < n; k++) { const [x, z, r] = LAYOUT[type][k]; if (!canPlace(S, type, x, z, r)) addItem(S, type, x, z, r, true); }
    }
    const spots = [[5, 8], [6, 8], [4, 8], [5, 7], [6, 7]];
    for (let k = 0; k < Math.max(1, Math.min(R.maxWorkers, Math.round(st.workers))); k++) addWorker(S, spots[k][0], spots[k][1]);
    S.st.demand = Math.max(0, Math.min(R.demand.max, st.demand));
    return S;
  }
  function addItem(S, type, x, z, r, built) {
    const c = S.R.CAT[type];
    S.counts[type] = (S.counts[type] || 0) + 1;
    const it = { id: S.nextId++, type, x, z, r, n: S.counts[type], built, work: built ? c.mins * TPM : 0, total: c.mins * TPM,
      res: null, buf: [], queue: [], cap: capOf(S, type), util: 0, busy: -1,
      beans: built ? (S.R.items[type].hopper || 0) : 0, grounds: 0, sacks: 0, chore: null };
    it.wc = wcell(it); it.cc = ccell(it); it.wsc = side(it, c.ws);
    S.items.push(it); S.imap[it.id] = it;
    rebuild(S);
    return it;
  }
  function killCup(S, cup) {
    rm(S.cups, cup); delete S.upmap[cup.id];
    const it = S.imap[cup.at]; if (it) rm(it.buf, cup.id);
  }
  function mark(S, kind, text) { S.marks.push({ t: S.t, kind, text }); if (S.marks.length > 300) S.marks.shift(); }
  function complete(S, cr) {
    cr.built = true; cr.work = cr.total;
    S.workers.forEach((w) => rm(w.builds, cr.id));
    rebuild(S);
    ev(S, label(S, cr) + ' is ready', 'good');
    mark(S, 'built', label(S, cr) + ' built');
  }

  // ---------- beans and grounds ----------
  // the back door, in the side wall at the back corner: sacks are delivered outside it, the bin stands beside it,
  // and staff stand on this cell to fetch a sack or tip grounds. It stays clear of building.
  const doorOf = (R) => ({ x: R.room.x1, z: R.room.z0 });
  const hopperOf = (S, it) => S.R.items[it.type].hopper || 0;
  const knockOf = (S, it) => S.R.items[it.type].knock || 0;
  const beansInShop = (S) => S.items.reduce((n, i) => n + (i.built ? i.beans : 0), 0);          // in hoppers
  const shelfOf = (S, it) => S.R.items[it.type].sacks || 0;                                     // stock areas and cupboards
  const sacksStored = (S) => S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0);
  // where a worker takes a sack from: the nearest stocked store, otherwise the pile at the back door
  function sackSource(S, w) {
    let best = null, bd = 1e9;
    for (const i of S.items) if (i.built && i.sacks > 0) { const d = dist(w, i.wc); if (d < bd) { bd = d; best = i; } }
    return best || (S.supply.door > 0 ? 'door' : null);
  }
  const sacksAvailable = (S) => S.supply.door + sacksStored(S);
  // espresso doses still available once orders already in progress have ground theirs
  const grindFree = (S) => S.items.reduce((n, i) => n + (i.built && i.type === 'grinder' ? i.beans : 0), 0) - S.supply.grindPending;
  function placeSupplyOrder(S, n, auto) {
    const cost = n * S.R.supply.sackCost;
    if (S.cash < cost) return 'Not enough cash';
    S.cash -= cost; S.st.costs += cost; S.st.beansBought += n * S.R.supply.sackDoses;
    S.supply.orders.push({ due: S.t + S.R.supply.leadMins * TPM, n });
    S.supply.onOrder += n;
    ev(S, (auto ? 'Standing order: ' : 'Ordered ') + n + ' sack' + (n > 1 ? 's' : '') + ' of beans, due in ' + S.R.supply.leadMins + ' min', 'info');
    return null;
  }
  function takeSack(S, src) {
    if (src === 'door') { if (S.supply.door <= 0) return false; S.supply.door--; return true; }
    if (!src || !S.imap[src.id] || src.sacks <= 0) return false;
    src.sacks--; return true;
  }
  function refillTask(S, w, m) {
    m.chore = w.id;
    const src = sackSource(S, w);
    const done = () => { m.chore = null; w.load = null; };
    return mk('refill', [
      { t: 'go', cell: src === 'door' ? S.door : () => src.wc, shared: true, status: src === 'door' ? 'Fetching a sack from the back door' : 'Fetching a sack from the store' },
      { t: 'do', fn: () => { if (!S.imap[m.id] || !takeSack(S, src)) { done(); return 'stop'; } w.load = 'sack'; } },
      { t: 'go', cell: m.wc, shared: true, status: 'Carrying beans to ' + label(S, m) },
      { t: 'work', n: S.R.chores.refill, st: m.id, status: 'Filling the hopper' },
      { t: 'do', fn: () => { if (S.imap[m.id]) m.beans = Math.min(hopperOf(S, m), m.beans + S.R.supply.sackDoses); done(); } }
    ], done);
  }
  // carry one sack from the back door onto a store's shelves
  function stockTask(S, w, st) {
    st.chore = w.id;
    const done = () => { st.chore = null; w.load = null; };
    return mk('stock', [
      { t: 'go', cell: S.door, shared: true, status: 'Fetching a sack from the back door' },
      { t: 'do', fn: () => { if (!S.imap[st.id] || S.supply.door <= 0) { done(); return 'stop'; } S.supply.door--; w.load = 'sack'; } },
      { t: 'go', cell: () => st.wc, shared: true, status: 'Carrying beans to the store' },
      { t: 'work', n: S.R.chores.refill, st: st.id, status: 'Stacking the shelf' },
      { t: 'do', fn: () => { if (S.imap[st.id]) st.sacks = Math.min(shelfOf(S, st), st.sacks + 1); else S.supply.door++; done(); } }
    ], done);
  }
  function emptyTask(S, w, m) {
    m.chore = w.id;
    let n = 0;
    const done = () => { m.chore = null; w.load = null; };
    return mk('empty', [
      { t: 'go', cell: m.wc, status: 'Going to empty the knock box', near: m.id },
      { t: 'work', n: S.R.chores.empty, st: m.id, status: 'Emptying grounds' },
      { t: 'do', fn: () => { n = m.grounds; m.grounds = 0; m.chore = null; w.load = 'grounds'; } },
      { t: 'go', cell: S.door, shared: true, status: 'Taking grounds to the bin' },
      { t: 'work', n: S.R.chores.dump, st: null, status: 'Tipping grounds in the bin' },
      { t: 'do', fn: () => { S.st.groundsOut += n; done(); } }
    ], done);
  }
  // A chore on one of this worker's machines. urgent: the machine can't work without it.
  function choreFor(S, w, mine, urgent) {
    const sack = S.R.supply.sackDoses;
    for (const it of S.items) {
      if (!mine(it) || it.chore != null) continue;
      const kc = knockOf(S, it), hc = hopperOf(S, it);
      if (kc && it.grounds >= (urgent ? kc : Math.ceil(kc / 2))) return emptyTask(S, w, it);
      if (hc && sacksAvailable(S) > 0 && hc - it.beans >= sack && it.beans <= (urgent ? 0 : Math.floor(hc / 4))) return refillTask(S, w, it);
    }
    // with nothing more pressing, clear the doorway into the store
    if (!urgent && S.supply.door > 0) for (const it of S.items) {
      if (mine(it) && it.built && it.chore == null && it.sacks < shelfOf(S, it)) return stockTask(S, w, it);
    }
    return null;
  }

  // ---------- worker tasks ----------
  const mk = (kind, steps, onAbort) => ({ kind, steps, i: 0, onAbort });
  function pickupHere(S, w) { return S.items.find((i) => i.built && i.type === 'pickup' && i.wsc.some((c) => same(c, w))); }
  // ---------- standing spots ----------
  // Every worker claims the cell it is standing on or walking to. Two workers never stand on one cell:
  // a worker whose spot is taken waits on the nearest free cell beside it. Idle workers give way.
  const idx = (c) => c.z * GW + c.x;
  function claimedBy(S, c, self, ignoreIdle) {
    for (const o of S.workers) {
      if (o === self || o.leaving || !o.claim || !same(o.claim, c)) continue;
      if (ignoreIdle && o.claimIdle) continue;
      return o;
    }
    return null;
  }
  function accessCells(S) {
    if (S.acache) return S.acache;
    const a = new Set();
    S.items.forEach((i) => {
      a.add(idx(i.wc)); if (i.cc) a.add(idx(i.cc));
      if (i.type === 'till' && i.built) qcells(S, i).forEach((c) => a.add(idx(c)));
    });
    wcells(S).forEach((c) => a.add(idx(c)));
    S.acache = a; return a;
  }
  function spotNear(S, c, w, ignoreIdle) {
    const avoid = accessCells(S), seen = new Uint8Array(GW * GH), q = [idx(c)];
    seen[q[0]] = 1;
    let fallback = null;
    while (q.length) {
      const i = q.shift(), x = i % GW, z = (i / GW) | 0, cell = { x, z };
      if (!(x === c.x && z === c.z) && !claimedBy(S, cell, w, ignoreIdle)) {
        if (!avoid.has(i)) return cell;
        if (!fallback) fallback = cell;
      }
      for (const d of DIRS) {
        const nx = x + d.x, nz = z + d.z; if (nx < 0 || nz < 0 || nx >= GW || nz >= IN) continue;
        const ni = nz * GW + nx; if (seen[ni] || S.grid[ni]) continue; seen[ni] = 1; q.push(ni);
      }
    }
    return fallback || c;
  }
  function stepsFrom(S, from) {
    const d = new Int16Array(GW * GH).fill(-1), q = [idx(from)]; d[q[0]] = 0;
    while (q.length) {
      const i = q.shift(), x = i % GW, z = (i / GW) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const ni = nz * GW + nx; if (d[ni] >= 0 || S.grid[ni]) continue;
        if (dx && dz && (S.grid[z * GW + nx] || S.grid[nz * GW + x])) continue;
        d[ni] = d[i] + 1; q.push(ni);
      }
    }
    return d;
  }
  // The closest free cell touching the crate, by walking distance. Access cells are a last resort.
  function buildSpot(S, cr, w) {
    const fp = footprint(cr), cand = [];
    fp.forEach((c) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = { x: c.x + dx, z: c.z + dz };
        if (n.x < 0 || n.z < 0 || n.x >= GW || n.z >= IN || S.grid[idx(n)]) continue;
        if (!cand.some((o) => same(o, n))) cand.push(n);
      }
    });
    const dist = stepsFrom(S, w), avoid = accessCells(S);
    let best = null, bs = 1e9;
    for (const n of cand) {
      const d = dist[idx(n)]; if (d < 0 || claimedBy(S, n, w, true)) continue;
      const sc = d * 2 + (avoid.has(idx(n)) ? 9 : 0);
      if (sc < bs) { bs = sc; best = n; }
    }
    return best;
  }
  function makeTask(S, w, cup, m) {
    const P = S.R.PROD[cup.prod], till = S.imap[cup.till], lname = P.name.toLowerCase();
    cup.state = 'claimed'; cup.by = w.id; m.res = w.id; S.flow.claimed++;
    if (P.grind) { S.supply.grindPending += P.doses; cup.grindOwed = P.doses; }
    let gr = null, pk = null;
    const steps = [
      { t: 'go', cell: till.wc, any: till.wsc, status: 'Fetching a ' + lname + ' order' },
      { t: 'do', fn: () => {
        if (cup.waste) { if (cup.grindOwed) { S.supply.grindPending -= cup.grindOwed; cup.grindOwed = 0; } killCup(S, cup); m.res = null; return 'stop'; }
        rm(till.buf, cup.id); cup.state = 'carried'; cup.at = null; w.carry = cup.id;
      } }
    ];
    if (P.grind) steps.push(
      { t: 'go', cell: () => { gr = nearest(S, w, (i) => i.built && i.type === 'grinder' && i.beans >= P.doses) || nearest(S, w, (i) => i.built && i.type === 'grinder'); return gr && gr.wc; }, status: 'Going to the grinder', lost: 'Waiting: no grinder' },
      { t: 'wait', cond: () => gr && (gr.res == null || gr.res === w.id) && gr.beans >= P.doses, status: 'Waiting for the grinder', face: () => gr && gr.id },
      { t: 'do', fn: () => { gr.res = w.id; gr.beans -= P.doses; S.st.beansUsed += P.doses; S.supply.grindPending -= cup.grindOwed; cup.grindOwed = 0; } },
      { t: 'work', n: P.grind, st: () => gr.id, status: 'Grinding' },
      { t: 'do', fn: () => { gr.res = null; } }
    );
    steps.push(
      { t: 'go', cell: m.wc, status: 'Going to ' + label(S, m) },
      { t: 'do', fn: () => { if (!P.grind) { m.beans -= P.doses; S.st.beansUsed += P.doses; } } },
      { t: 'work', n: P.make, st: m.id, status: 'Making ' + lname },
      { t: 'do', fn: () => { m.res = null; cup.made = true; if (knockOf(S, m)) m.grounds++; S.cash -= P.cost; S.st.costs += P.cost; } }
    );
    // milk drinks: steam at the milk station, then flavour at the syrup station
    for (const type of P.stations || []) {
      let st = null; const name = SHAPE[type].name.toLowerCase();
      steps.push(
        { t: 'go', cell: () => { st = nearest(S, w, (i) => i.built && i.type === type && (i.res == null || i.res === w.id)) || nearest(S, w, (i) => i.built && i.type === type); return st && st.wc; }, status: 'Going to the ' + name, lost: 'Waiting: no ' + name },
        { t: 'wait', cond: () => st && (st.res == null || st.res === w.id), status: 'Waiting for the ' + name, face: () => st && st.id },
        { t: 'do', fn: () => { st.res = w.id; } },
        { t: 'work', n: P[type], st: () => st.id, status: type === 'milk' ? 'Steaming milk' : 'Adding ' + (cup.prod === 'mocha' ? 'cream' : 'syrup') },
        { t: 'do', fn: () => { st.res = null; } }
      );
    }
    steps.push(
      { t: 'go', cell: () => { pk = nearest(S, w, (i) => i.built && i.type === 'pickup'); return pk && pk.wc; }, any: () => pk && pk.wsc, status: 'Taking it to pickup', lost: 'Waiting: no pickup counter' },
      { t: 'wait', cond: () => { if (cup.waste) return true; const p = pickupHere(S, w); return p && p.buf.length < p.cap; }, status: 'Blocked: pickup counter full', face: () => { const p = pickupHere(S, w); return p && p.id; } },
      { t: 'do', fn: () => {
        w.carry = null;
        if (cup.waste) { killCup(S, cup); S.st.wasted++; ev(S, w.name + ' binned a ' + lname + ' nobody is waiting for', 'bad'); return; }
        const p = pickupHere(S, w); p.buf.push(cup.id); cup.state = 'ready'; cup.at = p.id; S.flow.made++;
      } }
    );
    return mk('make', steps);
  }
  function orderTask(S, w, till) {
    till.res = w.id; let c = null;
    const rel = () => { till.res = null; };
    return mk('order', [
      { t: 'go', cell: till.wc, status: 'Going to ' + label(S, till), abortIf: () => !till.queue.length },
      { t: 'wait', cond: () => { c = S.cmap[till.queue[0]]; return c && c.state === 'queue' && at(c, till.cc); }, status: 'Waiting for the customer', face: () => till.id, abortIf: () => !till.queue.length },
      { t: 'do', fn: () => { c.state = 'ordering'; } },
      { t: 'work', n: S.R.orderTime, st: till.id, status: 'Taking an order', abortIf: () => c.state !== 'ordering' },
      { t: 'do', fn: () => { placeOrder(S, c, till); rel(); } }
    ], rel);
  }
  function chooseTask(S, w) {
    if (w.leaving) return mk('leave', [{ t: 'go', cell: STREET, shared: true, status: 'Heading home' }, { t: 'do', fn: () => { w.gone = true; return 'stop'; } }]);
    while (w.builds.length) {
      const cr = S.imap[w.builds[0]];
      if (!cr || cr.built) { w.builds.shift(); continue; }
      let spot = null;
      const cell = () => {
        if (!spot || S.grid[idx(spot)] || claimedBy(S, spot, w, true)) spot = buildSpot(S, cr, w);
        return spot || cr.wc;
      };
      return mk('build', [{ t: 'go', cell, status: 'Going to build ' + label(S, cr), near: cr.id }, { t: 'build', id: cr.id }]);
    }
    const mine = (it) => it.built && (w.all || w.patch.includes(it.id));
    // a machine that can't work without a chore gets it first
    const urgent = choreFor(S, w, mine, true);
    if (urgent) return urgent;
    for (const cup of S.cups) {
      if (cup.state !== 'queued' || cup.waste) continue;
      const P = S.R.PROD[cup.prod];
      if (P.grinds && grindFree(S) < P.doses) continue;
      const m = nearest(S, w, (i) => mine(i) && i.type === P.machine && i.res == null &&
        (!knockOf(S, i) || i.grounds < knockOf(S, i)) && (P.grinds || i.beans >= P.doses));
      if (m) return makeTask(S, w, cup, m);
    }
    let till = null, tq = 0;
    for (const it of S.items) if (mine(it) && it.type === 'till' && it.res == null && it.queue.length > tq && it.buf.length < it.cap) { tq = it.queue.length; till = it; }
    if (till) return orderTask(S, w, till);
    // nothing else to do: top up and tidy before it becomes urgent
    return choreFor(S, w, mine, false);
  }
  function runTask(S, w) {
    for (let g = 0; g < 8; g++) {
      const T = w.task; if (!T) return false;
      const s = T.steps[T.i];
      if (!s) { w.task = null; return false; }
      if (s.abortIf && s.abortIf()) { if (T.onAbort) T.onAbort(); w.task = null; w.face = null; return false; }
      if (s.status) w.status = s.status;
      if (s.t === 'go') {
        let c = typeof s.cell === 'function' ? s.cell() : s.cell;
        w.face = null;
        if (!c) { w.anim = (w.carry || w.load) ? 'hold' : 'idle'; w.status = s.lost || 'Nowhere to go'; return false; }
        const opts = typeof s.any === 'function' ? s.any() : s.any;
        if (opts) {
          if (opts.some((o) => at(w, o))) { T.i++; continue; }
          const free = opts.find((o) => !claimedBy(S, o, w, true));
          if (free) c = free;
        }
        if (at(w, c)) { T.i++; continue; }
        let dest = c;
        if (!s.shared && claimedBy(S, c, w, true)) {
          dest = spotNear(S, c, w, true);
          if (at(w, dest)) {
            w.anim = (w.carry || w.load) ? 'hold' : 'idle'; w.face = s.near != null ? s.near : null; w.tx = null;
            w.status = (s.status || 'Waiting') + ' · waiting for room';
            return false;
          }
        }
        goTo(S, w, dest);
        if (!move(w)) { w.tx = null; w.anim = 'idle'; w.status = 'Can’t get there'; return false; }
        w.anim = (w.carry || w.load) ? 'carry' : 'walk'; return true;
      }
      if (s.t === 'work') {
        if (s.left === undefined) s.left = s.n;
        const id = typeof s.st === 'function' ? s.st() : s.st;
        const it = S.imap[id]; if (it) it.busy = S.t;
        w.face = id; w.anim = 'work';
        if (--s.left <= 0) T.i++;
        return true;
      }
      if (s.t === 'wait') {
        w.face = s.face ? s.face() : null;
        if (s.cond()) { T.i++; continue; }
        w.anim = (w.carry || w.load) ? 'hold' : 'idle'; return false;
      }
      if (s.t === 'do') { const r = s.fn(); T.i++; if (r === 'stop') { w.task = null; return false; } continue; }
      if (s.t === 'build') {
        const cr = S.imap[s.id];
        if (!cr || cr.built) { w.task = null; w.face = null; return false; }
        w.face = cr.id; w.anim = 'build'; cr.busy = S.t; cr.work++;
        w.status = 'Building ' + label(S, cr) + ' · ' + Math.floor(100 * cr.work / cr.total) + '%';
        if (cr.work >= cr.total) complete(S, cr);
        return true;
      }
    }
    return false;
  }
  // What a worker is doing, for the activity timeline: a category, plus whether they are travelling (~) or held up (!).
  const ACT = { order: 'till', make: 'make', build: 'build', refill: 'chore', empty: 'chore', stock: 'chore', leave: 'idle' };
  function activityOf(w) {
    const cat = w.task ? ACT[w.task.kind] || 'idle' : 'idle';
    if (cat === 'idle') return 'idle';
    if (w.path.length || w.prog) return cat + '~';
    if (w.anim === 'work' || w.anim === 'build') return cat;
    return cat + '!';
  }
  function logActivity(S, w) {
    let a = S.acts[w.id];
    if (!a) a = S.acts[w.id] = { name: w.name, hired: S.t, segs: [] };
    const code = activityOf(w), segs = a.segs, last = segs[segs.length - 1];
    if (last && last[0] === code && last[2] === S.t - 1) last[2] = S.t;
    else segs.push([code, S.t, S.t]);
    while (segs.length && segs[0][2] < S.t - 86400) segs.shift();
    a.left = w.leaving ? S.t : undefined;
  }
  function homeOf(S, w) {
    for (const it of S.items) if (it.built && (w.all || w.patch.includes(it.id))) return it;
    return null;
  }
  function tickWorker(S, w) {
    if (!w.task) w.task = chooseTask(S, w);
    let busy = false;
    if (w.task) busy = runTask(S, w);
    if (!w.task && !busy) {
      const home = homeOf(S, w), here = { x: w.x, z: w.z };
      const want = home ? home.wc : here;
      const spot = claimedBy(S, want, w, false) ? spotNear(S, want, w, false) : want;
      if (!at(w, spot)) {
        goTo(S, w, spot);
        if (move(w)) { w.anim = 'walk'; w.status = home ? 'Idle · heading to ' + label(S, home) : 'Idle · stepping aside'; w.face = null; }
        else { w.anim = 'idle'; w.tx = null; }
      } else if (!w.carry) {
        w.anim = 'idle'; w.face = home ? home.id : null;
        w.status = home ? 'Idle · waiting for work' : (S.items.some((i) => !i.built) ? 'Idle · give me a crate to build' : 'Idle · no stations yet');
      }
    }
    w.util += ((busy ? 1 : 0) - w.util) / 1800;
    logActivity(S, w);
    const end = w.path.length ? w.path[w.path.length - 1] : null;
    w.claim = end ? { x: end.x, z: end.z } : { x: w.x, z: w.z };
    w.claimIdle = !w.task;
  }

  // ---------- customers ----------
  const fitOf = (S, rank) => S.R.fit[Math.min(rank, S.R.fit.length - 1)];
  function spawn(S) {
    const tills = S.items.filter((i) => i.built && i.type === 'till'); if (!tills.length) return;
    const menu = offered(S); if (!menu.length) return;
    // first choice: the starting three, plus any newer drink on the menu; someone after a milk drink falls back to espresso
    const M = S.R.mix, pool = ['espresso', 'filter', 'cake'].concat(PKEYS.filter((p) => !BASE.includes(p) && menu.includes(p)));
    let k = S.r() % pool.reduce((n, p) => n + M[p], 0), first = pool[0];
    for (const p of pool) { if (k < M[p]) { first = p; break; } k -= M[p]; }
    const rest = BASE.filter((p) => p !== first); if (S.r() % 2) rest.reverse();
    if (!BASE.includes(first)) { rm(rest, 'espresso'); rest.unshift('espresso'); }
    const prefs = [first].concat(rest, PKEYS.filter((p) => p !== first && !rest.includes(p)));
    let rank = 0; while (!menu.includes(prefs[rank])) rank++;
    let till = tills[0]; tills.forEach((t) => { if (t.queue.length < till.queue.length) till = t; });
    const id = S.nextId++, sx = (S.r() % 2) ? 11 : 0, ex = (S.r() % 2) ? 11 : 0;
    const c = { id, x: sx, z: 11, path: [], prog: 0, spd: S.R.customerStep, tx: null, tz: null, prefs, prod: prefs[rank], fit: fitOf(S, rank),
      arrive: S.t, pat: S.R.patience.min + S.r() % Math.max(1, S.R.patience.spread), state: 'queue', till: till.id, cup: null, paid: false, exit: { x: ex, z: 11 },
      wait: 0, outcome: null, look: S.r() % 8, anim: 'idle', face: null, gone: false, carry: null };
    till.queue.push(id); S.customers.push(c); S.cmap[id] = c; S.st.arrived++; S.flow.arrived++;
  }
  function placeOrder(S, c, till) {
    rm(till.queue, c.id);
    const menu = offered(S);
    if (!menu.includes(c.prod)) {
      let rank = c.prefs.findIndex((p) => menu.includes(p) || (PSHAPE[p].machine && unlocked(S, p)));
      if (rank < 0) { c.state = 'leave'; c.outcome = -1; S.st.abandoned++; S.flow.lostQueue++; c.tx = null; return; }
      c.prod = c.prefs[rank]; c.fit = fitOf(S, rank);
    }
    const P = S.R.PROD[c.prod];
    const cup = { id: S.nextId++, prod: c.prod, cust: c.id, till: till.id, state: 'queued', waste: false, made: false, at: till.id };
    S.cups.push(cup); S.upmap[cup.id] = cup; till.buf.push(cup.id);
    c.cup = cup.id; c.paid = true; c.state = 'waitDrink';
    S.cash += P.price; S.st.revenue += P.price; S.flow.ordered++;
  }
  function abandon(S, c) {
    const till = S.imap[c.till]; if (till) rm(till.queue, c.id);
    const F = S.flow, cup0 = c.paid ? S.upmap[c.cup] : null;
    if (!c.paid) F.lostQueue++;
    else if (!cup0 || cup0.state === 'ready') F.lostReady++;
    else if (cup0.state === 'queued') F.lostRail++;
    else F.lostMaking++;
    if (c.paid) {
      const cup = S.upmap[c.cup];
      if (cup) {
        cup.waste = true;
        if (cup.state === 'queued') killCup(S, cup);
        else if (cup.state === 'ready') { killCup(S, cup); S.st.wasted++; }
      }
      const pr = S.R.PROD[c.prod].price; S.cash -= pr; S.st.refunds += pr;
    }
    S.st.abandoned++;
    S.st.demand = clampD(S.st.demand - S.R.demand.walkoutLoss, S);
    S.st.sat += (0 - S.st.sat) * 0.05;
    ev(S, 'A customer gave up and left' + (c.paid ? ', refunded' : ''), 'bad');
    c.state = 'leave'; c.outcome = -1; c.tx = null;
  }
  function finish(S, c) {
    S.flow.served++;
    const lead = S.t - c.arrive, r = lead / c.pat;
    const tf = r <= 0.35 ? 1 : 1 - 0.7 * (r - 0.35) / 0.65;
    const s = c.fit * tf;
    S.st.served++; S.served.push(S.t);
    S.st.sat += (s - S.st.sat) * 0.05;
    S.st.demand = clampD(S.st.demand + S.R.demand.gain * (s - S.R.demand.growAt), S);
    S.st.lead = S.st.served === 1 ? lead : S.st.lead + (lead - S.st.lead) * 0.1;
    c.outcome = s; c.state = 'leave'; c.carry = c.prod; c.tx = null;
  }
  function walk(S, a, cell) {
    if (at(a, cell)) { a.anim = 'idle'; return true; }
    goTo(S, a, cell);
    if (move(a)) a.anim = 'walk'; else { a.anim = 'idle'; a.tx = null; }
    return false;
  }
  function tickCustomer(S, c, waiting) {
    if ((c.state === 'queue' || c.state === 'ordering' || c.state === 'waitDrink') && S.t - c.arrive > c.pat) abandon(S, c);
    c.face = null;
    if (c.state === 'queue') {
      const till = S.imap[c.till];
      if (walk(S, c, qcell(S, till, till.queue.indexOf(c.id)))) c.face = till.id;
    } else if (c.state === 'ordering') {
      c.anim = 'idle'; c.face = c.till;
    } else if (c.state === 'waitDrink') {
      const cup = S.upmap[c.cup];
      if (cup && cup.state === 'ready') { c.state = 'collect'; c.wait = 0; }
      else {
        const cells = wcells(S), i = waiting.indexOf(c);
        if (walk(S, c, cells[Math.max(0, i) % cells.length])) { const pk = S.items.find((it) => it.built && it.type === 'pickup'); c.face = pk ? pk.id : null; }
      }
    }
    if (c.state === 'collect') {
      const cup = S.upmap[c.cup], p = cup && S.imap[cup.at];
      if (!p) { c.state = 'waitDrink'; return; }
      if (walk(S, c, p.cc)) { c.face = p.id; if (++c.wait >= S.R.collectTime) { killCup(S, cup); finish(S, c); } }
    } else if (c.state === 'leave') {
      if (walk(S, c, c.exit)) c.gone = true;
    }
  }

  // ---------- actions ----------
  function apply(S, a) {
    const op = a[1];
    if (S.end) return 'The game is over';
    if (op === 'place') {
      const type = a[2], x = a[3], z = a[4], r = a[5] & 3, c = S.R.CAT[type];
      if (!c) return 'Unknown item';
      if (!allowed(S, type)) return 'Not for this shop';
      const locked = needsResearch(S, type); if (locked) return 'Needs research: ' + TOPICS[locked].name;
      if (S.cash < c.cost) return 'Not enough cash';
      const why = canPlace(S, type, x, z, r); if (why) return why;
      const ready = c.mins <= 0, it = addItem(S, type, x, z, r, ready);
      S.cash -= c.cost; S.st.capex += c.cost;
      ev(S, ready ? label(S, it) + ' marked out' : label(S, it) + ' delivered as a crate. A worker needs to build it.', 'info');
      return null;
    }
    if (op === 'remove') {
      const it = S.imap[a[2]]; if (!it) return 'Not found';
      const why = whyNotRemove(S, it); if (why) return why;
      const back = it.built ? Math.floor(S.R.CAT[it.type].cost / 2) : S.R.CAT[it.type].cost;
      rm(S.items, it); delete S.imap[it.id];
      S.workers.forEach((w) => { rm(w.patch, it.id); rm(w.builds, it.id); });
      S.cash += back; S.st.capex -= back;
      rebuild(S);
      ev(S, (!S.R.CAT[it.type].cost ? 'Cleared ' : it.built ? 'Sold ' : 'Cancelled ') + SHAPE[it.type].name.toLowerCase(), 'info');
      return null;
    }
    if (op === 'patch' || op === 'all' || op === 'build' || op === 'fire') {
      const w = S.wmap[a[2]]; if (!w || w.leaving) return 'No such worker';
      if (op === 'all') { w.all = true; w.patch = []; return null; }
      if (op === 'fire') {
        if (S.workers.filter((o) => !o.leaving).length <= 1) return 'You need at least one worker';
        w.leaving = true; w.builds = []; ev(S, w.name + ' is finishing up and leaving', 'info'); return null;
      }
      const it = S.imap[a[3]]; if (!it) return 'Not found';
      if (op === 'build') {
        if (it.built) return 'Already built';
        if (w.builds.includes(it.id)) rm(w.builds, it.id); else w.builds.push(it.id);
        return null;
      }
      if (!it.built) return 'Build it first';
      if (w.all) { w.all = false; w.patch = [it.id]; }
      else if (w.patch.includes(it.id)) rm(w.patch, it.id);
      else w.patch.push(it.id);
      return null;
    }
    if (op === 'hire') {
      if (S.workers.length >= S.R.maxWorkers) return 'The shop is full';
      if (S.cash < S.R.hireCost) return 'Not enough cash';
      S.cash -= S.R.hireCost; S.st.costs += S.R.hireCost;
      const w = addWorker(S, STREET.x, STREET.z);
      ev(S, w.name + ' joined the team', 'good');
      mark(S, 'hire', w.name + ' hired');
      return null;
    }
    if (op === 'open') {
      if (!S.open) { const why = whyNotOpen(S); if (why) return why; }
      S.open = !S.open; ev(S, S.open ? 'The shop is open' : 'The shop is closed. No new customers.', S.open ? 'good' : 'info');
      return null;
    }
    if (op === 'order') {
      const n = Math.max(1, Math.min(50, a[2] | 0));
      return placeSupplyOrder(S, n, false);
    }
    if (op === 'research') {
      const k = a[2], r = S.research[k];
      if (!r) return 'Unknown research';
      if (r.complete) return 'Already researched';
      if (!topicOpen(S, k) && (a[3] | 0) > 0) return 'Not for this shop';
      const pre = prereqs(k).find((p) => !S.research[p].complete); if (pre && (a[3] | 0) > 0) return 'Needs research: ' + TOPICS[pre].name;
      r.weight = Math.max(0, Math.min(3, a[3] | 0));
      S.resPlan = [];   // choosing by hand drops any plan
      return null;
    }
    // plan a topic: research everything it needs, in turn, then the topic itself. No topic clears the plan.
    if (op === 'plan') {
      const k = a[2];
      if (!k) { S.resPlan = []; return null; }
      if (!S.research[k]) return 'Unknown research';
      if (S.research[k].complete) return 'Already researched';
      if (routeTo(S, k).some((o) => !topicOpen(S, o))) return 'Not for this shop';
      S.resPlan = routeTo(S, k);
      for (const o of TKEYS) if (!S.research[o].complete) S.research[o].weight = o === S.resPlan[0] ? 1 : 0;
      return null;
    }
    if (op === 'auto') {
      if ((a[3] | 0) > 0 && needsResearch(S, 'auto')) return 'Needs research: Standing orders';
      // standing order: when beans in the shop + at the door + on order fall below `point` doses, order `qty` sacks
      S.supply.auto = { point: Math.max(0, a[2] | 0), qty: Math.max(0, Math.min(50, a[3] | 0)) };
      ev(S, S.supply.auto.qty ? 'Standing order: ' + S.supply.auto.qty + ' sacks whenever beans drop below ' + S.supply.auto.point + ' cups' : 'Standing order cancelled', 'info');
      return null;
    }
    if (op === 'menu') {
      const p = a[2]; if (!PSHAPE[p]) return 'Unknown product';
      S.menuOff[p] = !S.menuOff[p]; return null;
    }
    return 'Unknown action';
  }
  function act(S, op) {
    if (S.pending.length) S.pending = [];               // acting during a replay takes over from here
    const a = [S.t].concat(Array.prototype.slice.call(arguments, 1));
    const err = apply(S, a);
    if (!err) S.log.push(a);
    return err;
  }

  function step(S) {
    if (S.end) return;
    while (S.pending.length && S.pending[0][0] <= S.t) { const a = S.pending.shift(); apply(S, a); S.log.push(a); }
    S.t++;
    if (S.open && S.items.some((i) => i.built && i.type === 'till')) {
      if (S.r() / 4294967296 < rate(S) / 3600) {
        const n = S.r() % 10 === 0 ? 2 + S.r() % 2 : 1;
        for (let k = 0; k < n; k++) spawn(S);
      }
    }
    for (const w of S.workers) tickWorker(S, w);
    const waiting = S.customers.filter((c) => c.state === 'waitDrink');
    for (const c of S.customers) tickCustomer(S, c, waiting);
    if (S.customers.some((c) => c.gone)) { S.customers = S.customers.filter((c) => { if (c.gone) delete S.cmap[c.id]; return !c.gone; }); }
    if (S.workers.some((w) => w.gone)) { S.workers = S.workers.filter((w) => { if (w.gone) delete S.wmap[w.id]; return !w.gone; }); }
    for (const it of S.items) it.util += ((it.busy === S.t ? 1 : 0) - it.util) / 1800;
    if (S.t % TPM === 0) { const c = S.workers.length * S.R.wagePerMin + S.R.rentPerMin; S.cash -= c; S.st.costs += c; }
    // deliveries
    while (S.supply.orders.length && S.supply.orders[0].due <= S.t) {
      const o = S.supply.orders.shift();
      S.supply.onOrder -= o.n; S.supply.door += o.n;
      ev(S, 'Delivery: ' + o.n + ' sack' + (o.n > 1 ? 's' : '') + ' of beans at the back door', 'good');
      mark(S, 'delivery', o.n + ' sack' + (o.n > 1 ? 's' : '') + ' delivered');
    }
    if (S.t % TPM === 0) {
      researchStep(S);
      const sp = S.supply, sack = S.R.supply.sackDoses;
      const position = beansInShop(S) + (sp.door + sacksStored(S) + sp.onOrder) * sack;
      if (sp.auto.qty && position < sp.auto.point && placeSupplyOrder(S, sp.auto.qty, true)) {
        if (!sp.warnedCash) { ev(S, 'Standing order skipped: not enough cash for beans', 'bad'); sp.warnedCash = true; }
      } else sp.warnedCash = false;
      // a dry minute: drinks are waiting and no machine that makes them has beans
      const waitingFor = new Set(S.cups.filter((c) => c.state === 'queued').map((c) => c.prod));
      if ([...waitingFor].some((p) => { const P = S.R.PROD[p]; return P.grinds ? grindFree(S) < 1 && S.items.some((i) => i.built && i.type === 'grinder') : (S.items.some((i) => i.built && i.type === P.machine) && !S.items.some((i) => i.built && i.type === P.machine && i.beans >= (P.doses || 0))); })) S.st.dryMins++;
      record(S);
    }
    while (S.served.length && S.served[0] <= S.t - 3600) S.served.shift();
    if (S.t % TPM === 0) judge(S);
  }

  // ---------- winning and losing ----------
  // A level's goals are met one after another. Kinds: served n, cash n (pence), menu p, rate (n served in the last hour
  // and door-to-cup under `lead` seconds, held for `mins`), trade (n customers an hour coming in), handsOff (`mins` with
  // no actions, walk-outs at most walkPct% and cash ending higher).
  function goalNow(S, g) {
    if (g.kind === 'served') return { v: S.st.served, of: g.n };
    if (g.kind === 'cash') return { v: Math.max(0, S.cash), of: g.n };
    if (g.kind === 'menu') return { v: offered(S).includes(g.p) ? 1 : 0, of: 1 };
    if (g.kind === 'trade') return { v: Math.floor(rate(S)), of: g.n };
    return { v: S.judge.streak, of: g.mins };
  }
  const goalOf = (S) => (S.level && S.level.goals[S.goal]) || null;
  function windowFrom(S) {
    const j = S.judge;
    j.streak = 0; j.acts = S.log.length; j.from = { t: S.t, served: S.st.served, walked: S.st.abandoned, cash: S.cash };
  }
  function finishGame(S, won, why, text) {
    S.end = { won, why, text, t: S.t };
    ev(S, text, won ? 'good' : 'bad');
    mark(S, won ? 'won' : 'lost', text);
  }
  function judge(S) {
    const F = S.R.fail, j = S.judge;
    if (F.overdrawnMins > 0) {
      if (S.cash < -F.overdraft) return finishGame(S, false, 'bankrupt', 'The bank stopped the overdraft and closed the shop.');
      j.red = S.cash < 0 ? j.red + 1 : Math.max(0, j.red - 1);
      if (j.red >= F.overdrawnMins) return finishGame(S, false, 'bankrupt', 'Overdrawn for too long: the bank closed the shop.');
    }
    if (F.satMins > 0 && S.st.served + S.st.abandoned >= F.after) {
      j.poor = S.st.sat < F.sat ? j.poor + 1 : Math.max(0, j.poor - 1);
      if (j.poor >= F.satMins) return finishGame(S, false, 'service', 'Customers stopped coming: the service was too poor for too long.');
    }
    for (let g = goalOf(S); g; g = goalOf(S)) {
      if (g.kind === 'rate') j.streak = S.served.length >= g.n && (!g.lead || S.st.lead <= g.lead) ? j.streak + 1 : 0;
      if (g.kind === 'handsOff') {
        if (S.log.length !== j.acts) windowFrom(S);
        else if ((j.streak = (S.t - j.from.t) / TPM) >= g.mins) {
          const walked = S.st.abandoned - j.from.walked, done = walked + S.st.served - j.from.served;
          if (walked * 100 > done * g.walkPct || S.cash <= j.from.cash) { windowFrom(S); ev(S, 'Not quite: the last hour had too many walk-outs or no profit. The clock starts again.', 'bad'); }
        }
      }
      const p = goalNow(S, g);
      if (p.v < p.of) break;
      S.goal++; windowFrom(S);
      ev(S, 'Goal met: ' + g.title, 'good'); mark(S, 'goal', g.title);
      if (!goalOf(S)) return finishGame(S, true, 'goals', 'Every goal met.');
    }
    if (S.level && S.level.limitMins && S.t >= S.level.limitMins * TPM) finishGame(S, false, 'time', 'Out of time before the goals were met.');
  }

  // ---------- research ----------
  function needsResearch(S, thing) {
    if (!S.R.research.enabled) return null;
    for (const k of TKEYS) if ((TOPICS[k].unlocks || []).includes(thing) && !S.research[k].complete) return k;
    return null;
  }
  // slots for an item type, as research has left them
  const capOf = (S, type) => S.R.CAT[type].cap || 0;
  // the topics still to research before k, in an order that works, ending with k itself
  function routeTo(S, k, out) {
    out = out || [];
    if (S.research[k].complete || out.includes(k)) return out;
    for (const p of prereqs(k)) routeTo(S, p, out);
    out.push(k); return out;
  }
  // a finished topic: set its rules, then bring existing equipment and staff up to date
  function applyTopic(S, k) {
    for (const c of topicChanges(S.R, k)) { const keys = c.path.split('.'), leaf = keys.pop(); keys.reduce((o, key) => o[key], S.R)[leaf] = c.to; }
    derive(S.R);
    for (const it of S.items) it.cap = capOf(S, it.type);
    for (const w of S.workers) w.spd = S.R.walkStep;
  }
  function researchStep(S) {
    const rs = S.research, active = TKEYS.filter((k) => !rs[k].complete && rs[k].weight > 0);
    if (!active.length) return;
    const W = active.reduce((n, k) => n + rs[k].weight, 0);
    // capacity after switching losses, in hundredths of a unit, carried over so nothing is lost to rounding
    // capacity after switching losses, in hundredths of a unit; each topic keeps its own fraction so equal weights stay equal
    const cap = Math.floor(S.R.research.rate * 10000 / (100 + S.R.research.switchPct * (active.length - 1)));
    S.st.researchLost = (S.st.researchLost || 0) + (S.R.research.rate * 100 - cap) / 100;
    const share = active.map((k) => { const r = rs[k]; r.carry = (r.carry || 0) + Math.floor(cap * r.weight / W); const v = Math.floor(r.carry / 100); r.carry -= v * 100; return v; });
    active.forEach((k, i) => {
      const r = rs[k], work = S.R.research.topics[k].work;
      if (r.started < 0) r.started = S.t;
      r.done = Math.min(work, r.done + share[i]);
      if (r.done >= work) {
        r.complete = true; r.weight = 0; r.finished = S.t;
        ev(S, 'Research complete: ' + TOPICS[k].name + '. ' + TOPICS[k].blurb, 'good');
        mark(S, 'research', TOPICS[k].name);
        applyTopic(S, k);
      }
    });
    // a plan carries on to the next topic on its route once nothing else is running
    if (S.resPlan.length) {
      S.resPlan = S.resPlan.filter((k) => !rs[k].complete);
      const next = S.resPlan[0];
      if (next && !TKEYS.some((k) => !rs[k].complete && rs[k].weight > 0)) rs[next].weight = 1;
    }
  }

  // ---------- history: one sample per game minute, kept for 24 hours ----------
  function record(S) {
    const H = S.hist, c = { queue: 0, rail: 0, making: 0, ready: 0 };
    for (const it of S.items) if (it.type === 'till') c.queue += it.queue.length;
    for (const k of S.cups) { if (k.waste) continue; if (k.state === 'queued') c.rail++; else if (k.state === 'ready') c.ready++; else c.making++; }
    const F = S.flow, lq = F.lostQueue, lr = lq + F.lostRail, lm = lr + F.lostMaking, rs = S.research;
    const v = { t: S.t, queue: c.queue, rail: c.rail, making: c.making, ready: c.ready, beans: beansInShop(S), door: S.supply.door * S.R.supply.sackDoses, store: sacksStored(S) * S.R.supply.sackDoses,
      onOrder: S.supply.onOrder * S.R.supply.sackDoses, grounds: S.items.reduce((n, i) => n + (i.grounds || 0), 0), cash: S.cash, served: S.st.served, walked: S.st.abandoned, used: S.st.beansUsed,
      cArrived: F.arrived, cOrdered: F.ordered + lq, cClaimed: F.claimed + lr, cMade: F.made + lm, cDone: F.served + lm + F.lostReady,
      rAvailable: TKEYS.filter((k) => !rs[k].complete && rs[k].started < 0).length, rActive: TKEYS.filter((k) => !rs[k].complete && rs[k].started >= 0).length, rDone: TKEYS.filter((k) => rs[k].complete).length };
    for (const k in H) { H[k].push(v[k]); if (H[k].length > 1440) H[k].shift(); }
  }

  // ---------- replay codes ----------
  function encode(S) {
    const o = { v: S.v, s: S.seed, a: S.log };
    if (Object.keys(S.over).length) o.r = S.over;
    if (S.level) o.l = S.level.id;
    const s = JSON.stringify(o);
    return 'CF1-' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    const m = /^CF1-([A-Za-z0-9_-]+)$/.exec(String(code).trim().replace(/\s+/g, ''));
    if (!m) throw new Error('That is not a Coffee Flow replay code. Codes start with CF1-.');
    let b = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    const o = JSON.parse(atob(b));
    if (typeof o.s !== 'number' || !Array.isArray(o.a)) throw new Error('This code is damaged. Copy it again from the start.');
    return { seed: o.s, log: o.a, rules: o.r || {}, level: o.l || null, version: o.v || 1, current: (o.v || 1) === VERSION };
  }
  function hash(S) {
    const s = JSON.stringify([S.t, S.cash, S.st, S.goal, S.end, S.judge, S.flow, S.research, S.supply.door, S.supply.onOrder, S.items.map((i) => [i.id, i.built, i.work, i.buf, i.queue, i.beans, i.grounds, i.sacks]),
      S.workers.map((w) => [w.id, w.x, w.z, w.carry]), S.customers.map((c) => [c.id, c.x, c.z, c.state]), S.cups.map((c) => [c.id, c.state])]);
    let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  root.CoffeeSim = { VERSION, create, step, act, canPlace, whyNotRemove, whyNotOpen, offered, unlocked, rate, label, dimsOf, footprint,
    wcell, ccell, encode, decode, hash, rulesWith, flatRules, DEFAULT_RULES, topicChanges, routeTo, prereqs, SHAPE, LAYOUT, TOPICS, TKEYS, BASE, recipe, needsResearch, capOf, allowed, topicOpen, inRoom, goalNow, goalOf, activityOf, CAT, PROD, PKEYS, GW, GH, IN, TPM };
})(typeof window !== 'undefined' ? window : globalThis);
