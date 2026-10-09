// The ticket rail: steps, problems, milestones and goals. Every ticket is worked out from the game state, so it stays
// while the problem lasts and comes down when it is fixed.
import { Sim, type GameState, type Level } from './engine';
import { money } from './format';
import { researchable, sumCups, unassigned } from './derive';
import { trayOf } from './ui';

export type Severity = 'step' | 'crit' | 'warn' | 'good' | 'info' | 'goal';
export type TicketAction = 'tray' | 'assignAll' | 'open' | 'order' | 'show' | 'research' | 'none';
export interface Ticket {
  id?: string; sev: Severity; k: string; title: string; body?: string; bar?: number | null;
  btn?: string; act?: TicketAction; arg?: string | number | null; dismiss?: string;
}
export interface TicketContext { S: GameState; level: Level | null; dismissed: Set<string>; goalsMet: Set<string> }

const has = (S: GameState, t: string, built?: boolean) => S.items.some((i) => i.type === t && (!built || i.built));

export function tutorialStep(S: GameState, level: Level | null): Ticket | null {
  const sellable = (built: boolean) => Sim.PKEYS.some((p) => has(S, S.R.PROD[p].machine, built));
  const who = S.workers[0] ? S.workers[0].name : 'your worker';
  if (S.st.served > 0 || (level && !level.tutorial)) return null;
  if (!(has(S, 'till') && has(S, 'pickup') && sellable(false))) {
    const next = !has(S, 'till') ? ['Place a till', 'Customers order and pay here. Pick Counters below, then Till.', 'counters']
      : !has(S, 'pickup') ? ['Place a pickup counter', 'Finished drinks wait here. It is in Counters too.', 'counters']
      : ['Add a batch brewer', 'Something to sell. Pick Machines, then Batch brewer.', 'machines'];
    return { sev: 'step', k: 'Step 1 of 4', title: next[0], body: next[1], btn: 'Open ' + next[2][0].toUpperCase() + next[2].slice(1), act: 'tray', arg: next[2] };
  }
  if (!(has(S, 'till', true) && has(S, 'pickup', true) && sellable(true))) {
    const n = unassigned(S).length;
    return { sev: 'step', k: 'Step 2 of 4', title: 'Build the crates', body: n ? 'Right-click a crate and pick ' + who + ', or hand them all over.' : who + ' is on it. Speed up time while you wait.', btn: n ? 'Give all to ' + who : '', act: 'assignAll' };
  }
  if (!S.open && !S.st.arrived) return { sev: 'step', k: 'Step 3 of 4', title: 'Open the shop', body: 'Customers start arriving once you open.', btn: 'Open shop', act: 'open' };
  return { sev: 'step', k: 'Step 4 of 4', title: 'Serve a customer', body: 'They order at the till, ' + who + ' brews, and they collect at pickup.' };
}

// free play has its own milestones; a level's goals come from the sim, which judges them
export const FREE_PLAY_GOALS: [string, string, (S: GameState) => number, number][] = [
  ['serve50', 'Serve 50 customers', (S) => S.st.served, 50],
  ['cash1000', 'Have £1,000 in the bank', (S) => Math.floor(S.cash / 100), 1000],
  ['espresso', 'Put espresso on the menu', (S) => (Sim.offered(S).includes('espresso') ? 1 : 0), 1],
  ['serve200', 'Serve 200 customers', (S) => S.st.served, 200],
  ['cake', 'Put cake on the menu', (S) => (Sim.offered(S).includes('cake') ? 1 : 0), 1],
  ['cash2500', 'Have £2,500 in the bank', (S) => Math.floor(S.cash / 100), 2500]
];
// free play milestones reached since last asked, in order
export function newlyMetGoals(S: GameState, goalsMet: Set<string>) {
  const met: string[] = [];
  for (const [id, , val, target] of FREE_PLAY_GOALS) {
    if (goalsMet.has(id)) continue;
    if (val(S) < target) break;
    met.push(id); goalsMet.add(id);
  }
  return met;
}
export const goalTitle = (id: string) => FREE_PLAY_GOALS.find((g) => g[0] === id)![1];

