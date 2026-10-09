import { Sim, type GameState, type Item } from '../engine';
import { centreOf } from '../derive';
import { inBuildMode } from '../ui';
import { useGameFrame, useUi } from '../useGame';

const at = (p: { left: number; top: number }) => ({ left: p.left.toFixed(1) + 'px', top: p.top.toFixed(1) + 'px' });

// name tags, crate progress and machine gauges, pinned to things in the shop; and the hover tip under the pointer
export function Labels() {
  const { ui } = useUi();
  const game = useGameFrame();
  const scene = game.scene, S = game.S;
  const tip = game.tip;
  if (!scene) return <div className="labels"></div>;
  const sel = ui.sel, hover = game.hover, buildMode = inBuildMode(ui);
  const sw = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
  return (
    <>
      <div className="labels">
        {S.workers.map((w) => {
          const p = scene.workerAt(w.id); if (!p) return null;
          return <div key={'w' + w.id} className={'tag who' + (sel && sel.kind === 'worker' && sel.id === w.id ? ' sel' : '')} style={at(scene.project(p.x, 1.72, p.z))}>{w.name}</div>;
        })}
        {S.items.filter((it) => !it.built).map((it) => <CrateTag key={'c' + it.id} S={S} it={it} order={sw ? sw.builds.indexOf(it.id) : -1} pos={at(scene.project(centreOf(it).x, 1.25, centreOf(it).z))} />)}
        {S.items.filter((it) => it.built).map((it) => {
          const r = S.R.items[it.type];
          // stock tiles are laid in groups and show their sacks on the pallet, so they go without a gauge
          if (!(r.hopper || r.knock || (r.sacks && it.type !== 'stock'))) return null;
          const look = buildMode || (sel && sel.kind === 'item' && sel.id === it.id) || (hover && hover.kind === 'item' && hover.id === it.id);
          const c = centreOf(it);
          return <Gauge key={'g' + it.id} S={S} it={it} look={!!look} pos={at(scene.project(c.x, 2.05, c.z))} />;
        })}
      </div>
      {tip && <div className={'tip' + (tip.bad ? ' bad' : '')} style={{ left: tip.x + 'px', top: tip.y + 'px' }}>{tip.text}</div>}
    </>
  );
}

function CrateTag({ S, it, order, pos }: { S: GameState; it: Item; order: number; pos: { left: string; top: string } }) {
  const pct = Math.floor(100 * it.work / it.total);
  const crew = S.workers.filter((w) => w.task && w.task.kind === 'build' && w.builds[0] === it.id && w.anim === 'build').length;
  const queued = S.workers.filter((w) => w.builds.includes(it.id)).length;
  return (
    <div className={'tag crate' + (order >= 0 ? ' mine' : '')} style={pos}>
      <b>{(order >= 0 ? '#' + (order + 1) + ' ' : '') + Sim.label(S, it)}</b>
      <i><s style={{ width: pct + '%' }}></s></i>
      <small>{crew ? crew + ' building' : queued ? 'builder on the way' : 'needs a builder'}</small>
    </div>
  );
}

// beans, grounds and sacks on a machine: shown when they need attention, in build mode, or when looked at
function Gauge({ S, it, look, pos }: { S: GameState; it: Item; look: boolean; pos: { left: string; top: string } }) {
  const r = S.R.items[it.type], hc = r.hopper || 0, kc = r.knock || 0, sc = r.sacks || 0;
  const urgent = (hc && it.beans <= 0) || (kc && it.grounds >= kc);
  const shown = urgent || (hc && it.beans <= hc / 4) || (kc && it.grounds >= kc * 0.6) || look;
  if (!shown) return null;
  return (
    <div className={'tag gauge' + (urgent ? ' alert' : '')} style={pos}>
      {sc > 0 && <>
        <span className={'g' + (it.sacks <= 0 ? ' low' : '')} title="Sacks on the shelves"><b>S</b><i><s style={{ width: Math.round(100 * it.sacks / sc) + '%' }}></s></i></span>
        <em className="n">{it.sacks}/{sc} sacks</em>
      </>}
      {hc > 0 && <span className={'g' + (it.beans <= 0 ? ' warn' : it.beans <= hc / 4 ? ' low' : '')} title="Beans in the hopper"><b>B</b><i><s style={{ width: Math.round(100 * it.beans / hc) + '%' }}></s></i></span>}
      {kc > 0 && <span className={'g grounds' + (it.grounds >= kc ? ' warn' : '')} title="Grounds in the knock box"><b>G</b><i><s style={{ width: Math.round(100 * it.grounds / kc) + '%' }}></s></i></span>}
      {hc > 0 && it.beans <= 0 ? <em>out of beans</em> : kc > 0 && it.grounds >= kc ? <em>bin full</em> : null}
    </div>
  );
}
