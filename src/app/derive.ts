// Read-only views of the game state that more than one part of the screen needs.
import { Sim, type GameState, type Item } from './engine';

export const holdsSacks = (S: GameState, it: Item) => (S.R.items[it.type].sacks || 0) > 0;
export const beansInShop = (S: GameState) => S.items.reduce((n, i) => n + (i.built ? i.beans : 0), 0);
export const sacksStored = (S: GameState) => S.items.reduce((n, i) => n + (i.built ? i.sacks : 0), 0);
export const sumCups = (S: GameState) => beansInShop(S) + (S.supply.door + sacksStored(S)) * S.R.supply.sackDoses;
// crates nobody has been asked to build
export const unassigned = (S: GameState) => S.items.filter((i) => !i.built && !S.workers.some((w) => !w.leaving && w.builds.includes(i.id)));
// topics this shop can research at all
export const researchable = (S: GameState) => Sim.TKEYS.filter((k) => Sim.topicOpen(S, k));
export const centreOf = (it: Item) => { const [w, d] = Sim.dimsOf(it.type, it.r); return { x: it.x + w / 2, z: it.z + d / 2 }; };

export function passStages(S: GameState) {
  const c = { queue: 0, rail: 0, making: 0, ready: 0 };
  for (const it of S.items) if (it.type === 'till') c.queue += it.queue.length;
  for (const k of S.cups) { if (k.waste) continue; if (k.state === 'queued') c.rail++; else if (k.state === 'ready') c.ready++; else c.making++; }
  return c;
}

// money per game hour, from the last hour of history (or what wages cost before there is any)
export function cashPerHour(S: GameState) {
  const H = S.hist.cash, n = H.length;
  if (n < 10) return -(S.workers.length * S.R.wagePerMin + S.R.rentPerMin) * 60;
  const k = Math.min(60, n - 1);
  return Math.round((H[n - 1] - H[n - 1 - k]) * 60 / k);
}

// research: one shared capacity, split across topics; every extra topic in progress costs capacity
export function researchRates(S: GameState) {
  const R = S.R.research, act = Sim.TKEYS.filter((k) => !S.research[k].complete && S.research[k].weight > 0);
  const total = act.length ? R.rate * 100 / (100 + R.switchPct * (act.length - 1)) : 0;
  const W = act.reduce((n, k) => n + S.research[k].weight, 0);
  const per: Record<string, number> = {}; act.forEach((k) => { per[k] = total * S.research[k].weight / W; });
  return { act, total, per };
}

export function patchText(S: GameState, workerId: number) {
  const w = S.wmap[workerId];
  if (w.all) return w.name + ' covers every station';
  if (!w.patch.length) return w.name + ' has no stations and will stand idle';
  return w.name + ' now works at ' + w.patch.map((id) => Sim.label(S, S.imap[id])).join(', ');
}
