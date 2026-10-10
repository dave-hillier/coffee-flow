import { Fragment, type FocusEvent, type PointerEvent } from 'react';
import { Sim } from '../engine';
import { beansInShop, holdsSacks, researchRates, sacksStored } from '../derive';
import { money, price, secsText } from '../format';
import type { Game } from '../game';
import { isTouch } from '../touch';
import { BUILD_TRAYS } from '../ui';
import { useGame, useUi } from '../useGame';

const SHORT: Record<string, string> = { till: 'Till', pickup: 'Pickup', brewer: 'Brewer', grinder: 'Grinder', espresso: 'Espresso', pastry: 'Cake case', stock: 'Stock area', store: 'Cupboard', milk: 'Milk', syrup: 'Syrups' };
const TITLES: Record<string, string> = { menu: 'Menu', beans: 'Beans', staff: 'Staff' };
const NOTES: Record<string, string> = { menu: 'Click a drink to take it off or put it back', staff: 'Pick someone to see what they do', beans: 'Workers carry sacks in from the back door to the hoppers' };
const TOUCH_NOTES: Record<string, string> = { menu: 'Tap a drink to take it off or put it back' };

// Picking a tool opens its tray above the icon row. A build tray shows what can be bought; picking an item turns the
// cursor into a ghost; after placing, the tray comes back.
export function Tray() {
  const { ui } = useUi();
  const game = useGame();
  const tray = ui.tray!, build = BUILD_TRAYS[tray], touch = isTouch();
  return (
    <section className="tray" id="tray" aria-labelledby="trayTitle">
      <header><h2 id="trayTitle">{build ? build[0] : TITLES[tray]}</h2><span>{build ? money(game.S.cash) + ' to spend · ' + (touch ? 'tap ' + build[0] + ' again to close' : 'Esc to close') : (touch && TOUCH_NOTES[tray]) || NOTES[tray]}</span></header>
      {build && <BuildTiles game={game} types={build[1]} />}
      {tray === 'menu' && <MenuChips game={game} />}
      {tray === 'beans' && <Supplies game={game} />}
      {tray === 'staff' && <Staff game={game} />}
    </section>
  );
}

function makesText(game: Game, t: string) {
  const S = game.S, PROD = S.R.PROD;
  // products this helps make, leaving out ones still waiting on research of their own
  const ps = Sim.PKEYS.filter((p) => (PROD[p].machine === t || (t === 'grinder' && PROD[p].grinds) || (PROD[p].stations || []).includes(t)) &&
    (!Sim.needsResearch(S, p) || Sim.needsResearch(S, p) === Sim.needsResearch(S, t)));
  if (t === 'till') return 'Where customers order and pay';
  if (t === 'pickup') return 'Where finished drinks wait';
  if (t === 'stock' || t === 'store') return 'Holds ' + S.R.items[t].sacks + ' sacks of beans close to the machines';
  return ps.length ? (t === 'grinder' || S.R.CAT[t].w === 1 && t !== 'brewer' ? 'Needed for ' : 'Unlocks ') + ps.map((p) => PROD[p].name.toLowerCase()).join(', ') : '';
}

function BuildTiles({ game, types: all }: { game: Game; types: string[] }) {
  const { ui, dispatch } = useUi();
  const S = game.S, CAT = S.R.CAT;
  const types = all.filter((t) => { const l = Sim.needsResearch(S, t); return Sim.allowed(S, t) && (!l || S.research[l].weight > 0 || S.research[l].done > 0); });
  const focus = ui.tileFocus && types.includes(ui.tileFocus) ? ui.tileFocus : types[0];
  const over = (e: PointerEvent | FocusEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]');
    if (t && t.dataset.tile !== ui.tileFocus) dispatch({ type: 'TileFocused', item: t.dataset.tile! });
  };
  return (
    <div className="tray-build">
      <div className="tiles" onPointerOver={over} onFocus={over}>
        {types.map((t) => {
          const c = CAT[t], short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
          if (locked) {
            const r = S.research[locked], rr = researchRates(S), eta = rr.per[locked] ? Math.ceil((S.R.research.topics[locked].work - r.done) / rr.per[locked]) : null;
            return (
              <button key={t} type="button" className="tile soon" data-tile={t} disabled aria-label={c.name + ', coming when ' + Sim.TOPICS[locked].name + ' is researched'}>
                <img alt="" src={game.icons[t]} /><b>{SHORT[t]}</b><span className="price">{eta != null ? 'In ' + eta + ' min' : 'Paused'}</span>
              </button>
            );
          }
          return (
            <button key={t} type="button" className={'tile' + (short > 0 ? ' short' : '')} data-tile={t} disabled={short > 0} aria-label={c.name + ', ' + price(c)}
              onClick={() => game.startPlacing(t)}>
              {game.freshItems.has(t) && <em className="badge">new</em>}
              <img alt="" src={game.icons[t]} /><b>{SHORT[t]}</b><span className="price">{price(c)}</span>
            </button>
          );
        })}
      </div>
      <div className="tile-detail" aria-live="polite">{focus && <TileDetail game={game} t={focus} />}</div>
    </div>
  );
}

