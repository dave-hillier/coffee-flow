import { type ReactNode } from 'react';
import { Sim, type Item, type Worker } from '../engine';
import { money } from '../format';
import type { Game } from '../game';
import { isTouch } from '../touch';
import { isArmed } from '../ui';
import { useGame, useUi } from '../useGame';

const Meter = ({ u }: { u: number }) => <><span className={'meter' + (u > 0.85 ? ' hot' : '')}><s style={{ width: Math.round(u * 100) + '%' }}></s></span>{Math.round(u * 100)}%</>;
const MeterOf = ({ n, cap, hot }: { n: number; cap: number; hot: boolean }) => <span className={'meter' + (hot ? ' hot' : '')}><s style={{ width: Math.round(100 * n / Math.max(1, cap)) + '%' }}></s></span>;
const Slots = ({ n, cap }: { n: number; cap: number }) => (
  <><span className={'slots' + (n >= cap ? ' full' : '')}>{Array.from({ length: cap }, (_, i) => <i key={i} className={i < n ? 'on' : ''}></i>)}</span> {n}/{cap}</>
);

// what is selected: a worker or a piece of equipment
export function Panel() {
  const { ui } = useUi();
  const game = useGame();
  const S = game.S, sel = ui.sel;
  let body: ReactNode = null;
  if (sel && sel.kind === 'worker' && S.wmap[sel.id]) body = <WorkerPanel game={game} w={S.wmap[sel.id]} />;
  else if (sel && sel.kind === 'item' && S.imap[sel.id]) body = <ItemPanel game={game} it={S.imap[sel.id]} />;
  if (!body) return null;
  return <aside className="panel">{body}</aside>;
}

function WorkerPanel({ game, w }: { game: Game; w: Worker }) {
  const { ui } = useUi();
  const S = game.S;
  const built = S.items.filter((i) => i.built), crates = S.items.filter((i) => !i.built);
  const builds = w.builds.map((id) => S.imap[id]).filter(Boolean);
  const armed = isArmed(ui, 'fire', w.id);
  return (
    <>
      <h2>{w.name}<small>worker · {money(S.R.wagePerMin * 60)}/h</small></h2>
      <p className="status">{w.leaving ? 'Finishing up, then leaving' : w.status}</p>
      <dl className="kv"><dt>Busy (last half hour)</dt><dd><Meter u={w.util} /></dd></dl>
      <div className="sec">
        <h3>Works at</h3>
        {built.length ? <>
          <div className="chips">
            <button type="button" aria-pressed={w.all} onClick={() => game.panelAct('all', w.id, 0)}>All stations</button>
            {built.map((i) => <button key={i.id} type="button" aria-pressed={!w.all && w.patch.includes(i.id)} onClick={() => game.panelAct('patch', w.id, i.id)}>{Sim.label(S, i)}</button>)}
          </div>
          <p className="help">Or {isTouch() ? 'tap' : 'click'} stations in the shop. {w.name} finishes drinks before taking new orders.</p>
        </> : <p className="help">Nothing built yet.</p>}
      </div>
      <div className="sec">
        <h3>Build list</h3>
        {builds.length ? <>
          <ol className="builds">
            {builds.map((i) => <li key={i.id}>{Sim.label(S, i)} · {Math.floor(100 * i.work / i.total)}%<button type="button" aria-label="Remove from build list" onClick={() => game.panelAct('build', w.id, i.id)}>×</button></li>)}
          </ol>
          <p className="help">Building comes first. {w.name} goes back to their stations when the list is done.</p>
        </> : crates.length ? (
          <div className="chips">{crates.map((i) => <button key={i.id} type="button" onClick={() => game.panelAct('build', w.id, i.id)}>Build {Sim.label(S, i)}</button>)}</div>
        ) : <p className="help">No crates waiting.</p>}
      </div>
      {S.workers.length > 1 && !w.leaving && (
        <div className="row">
          <button type="button" className="danger" data-armed={armed ? '' : undefined} onClick={() => game.panelAct('fire', w.id, 0)}>{armed ? (isTouch() ? 'Tap' : 'Click') + ' again to let ' + w.name + ' go' : 'Let ' + w.name + ' go'}</button>
        </div>
      )}
    </>
  );
}

