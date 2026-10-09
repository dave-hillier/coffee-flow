import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Sim, type GameState } from '../engine';
import { researchRates, researchable } from '../derive';
import { fmtClock, secsText } from '../format';
import type { Game } from '../game';
import { STATE_TEXT, TREE, topicEffects, treeLayout, tstate } from '../research';
import { useGame, useUi } from '../useGame';

const STOP: Record<string, string> = { grinder: 'Grind', brewer: 'Brew', espresso: 'Pull the shot', pastry: 'Plate it', milk: 'Steam milk', syrup: 'Add syrup' };
const minsLeft = (S: GameState, k: string, per: Record<string, number>) => {
  const r = S.research[k], work = S.R.research.topics[k].work;
  return Math.ceil((work - r.done) / (per[k] || S.R.research.rate));
};

// Research: one shared capacity, split across topics; every extra topic in progress costs capacity
export function Research() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  const S = game.S, rs = S.research, R = S.R.research, rr = researchRates(S), n = rr.act.length;
  const open = researchable(S);
  const valid = (k: string | null) => !!k && open.includes(k) && !(ui.hideDone && rs[k].complete);
  const sel = valid(ui.resSel) ? ui.resSel! : rr.act[0] || open.find((k) => tstate(S, k) === 'ready' || tstate(S, k) === 'paused') || open.find((k) => !rs[k].complete) || open[0];
  const L = treeLayout(S, ui.hideDone), doneN = open.filter((k) => rs[k].complete).length;
  const icon = (k: string) => game.icons[TREE[k][2]] || game.icons.research;
  return (
    <section className="flow research" id="research" aria-label="Research">
      <header>
        <h2>Research</h2>
        <p className="res-cap">{R.rate} points a minute{n > 1 ? ', split ' + n + ' ways' : ''}. One topic at a time finishes soonest, and nothing pays off until a topic is done.</p>
        <button type="button" aria-pressed={ui.hideDone} onClick={() => dispatch({ type: 'FinishedTopicsToggled' })}>Hide finished ({doneN})</button>
        <button type="button" aria-label="Close research" onClick={() => game.setOverlay('research', false)}>Close</button>
      </header>
      <div className="res-body">
        <div className="tree-wrap">
          <Tree game={game} layout={L} sel={sel} icon={icon} />
          {!L.shown.length && <p className="tree-empty">Everything is researched. Show finished topics to look back over the tree.</p>}
        </div>
        {sel && <aside className="topic" aria-labelledby="tpName"><TopicPane game={game} k={sel} icon={icon(sel)} per={rr.per} active={n} /></aside>}
      </div>
    </section>
  );
}

