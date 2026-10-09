// The research tree: where each topic sits, what state it is in, and what it is worth.
import { Sim, type GameState } from './engine';
import { money } from './format';
import { researchable } from './derive';

// lanes as rows, tiers as columns, chains side by side within a lane
export const LANES: [string, string][] = [['counter', 'Front counter'], ['bar', 'Bar'], ['drinks', 'Drinks'], ['menu', 'Menu'], ['beans', 'Beans'], ['guests', 'Customers'], ['team', 'Team']];
// where each topic sits: [row within its lane, segment, icon]. Columns come from how deep a topic is in the tree,
// so hiding finished topics slides the rest to the left.
export const TREE: Record<string, [number, number, string]> = {
  rail1: [0, 0, 'till'], rail2: [0, 0, 'till'], rail3: [0, 0, 'till'], cards: [1, 0, 'till'],
  counter1: [0, 1, 'pickup'], counter2: [0, 1, 'pickup'], counter3: [0, 1, 'pickup'], names: [1, 1, 'cup'],
  espresso: [0, 0, 'espresso'], burrs: [0, 0, 'grinder'], barista1: [1, 0, 'espressoCup'], barista2: [1, 0, 'worker'],
  hoppers: [0, 1, 'grinder'], knock: [0, 1, 'brewer'],
  foam: [0, 0, 'milk'], micro: [0, 0, 'cup:cappuccino'], art1: [1, 0, 'cup:latte'], art2: [1, 0, 'cup:latte'], art3: [1, 0, 'cup:latte'],
  syrup1: [2, 0, 'syrup'], syrup2: [2, 0, 'cup:caramel'], syrup3: [2, 0, 'cup:gingerbread'], cream: [3, 0, 'cup:mocha'],
  blend: [0, 0, 'cup'], cake: [0, 1, 'pastry'], bake: [0, 1, 'cake'],
  standing: [0, 0, 'sack'], roaster: [0, 1, 'sack'], wholesale: [0, 1, 'store'],
  music: [0, 0, 'customer'], loyalty: [0, 0, 'customer'], press: [0, 0, 'research'],
  shoes: [0, 0, 'worker'], rota: [0, 0, 'worker'], fitout: [0, 1, 'stock']
};
// how a rule change reads: what it is, and how to show a value
const secs = (v: number) => v + 's', mins = (v: number) => v + ' min';
const STAT: Record<string, [string, (v: number) => string]> = {
  'items.till.slots': ['Order rail', (v) => v + ' cups'], 'items.pickup.slots': ['Pickup counter', (v) => v + ' cups'],
  orderTime: ['Taking an order', secs], collectTime: ['Collecting a drink', secs],
  'products.espresso.grind': ['Grinding a dose', secs],
  'products.filter.make': ['Pouring a filter', secs], 'products.espresso.make': ['Pulling an espresso', secs], 'products.cake.make': ['Plating cake', secs],
  'items.brewer.hopper': ['Brewer hopper', (v) => v + ' doses'], 'items.grinder.hopper': ['Grinder hopper', (v) => v + ' doses'],
  'items.brewer.knock': ['Brewer knock box', (v) => v + ' drinks'], 'items.espresso.knock': ['Espresso knock box', (v) => v + ' drinks'],
  'products.filter.price': ['Filter coffee', money], 'products.espresso.price': ['Espresso', money],
  'products.latte.price': ['Latte', money], 'products.cappuccino.price': ['Cappuccino', money], 'products.cake.cost': ['Cake ingredients', money],
  'supply.leadMins': ['Bean delivery', mins], 'supply.sackCost': ['Sack of beans', money],
  'patience.min': ['Shortest wait before leaving', (v) => Math.round(v / 60) + ' min'],
  'demand.gain': ['Trade growth', (v) => (v * 100).toFixed(1) + '%'], 'demand.max': ['Busiest trade', (v) => '×' + v],
  walkStep: ['Staff step', secs], maxWorkers: ['Staff limit', (v) => v + ' people']
};

export type TopicState = 'done' | 'active' | 'locked' | 'paused' | 'ready';
export const STATE_TEXT: Record<TopicState, string> = { done: 'Done', active: 'In progress', paused: 'Paused', ready: 'Ready to start', locked: 'Needs research first' };
export function tstate(S: GameState, k: string): TopicState {
  const r = S.research[k];
  if (r.complete) return 'done';
  if (r.weight > 0) return 'active';
  if (Sim.prereqs(k).some((p) => !S.research[p].complete)) return 'locked';
  return r.done > 0 ? 'paused' : 'ready';
}