function levelGoalTicket(S: GameState, level: Level): Ticket | null {
  const g = Sim.goalOf(S); if (!g) return null;
  const p = Sim.goalNow(S, g), n = level.goals.length;
  const body = g.kind === 'served' ? p.v + ' of ' + p.of + ' served'
    : g.kind === 'cash' ? money(p.v) + ' of ' + money(p.of)
    : g.kind === 'rate' ? S.served.length + ' served in the last hour · held for ' + p.v + ' of ' + p.of + ' min'
    : g.kind === 'trade' ? 'Now ' + p.v + ' an hour. Happy customers bring more.'
    : g.kind === 'handsOff' ? p.v + ' of ' + p.of + ' min with no changes. Any change starts the clock again.'
    : '';
  return { id: 'goal:' + S.goal, sev: 'goal', k: (n > 1 ? 'Goal ' + (S.goal + 1) + ' of ' + n : 'Goal'), title: g.title, bar: g.kind === 'menu' ? null : Math.max(0, p.v) / p.of, body };
}
function goalTicket({ S, level, goalsMet }: TicketContext): Ticket | null {
  if (level) return levelGoalTicket(S, level);
  for (const [id, title, val, target] of FREE_PLAY_GOALS) {
    if (goalsMet.has(id)) continue;
    const v = val(S);
    return { sev: 'goal', k: 'Goal', title, bar: target > 1 ? Math.max(0, v) / target : null, body: target > 1 ? Math.max(0, v).toLocaleString('en-GB') + ' of ' + target.toLocaleString('en-GB') : '' };
  }
  return null;
}
function briefTicket({ S, level, dismissed }: TicketContext): Ticket | null {
  if (!level || dismissed.has('brief') || S.st.served > 0) return null;
  return { sev: 'info', k: 'Level ' + level.n, title: level.title, body: level.brief, btn: 'Got it', act: 'none', dismiss: 'brief' };
}
// the ways a level is lost, while they are counting down
function failTickets(S: GameState): Ticket[] {
  const F = S.R.fail, j = S.judge, out: Ticket[] = [];
  if (F.overdrawnMins > 0 && (S.cash < 0 || j.red > 0)) {
    const left = F.overdrawnMins - j.red;
    out.push(S.cash < 0
      ? { sev: 'crit', k: 'Bank', title: 'Overdrawn', bar: left / F.overdrawnMins, body: 'Back in the black within ' + left + ' min, or the bank closes the shop. It stops you at ' + money(-F.overdraft) + '.' }
      : { sev: 'warn', k: 'Bank', title: 'Back in the black', bar: left / F.overdrawnMins, body: 'The bank is watching for another ' + j.red + ' min.' });
  }
  if (F.satMins > 0 && S.st.served + S.st.abandoned >= F.after) {
    const left = F.satMins - j.poor, happy = Math.round(S.st.sat * 100);
    if (S.st.sat < F.sat) out.push({ sev: 'crit', k: 'Customers', title: 'Unhappy customers', bar: left / F.satMins, body: happy + '% happy. Under ' + Math.round(F.sat * 100) + '% for ' + left + ' more min and trade dries up.' });
    else if (j.poor > 0) out.push({ sev: 'warn', k: 'Customers', title: 'Recovering', bar: left / F.satMins, body: happy + '% happy. Keep it up for ' + j.poor + ' min to be safe.' });
    else if (S.st.sat < S.R.demand.growAt) out.push({ sev: 'warn', k: 'Customers', title: 'Trade is shrinking', body: happy + '% happy. Under ' + Math.round(S.R.demand.growAt * 100) + '%, fewer customers come back.' });
  }
  return out;
}
function problemTickets(S: GameState): Ticket[] {
  const out: Ticket[] = [], name = (it: GameState['items'][number]) => Sim.label(S, it), PROD = S.R.PROD;
  for (const it of S.items) {
    if (!it.built) continue;
    const hc = S.R.items[it.type].hopper || 0, kc = S.R.items[it.type].knock || 0;
    const prods = Sim.PKEYS.filter((p) => Sim.offered(S).includes(p) && (PROD[p].machine === it.type || (it.type === 'grinder' && PROD[p].grinds)));
    if (hc && it.beans <= 0 && prods.length) {
      const none = S.supply.door + S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0) <= 0;
      out.push(none ? { sev: 'crit', k: 'Now', title: 'Out of beans', body: 'No sacks left for ' + name(it) + '.' + (S.supply.onOrder ? ' More are on the way.' : ''), btn: S.supply.onOrder ? '' : 'Order 5 sacks', act: 'order', arg: 5 }
        : { sev: 'crit', k: 'Now', title: 'Hopper empty', body: name(it) + ' can’t make ' + PROD[prods[0]].name.toLowerCase() + ' until it’s refilled.', btn: 'Show me', act: 'show', arg: it.id });
    }
    if (kc && it.grounds >= kc) out.push({ sev: 'crit', k: 'Now', title: 'Bin full', body: name(it) + ' has stopped until someone empties it.', btn: 'Show me', act: 'show', arg: it.id });
  }
  const W = S.hist.walked, n = W.length, gone = n > 1 ? W[n - 1] - W[Math.max(0, n - 11)] : 0;
  if (gone > 0) { const till = S.items.find((i) => i.built && i.type === 'till'); out.push({ sev: 'crit', k: 'Last 10 min', title: 'Walking out', body: gone + ' customer' + (gone > 1 ? 's' : '') + ' gave up waiting.', btn: till ? 'Show me' : '', act: 'show', arg: till && till.id }); }
  if (S.st.served > 0 || S.t > 600) {
    const crates = unassigned(S);
    if (crates.length) out.push({ sev: 'warn', k: crates.length > 1 ? crates.length + ' crates' : 'Crate', title: 'Needs a builder', body: crates.map((c) => Sim.label(S, c)).join(', ') + (crates.length > 1 ? ' are' : ' is') + ' waiting.', btn: 'Assign', act: 'assignAll' });
  }
  const cups = sumCups(S);
  if (S.items.some((i) => i.built && S.R.items[i.type].hopper) && !S.supply.onOrder && cups <= S.R.supply.sackDoses && cups > 0)
    out.push({ sev: 'warn', k: 'Beans', title: 'Running low', body: 'About ' + cups + ' cups left and nothing on order.', btn: S.cash >= S.R.supply.sackCost * 5 ? 'Order 5 sacks' : 'Order 1 sack', act: 'order', arg: S.cash >= S.R.supply.sackCost * 5 ? 5 : 1 });
  const burn = (S.workers.length * S.R.wagePerMin + S.R.rentPerMin) * 60;
  if (S.cash < 0 && S.R.fail.overdrawnMins > 0) { /* the bank's ticket covers it */ }
  else if (S.cash < 0) out.push({ sev: 'crit', k: 'Money', title: 'In the red', body: 'Wages keep going out. Sell something or cut staff.' });
  else if ((S.open || S.st.arrived) && S.cash < burn) out.push({ sev: 'warn', k: 'Money', title: 'Cash is low', body: 'Less than an hour of wages and rent left.' });
  return out;
}
function milestoneTickets({ S, dismissed }: TicketContext): Ticket[] {
  const out: Ticket[] = [], CAT = S.R.CAT, PROD = S.R.PROD;
  for (const k of Sim.TKEYS) {
    const r = S.research[k], T = Sim.TOPICS[k];
    if (!r.complete || r.finished <= 0 || S.t - r.finished > 3600 || dismissed.has('res:' + k)) continue;
    const items = (T.unlocks || []).filter((t) => CAT[t]);
    if (T.sets) { out.push({ sev: 'good', k: 'Research done', title: T.name, body: T.blurb, dismiss: 'res:' + k }); continue; }
    const newProds = (T.unlocks || []).filter((p) => PROD[p]);
    if (!items.length && newProds.length) {
      const can = newProds.filter((p) => Sim.unlocked(S, p));
      out.push(can.length ? { sev: 'good', k: 'Research done', title: T.name, body: can.map((p) => PROD[p].name).join(' and ') + ' can go on the menu now.', btn: 'Open Menu', act: 'tray', arg: 'menu', dismiss: 'res:' + k }
        : { sev: 'good', k: 'Research done', title: T.name, body: newProds.map((p) => PROD[p].name).join(' and ') + ' needs ' + (PROD[newProds[0]].stations || []).filter((t) => !S.items.some((i) => i.built && i.type === t)).map((t) => CAT[t].name.toLowerCase()).join(' and ') + ' first.', dismiss: 'res:' + k });
      continue;
    }
    out.push(items.length
      ? { sev: 'good', k: 'Research done', title: T.name, body: 'You can build ' + items.map((t) => CAT[t].name.toLowerCase()).join(' and ') + ' now.', btn: 'Build it', act: 'tray', arg: trayOf(items[items.length - 1]), dismiss: 'res:' + k }
      : { sev: 'good', k: 'Research done', title: T.name, body: 'Set up a standing order in Beans.', btn: 'Open Beans', act: 'tray', arg: 'beans', dismiss: 'res:' + k });
  }
  return out;
}
function researchTicket({ S, level }: TicketContext): Ticket | null {
  if (tutorialStep(S, level)) return null;   // the tutorial's steps come first
  const open = researchable(S).filter((k) => !S.research[k].complete);
  if (!open.length || open.some((k) => S.research[k].weight > 0)) return null;
  return { sev: 'info', k: 'Research', title: 'Nothing queued', body: 'Pick a topic to work on. It runs in the background.', btn: 'Open research', act: 'research' };
}

const ORDER: Record<Severity, number> = { step: 0, crit: 1, warn: 2, good: 3, info: 4, goal: 5 };
// the tickets to show, most urgent first, and how many more did not fit
export function railTickets(ctx: TicketContext): { shown: Ticket[]; more: number } {
  const step = tutorialStep(ctx.S, ctx.level);
  const list: Ticket[] = ([] as (Ticket | null)[]).concat(step, briefTicket(ctx), failTickets(ctx.S), problemTickets(ctx.S), milestoneTickets(ctx), researchTicket(ctx), !step ? goalTicket(ctx) : null)
    .filter((t): t is Ticket => !!t);
  list.sort((a, b) => ORDER[a.sev] - ORDER[b.sev]);
  const shown = list.slice(0, 4);
  return { shown, more: list.length - shown.length };
}
export const ticketKey = (t: Ticket) => t.id || t.k + '|' + t.title;
