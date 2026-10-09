import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Sim, type Cell } from '../engine';
import { money, price } from '../format';
import type { Game } from '../game';
import { BUILD_TRAYS, inBuildMode } from '../ui';
import { useGame, useUi } from '../useGame';

// right-click: a menu for whatever is under the cursor
export function ContextMenu() {
  const { ui } = useUi();
  const game = useGame();
  const ctx = ui.ctx!;
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // keep it inside the stage
  useLayoutEffect(() => {
    const el = ref.current!, stage = el.parentElement!;
    const x = Math.min(ctx.x, stage.clientWidth - el.offsetWidth - 8), y = Math.min(ctx.y, stage.clientHeight - el.offsetHeight - 8);
    setAt({ left: Math.max(8, x), top: Math.max(8, y) });
  }, [ctx.x, ctx.y]);
  // the first choice takes focus when it opens, or when it changes into the confirm step
  const armed = ctx.kind === 'item' && ctx.armed;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [ctx.x, ctx.y, armed]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) game.closeCtx(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [game]);
  const arrows = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], i = bs.indexOf(document.activeElement as HTMLButtonElement);
    const n = bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; if (n) n.focus();
  };
  return (
    <div className="ctx" role="menu" ref={ref} style={at || { left: ctx.x, top: ctx.y }} onKeyDown={arrows}>
      {ctx.kind === 'item' ? <ItemMenu game={game} id={ctx.id} armed={ctx.armed} /> : <FloorMenu game={game} cell={ctx.cell} />}
    </div>
  );
}

function ItemMenu({ game, id, armed }: { game: Game; id: number; armed: boolean }) {
  const S = game.S, it = S.imap[id];
  if (!it) return null;
  const c = S.R.CAT[it.type], why = Sim.whyNotRemove(S, it), refund = it.built ? c.cost / 2 : c.cost;
  const ws = S.workers.filter((w) => !w.leaving);
  return (
    <>
      <h4>{Sim.label(S, it)}{it.built ? '' : ' · crate ' + Math.floor(100 * it.work / it.total) + '%'}</h4>
      {!it.built
        ? ws.map((w) => (
          <button key={w.id} type="button" role="menuitemcheckbox" aria-checked={w.builds.includes(it.id)} onClick={() => game.ctxBuild(w.id, it.id)}>
            Build with {w.name}<span>{w.builds.includes(it.id) ? 'assigned' : w.builds.length ? w.builds.length + ' queued' : 'free'}</span>
          </button>
        ))
        : ws.map((w) => {
          const on = w.all || w.patch.includes(it.id);
          return (
            <button key={w.id} type="button" role="menuitemcheckbox" aria-checked={!w.all && on} onClick={() => game.ctxPatch(w.id, it.id)}>
              {w.all ? 'Only ' : 'Staff with '}{w.name}<span>{w.all ? 'covers all' : on ? 'works here' : ''}</span>
            </button>
          );
        })}
      <hr />
      <button type="button" role="menuitem" onClick={() => game.ctxDetails(it.id)}>Details<span></span></button>
      <button type="button" role="menuitem" className="danger" disabled={!!why} title={why || undefined} data-armed={armed ? '' : undefined} onClick={() => game.ctxRemove(it.id)}>
        {armed ? 'Click again to confirm' : !c.cost ? 'Clear' : it.built ? 'Sell' : 'Cancel order'}
        <span>{why ? why : refund ? '+' + money(refund) : ''}</span>
      </button>
    </>
  );
}

function FloorMenu({ game, cell }: { game: Game; cell: Cell }) {
  const { ui } = useUi();
  const S = game.S;
  const types = Object.values(BUILD_TRAYS).flatMap(([, ts]) => ts.filter((t) => Sim.allowed(S, t)));
  return (
    <>
      <h4>Build here</h4>
      {types.map((t) => {
        const c = S.R.CAT[t], f = game.fitAt(t, cell), short = c.cost - S.cash, locked = Sim.needsResearch(S, t);
        const why = locked ? 'needs research' : short > 0 ? 'need ' + money(short) : f.reason ? (f.reason === 'That space is taken' ? 'no room' : f.reason.toLowerCase()) : null;
        return (
          <button key={t} type="button" role="menuitem" disabled={!!why} title={why || undefined} onClick={() => game.ctxPlace(t, f.r)}>
            {c.name}<span>{why ? why : price(c)}</span>
          </button>
        );
      })}
      <hr />
      <button type="button" role="menuitem" onClick={() => game.ctxToggleBuild()}>{inBuildMode(ui) ? 'Leave build mode' : 'Open build menu'}<span>B</span></button>
    </>
  );
}