// grid cells for every shown topic, and the lane rows that hold anything
export function treeLayout(S: GameState, hideDone: boolean) {
  const shown = researchable(S).filter((k) => !(hideDone && S.research[k].complete));
  const depth: Record<string, number> = {};
  const d = (k: string): number => depth[k] || (depth[k] = 1 + Math.max(0, ...Sim.prereqs(k).filter((p) => shown.includes(p)).map(d)));
  // each lane's second set of chains starts one column after its own first set ends
  const segW: Record<string, [number, number]> = {};
  shown.forEach((k) => { const l = Sim.TOPICS[k].lane; segW[l] = segW[l] || [0, 0]; segW[l][TREE[k][1]] = Math.max(segW[l][TREE[k][1]], d(k)); });
  const colOf = (k: string) => { const w = segW[Sim.TOPICS[k].lane]; return (TREE[k][1] && w[0] ? w[0] + 1 : 0) + d(k); };
  const cols = Math.max(1, ...shown.map(colOf));
  const template = 'var(--lane-w) repeat(' + cols + ', var(--col-w))';
  const rows: { lane: string; label: string; row: number; span: number }[] = []; let gridRow = 1;
  const cell: Record<string, { row: number; col: number }> = {};
  LANES.forEach(([lane, label]) => {
    const mine = shown.filter((k) => Sim.TOPICS[k].lane === lane);
    if (!mine.length) return;
    const used = [...new Set(mine.map((k) => TREE[k][0]))].sort();
    rows.push({ lane, label, row: gridRow, span: used.length });
    mine.forEach((k) => { cell[k] = { row: gridRow + used.indexOf(TREE[k][0]), col: colOf(k) }; });
    gridRow += used.length;
  });
  return { shown, cell, rows, template };
}

// the products a topic puts on the menu: ones it names, and ones its machines make that no other topic holds back
export function topicProducts(S: GameState, k: string) {
  const U = Sim.TOPICS[k].unlocks || [], PROD = S.R.PROD;
  const heldBy = (p: string) => Sim.TKEYS.find((o) => (Sim.TOPICS[o].unlocks || []).includes(p));
  return Sim.PKEYS.filter((p) => U.includes(p) || (U.includes(PROD[p].machine) && (!heldBy(p) || heldBy(p) === k)));
}
export interface TopicChange { label: string; text?: string; from?: string | null; to?: string }
// what a topic is worth and what it costs, from the current rules
export function topicEffects(S: GameState, k: string) {
  const T = Sim.TOPICS[k], CAT = S.R.CAT, PROD = S.R.PROD;
  if (T.sets) {
    const ch = Sim.topicChanges(S.R, k), done = S.research[k].complete;
    // a percentage across many machines reads better as one line
    const pct = S.R.research.topics[k].pct!;
    const changes: TopicChange[] = ch.length > 3 ? [{ label: ch[0].path.endsWith('buildMins') ? 'Build times' : 'Making times', text: Math.abs(pct) + '% shorter' }]
      : ch.map((c) => ({ label: STAT[c.path][0], from: done ? null : STAT[c.path][1](c.from), to: STAT[c.path][1](done ? c.from : c.to) }));
    return { changes, unlocks: [] as string[], gains: [] as string[], costs: [] as string[], recipes: [] as string[] };
  }
  const items = (T.unlocks || []).filter((t) => CAT[t]);
  const prods = topicProducts(S, k);
  const unlocks = items.map((t) => CAT[t].name + ' ' + money(CAT[t].cost)).concat(prods.map((p) => PROD[p].name + ' on the menu ' + money(PROD[p].price)));
  if ((T.unlocks || []).includes('auto')) unlocks.push('Automatic bean orders');
  const gains: string[] = [], costs: string[] = [];
  // share of customers who would pick it first, against the menu as it stands
  const pool = Sim.BASE.concat(Sim.PKEYS.filter((o) => !Sim.BASE.includes(o) && Sim.offered(S).includes(o)));
  prods.forEach((p) => {
    const total = pool.concat(pool.includes(p) ? [] : [p]).reduce((n, o) => n + S.R.mix[o], 0);
    gains.push(Math.round(100 * S.R.mix[p] / total) + '% of customers would pick ' + PROD[p].name.toLowerCase() + ' first');
    costs.push(money(PROD[p].cost) + ' a ' + (p === 'cake' ? 'slice' : 'cup') + ' in ingredients');
  });
  if (prods.length) gains.push(Math.round(S.R.demand.menuBonus * 100) + '% more customers for each extra item on the menu');
  if (items.length) costs.push(money(items.reduce((n, t) => n + CAT[t].cost, 0)) + ' of equipment to buy');
  if ((T.unlocks || []).includes('auto')) { gains.push('Beans reorder themselves before you run dry'); costs.push('Buys sacks even when cash is tight'); }
  return { changes: [] as TopicChange[], unlocks, gains, costs, recipes: prods };
}