function TileDetail({ game, t }: { game: Game; t: string }) {
  const S = game.S, c = S.R.CAT[t], have = S.items.filter((i) => i.type === t).length, short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
  return (
    <>
      <h3>{c.name}</h3><p>{makesText(game, t)}. {c.blurb}</p>
      <dl>
        <dt>Price</dt><dd>{price(c)}</dd><dt>Build time</dt><dd>{c.mins ? c.mins + ' min' : 'ready at once'}</dd><dt>Size</dt><dd>{c.w}×{c.d}</dd><dt>You have</dt><dd>{have}</dd>
      </dl>
      {locked ? <p className="why">Comes with {Sim.TOPICS[locked].name} research.</p> : short > 0 ? <p className="why">Need {money(short)} more.</p> : <p className="key">{isTouch() ? 'Tap it, then tap the floor where it goes' : 'Click to place · R rotates · Shift-click for several'}</p>}
    </>
  );
}

function MenuChips({ game }: { game: Game }) {
  const S = game.S, PROD = S.R.PROD, CAT = S.R.CAT;
  return (
    <div className="chips">
      {Sim.PKEYS.filter((p) => Sim.unlocked(S, p)).map((p) => {
        const P = PROD[p], on = !S.menuOff[p];
        const steps = Sim.recipe(S, p), secs = steps.reduce((n, r) => n + r.secs, 0);
        return (
          <button key={p} type="button" className="menu-chip" aria-pressed={on} title={on ? 'On the menu. Click to stop offering it.' : 'Off the menu. Click to offer it.'} onClick={() => game.act('menu', p)}>
            <img className="cup" alt="" src={game.icons['cup:' + p]} /><b>{P.name}</b><span>{money(P.price)}{on ? ' · offered' : ' · off'}</span>
            <span className="stops" aria-label={'Made at ' + steps.map((r) => CAT[r.type].name.toLowerCase()).join(', then ') + ', ' + secsText(secs) + ' in all'}>
              {steps.map((r, i) => <Fragment key={i}>{i > 0 && <i aria-hidden="true">›</i>}<img alt="" src={game.icons[r.type]} /></Fragment>)}
              <em>{secsText(secs)}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Supplies({ game }: { game: Game }) {
  const S = game.S, sp = S.supply, sack = S.R.supply.sackDoses, cost = S.R.supply.sackCost, shop = beansInShop(S);
  const next = sp.orders[0], due = next ? Math.max(0, Math.ceil((next.due - S.t) / 60)) : 0;
  const stored = sacksStored(S), hasStore = S.items.some((i) => i.built && holdsSacks(S, i));
  const total = shop + (sp.door + stored) * sack, on = sp.auto.qty > 0;
  const standing = !Sim.topicOpen(S, 'standing') && Sim.needsResearch(S, 'auto') ? null
    : Sim.needsResearch(S, 'auto') ? <button type="button" disabled title="Research Standing orders first">Standing order · needs research</button>
    : <button type="button" aria-pressed={on} title="Order automatically when beans in the shop, at the back door and on order fall below a level" onClick={() => game.toggleAuto()}>Standing order</button>;
  return (
    <div className="supplies">
      <p className={'sup-line' + (total <= sack ? ' low' : '')}>
        <b>{total}</b> cups of beans · {sp.door} sack{sp.door === 1 ? '' : 's'} at the back door · {hasStore ? stored + ' in stock · ' : ''}{shop} in hoppers
        {sp.onOrder > 0 && <> · <span className="due">{sp.onOrder} due in {due} min</span></>}
      </p>
      <div className="row">
        <button type="button" disabled={S.cash < cost} onClick={() => game.act('order', 1)}>Order 1 sack · {money(cost)}</button>
        <button type="button" disabled={S.cash < cost * 5} onClick={() => game.act('order', 5)}>Order 5 · {money(cost * 5)}</button>
        {standing}
        {on && <>
          <span className="stepper" aria-label="Sacks per order"><button type="button" aria-label="Fewer sacks" onClick={() => game.stepAuto('qty', -1)}>−</button><b>{sp.auto.qty}</b> sacks<button type="button" aria-label="More sacks" onClick={() => game.stepAuto('qty', 1)}>+</button></span>
          <span className="stepper" aria-label="Reorder level">below<button type="button" aria-label="Lower level" onClick={() => game.stepAuto('point', -10)}>−</button><b>{sp.auto.point}</b><button type="button" aria-label="Higher level" onClick={() => game.stepAuto('point', 10)}>+</button>cups</span>
        </>}
      </div>
    </div>
  );
}

function Staff({ game }: { game: Game }) {
  const S = game.S;
  return (
    <div className="staff">
      <ul>
        {S.workers.map((w) => (
          <li key={w.id}><button type="button" onClick={() => game.showWorker(w.id)}><b>{w.name}</b><span>{w.leaving ? 'leaving' : money(S.R.wagePerMin * 60) + ' an hour'}</span></button></li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="card" disabled={S.cash < S.R.hireCost || S.workers.length >= S.R.maxWorkers} onClick={() => game.hire()}>
          <b>Hire a worker</b><span>{money(S.R.hireCost)} to hire, then {money(S.R.wagePerMin * 60)} an hour · {S.workers.length} of {S.R.maxWorkers}</span>
        </button>
      </div>
    </div>
  );
}