function Tree({ game, layout: L, sel, icon }: { game: Game; layout: ReturnType<typeof treeLayout>; sel: string; icon: (k: string) => string }) {
  const { dispatch } = useUi();
  const S = game.S, rs = S.research, R = S.R.research;
  const treeRef = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<{ w: number; h: number; paths: { key: string; cls: string; d: string }[] }>({ w: 0, h: 0, paths: [] });
  const [width, setWidth] = useState(innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // connectors: an elbow from each prerequisite's tile to the topic's tile, measured once the tiles are laid out
  const route = new Set(sel && tstate(S, sel) === 'locked' ? Sim.routeTo(S, sel) : []), plan = new Set(S.resPlan);
  const linkKey = [L.shown.join(), L.template, sel, S.resPlan.join(), L.shown.map((k) => rs[k].complete).join(), width].join('|');
  useLayoutEffect(() => {
    const tree = treeRef.current; if (!tree) return;
    const box = tree.getBoundingClientRect();
    const tile = (k: string) => tree.querySelector(`.node[data-k="${k}"] .tile`)?.getBoundingClientRect();
    const paths: { key: string; cls: string; d: string }[] = [];
    L.shown.forEach((k) => {
      const b = tile(k); if (!b) return;
      Sim.prereqs(k).forEach((p) => {
        const a = tile(p); if (!a) return;
        const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top, mx = x2 - 14;
        const cls = rs[p].complete ? 'met' : (route.has(k) && route.has(p)) || (plan.has(k) && plan.has(p)) ? 'route' : '';
        paths.push({ key: p + '>' + k, cls, d: 'M' + x1 + ' ' + y1 + ' H' + mx + ' V' + y2 + ' H' + x2 });
      });
    });
    setLinks({ w: box.width, h: box.height, paths });
  }, [linkKey]);
  // arrow keys move between topics on the grid
  const arrows = (e: KeyboardEvent) => {
    const cur = (e.target as HTMLElement).closest('.node'); if (!cur) return;
    const dir = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, number[]>)[e.key]; if (!dir) return;
    e.preventDefault(); e.stopPropagation();
    const at = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [cx, cy] = at(cur);
    let best: HTMLElement | null = null, bestD = Infinity;
    treeRef.current!.querySelectorAll<HTMLElement>('.node').forEach((el) => {
      if (el === cur) return;
      const [x, y] = at(el), dx = x - cx, dy = y - cy, along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] + dy * dir[0]);
      if (along <= 4) return;
      const dd = along + across * 3; if (dd < bestD) { bestD = dd; best = el; }
    });
    if (best) (best as HTMLElement).focus();
  };
  const rowsN = Math.max(1, L.rows.reduce((m, r) => m + r.span, 0));
  return (
    <div className="tree" role="group" aria-label="Research tree" ref={treeRef} onKeyDown={arrows}
      style={{ gridTemplateColumns: L.template, gridTemplateRows: 'repeat(' + rowsN + ', auto)' }}>
      <svg className="links" aria-hidden="true" viewBox={'0 0 ' + links.w + ' ' + links.h} width={links.w} height={links.h}>
        {links.paths.map((p) => <path key={p.key} className={p.cls || undefined} d={p.d} />)}
      </svg>
      {L.rows.map((r) => <h3 key={r.lane} className="lane" style={{ gridRow: r.row + ' / span ' + r.span }}><span>{r.label}</span></h3>)}
      {L.shown.map((k) => {
        const c = L.cell[k], st = tstate(S, k), step = S.resPlan.indexOf(k);
        const p = st === 'done' ? 100 : Math.floor(100 * rs[k].done / R.topics[k].work);
        return (
          <button key={k} type="button" className={'node ' + st + (k === sel ? ' sel' : '')} data-k={k} style={{ gridRow: c.row, gridColumn: c.col + 1 }}
            aria-pressed={k === sel} aria-label={Sim.TOPICS[k].name + ', ' + STATE_TEXT[st] + (step >= 0 ? ', step ' + (step + 1) + ' of the plan' : '')}
            onClick={() => dispatch({ type: 'TopicSelected', topic: k })}>
            <span className="tile" style={{ '--p': p + '%' } as CSSProperties}><img alt="" src={icon(k)} />{step >= 0 && <i className="step">{step + 1}</i>}</span>
            <span className="nm">{Sim.TOPICS[k].name}</span>
          </button>
        );
      })}
    </div>
  );
}

// a recipe as an ordered list of stops, each with its station's icon and the time there
function Recipe({ game, p }: { game: Game; p: string }) {
  const S = game.S;
  return (
    <ol className="recipe" aria-label={'Recipe for ' + S.R.PROD[p].name}>
      {Sim.recipe(S, p).map((r) => (
        <li key={r.type}><img alt="" src={game.icons[r.type]} /><span>{p === 'mocha' && r.type === 'syrup' ? 'Add cream' : STOP[r.type]}</span><b>{secsText(r.secs)}</b></li>
      ))}
    </ol>
  );
}