function ItemPanel({ game, it }: { game: Game; it: Item }) {
  const { ui } = useUi();
  const S = game.S, c = S.R.CAT[it.type], name = Sim.label(S, it), PROD = S.R.PROD;
  const crew = S.workers.filter((w) => it.built ? (w.all || w.patch.includes(it.id)) : w.builds.includes(it.id));
  const why = Sim.whyNotRemove(S, it), refund = it.built ? c.cost / 2 : c.cost, armed = isArmed(ui, 'remove', it.id);
  const removeBtn = (
    <div className="row">
      <button type="button" className="danger" disabled={!!why} title={why || undefined} data-armed={armed ? '' : undefined} onClick={() => game.panelAct('remove', 0, it.id)}>
        {armed ? (isTouch() ? 'Tap' : 'Click') + ' again to confirm' : !c.cost ? 'Clear ' + name.toLowerCase() : (it.built ? 'Sell for ' : 'Cancel order, refund ') + money(refund)}
      </button>
      {why && <span className="help">{why}</span>}
    </div>
  );
  if (!it.built) {
    const pct = Math.floor(100 * it.work / it.total), left = Math.ceil((it.total - it.work) / 60);
    return (
      <>
        <h2>{name}<small>crate</small></h2><p>{c.blurb}</p>
        <div className="progress"><s style={{ width: pct + '%' }}></s></div>
        <dl className="kv"><dt>Built</dt><dd>{pct}%</dd><dt>Work left</dt><dd>{left} worker-min</dd><dt>Builders</dt><dd>{crew.length ? crew.map((w) => w.name).join(', ') : 'nobody yet'}</dd></dl>
        <div className="sec">
          <h3>Assign a builder</h3>
          <div className="chips">{S.workers.filter((w) => !w.leaving).map((w) => <button key={w.id} type="button" aria-pressed={w.builds.includes(it.id)} onClick={() => game.panelAct('build', w.id, it.id)}>{w.name}</button>)}</div>
          <p className="help">Two builders halve the time, but they stop serving while they build.</p>
        </div>
        {removeBtn}
      </>
    );
  }
  const r = S.R.items[it.type], hc = r.hopper || 0, kc = r.knock || 0, sc = r.sacks || 0;
  const makes = Sim.PKEYS.filter((p) => (PROD[p].machine === it.type || (PROD[p].stations || []).includes(it.type)) && !Sim.needsResearch(S, p));
  const chore = it.chore != null ? S.wmap[it.chore] : null;
  return (
    <>
      <h2>{name}<small>{c.w}×{c.d}</small></h2><p>{c.blurb}</p>
      <dl className="kv">
        <dt>Busy (last half hour)</dt><dd><Meter u={it.util} /></dd>
        {it.type === 'till' && <><dt>Queue</dt><dd>{it.queue.length} waiting</dd><dt>Order rail</dt><dd><Slots n={it.buf.length} cap={it.cap} /></dd></>}
        {it.type === 'pickup' && <><dt>Ready drinks</dt><dd><Slots n={it.buf.length} cap={it.cap} /></dd></>}
        {sc > 0 && <><dt>Sacks on the shelves</dt><dd><MeterOf n={it.sacks} cap={sc} hot={false} />{it.sacks}/{sc}</dd><dt>At the back door</dt><dd>{S.supply.door} sack{S.supply.door === 1 ? '' : 's'}</dd></>}
        {hc > 0 && <><dt>Beans in hopper</dt><dd><MeterOf n={it.beans} cap={hc} hot={it.beans <= hc / 4} />{it.beans}/{hc} cups</dd></>}
        {kc > 0 && <><dt>Grounds bin</dt><dd><MeterOf n={it.grounds} cap={kc} hot={it.grounds >= kc * 0.8} />{it.grounds}/{kc}</dd></>}
        {chore && <><dt>Chore</dt><dd>{chore.name} is on it</dd></>}
        {makes.length > 0 && <><dt>Makes</dt><dd>{makes.map((p) => PROD[p].name).join(', ')}</dd></>}
        <dt>Staffed by</dt><dd>{crew.length ? crew.map((w) => w.name).join(', ') : 'nobody'}</dd>
      </dl>
      {!crew.length && <p className="help">Select a worker, then {isTouch() ? 'tap' : 'click'} this station to staff it.</p>}
      {removeBtn}
    </>
  );
}