// the detail pane: the selected topic, what it changes, what it needs and what to do about it
function TopicPane({ game, k, icon, per, active: n }: { game: Game; k: string; icon: string; per: Record<string, number>; active: number }) {
  const { ui, dispatch } = useUi();
  const S = game.S, T = Sim.TOPICS[k], r = S.research[k], st = tstate(S, k), work = S.R.research.topics[k].work, fx = topicEffects(S, k);
  const pct = work ? Math.floor(100 * r.done / work) : 100, plan = S.resPlan, hideDone = ui.hideDone;
  const route = st === 'locked' ? Sim.routeTo(S, k) : [];
  const routeMins = route.reduce((m, o) => m + Math.ceil((S.R.research.topics[o].work - S.research[o].done) / S.R.research.rate), 0);
  let status: string = STATE_TEXT[st];
  if (st === 'done') status = r.finished > 0 ? 'Done at ' + fmtClock(r.finished) : 'Known from the start';
  else if (st === 'active') status = 'In progress, ' + minsLeft(S, k, per) + ' min left';
  else if (st !== 'locked') status = (r.done ? pct + '% done, ' : '') + minsLeft(S, k, per) + ' min at full pace';
  const planned = plan.length > 0 && plan[plan.length - 1] === k;
  const needs = Sim.prereqs(k);
  const ctl = st === 'done' ? null
    : st === 'active' ? <button type="button" onClick={() => game.setResearch(k, 0)}>Pause</button>
    : st === 'locked' ? (planned ? <button type="button" onClick={() => game.planResearch('')}>Cancel plan</button>
      : <button type="button" className="primary" onClick={() => game.planResearch(k)}>Plan route: {route.length} topics</button>)
    : n ? <><button type="button" className="primary" onClick={() => game.researchNext(k)}>Do this next</button><button type="button" className="link" onClick={() => game.setResearch(k, 1)}>Run alongside</button></>
    : <button type="button" className="primary" onClick={() => game.setResearch(k, 1)}>{r.done ? 'Resume' : 'Start'}</button>;
  return (
    <>
      <div className="tp-head"><img alt="" src={icon} /><div><h3 id="tpName">{T.name}</h3><p className={'tp-state ' + st}>{status}</p></div></div>
      {st !== 'done' && st !== 'locked' && <div className="progress"><s style={{ width: pct + '%' }}></s></div>}
      <p className="tp-blurb">{T.blurb}</p>
      {fx.changes.length > 0 && (
        <dl className="tp-changes">
          {fx.changes.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.text ? c.text : <>{c.from && <><del>{c.from}</del> </>}<ins>{c.to}</ins></>}</dd></div>)}
        </dl>
      )}
      {fx.unlocks.length > 0 && <ul className="unlocks" aria-label="Unlocks">{fx.unlocks.map((u) => <li key={u}>{u}</li>)}</ul>}
      {fx.recipes.map((p) => <div key={p} className="tp-recipe"><h4><img alt="" src={game.icons['cup:' + p]} />{S.R.PROD[p].name}</h4><Recipe game={game} p={p} /></div>)}
      {st !== 'done' && (fx.gains.length > 0 || fx.costs.length > 0) && (
        <ul className="fx">{fx.gains.map((g) => <li key={g}>{g}</li>)}{fx.costs.map((c) => <li key={c} className="cost">{c}</li>)}</ul>
      )}
      {needs.length > 0 && (
        <p className="tp-needs">Needs {needs.map((p, i) => (
          <Fragment key={p}>{i > 0 && ' '}{hideDone && S.research[p].complete
            ? <span className="chip met">{Sim.TOPICS[p].name}</span>
            : <button type="button" className={'chip' + (S.research[p].complete ? ' met' : '')} onClick={() => dispatch({ type: 'TopicSelected', topic: p })}>{Sim.TOPICS[p].name}</button>}</Fragment>
        ))}</p>
      )}
      {st === 'locked' && !planned && <p className="tp-route">Planning researches {route.slice(0, -1).map((o) => Sim.TOPICS[o].name).join(', then ')}, then this: about {routeMins} min at full pace.</p>}
      {planned && <p className="tp-route">Planned. Each step starts when the one before it finishes.</p>}
      {ctl && <div className="res-ctl">{ctl}</div>}
    </>
  );
}
