import { useEffect, useRef } from 'react';
import { Sim } from '../engine';
import { researchable, researchRates, sumCups } from '../derive';
import { tutorialStep } from '../tickets';
import { BUILD_TRAYS } from '../ui';
import { useGame, useUi } from '../useGame';
import { useWhyTip } from './WhyTip';

// tools that aren't useful yet stay in the dock, greyed out, saying what brings them in
const UNLOCK_WHY: Record<string, string> = {
  menu: 'Build a filter brewer to put drinks on the menu',
  beans: 'Comes in once the shop starts using beans: build a brewer and open up',
  staff: 'Comes in once you have served 3 customers or a queue builds',
  research: ''
};

// the icon row along the bottom: each tool opens a tray above it
export function Dock() {
  const game = useGame();
  const { handlers, tip } = useWhyTip();
  const S = game.S;
  const navRef = useRef<HTMLElement>(null);
  // when the tools don't fit (a phone), the edge they run off fades so the row reads as one that scrolls
  useEffect(() => {
    const nav = navRef.current!;
    const edges = () => {
      nav.toggleAttribute('data-more-left', nav.scrollLeft > 1);
      nav.toggleAttribute('data-more-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    };
    const ro = new ResizeObserver(edges);
    ro.observe(nav);
    for (const c of nav.children) ro.observe(c);
    nav.addEventListener('scroll', edges, { passive: true });
    return () => { ro.disconnect(); nav.removeEventListener('scroll', edges); };
  }, []);
  return (
    <footer className="dock">
      {tip}
      <nav className="tools" aria-label="Shop tools" ref={navRef} {...handlers}>
        <div className="tool-group" role="group" aria-label="Build">
          <Tool tray="counters" ico="till" title="Counters (B)" label="Counters" />
          <Tool tray="machines" ico="espresso" title="Machines" label="Machines" />
          <Tool tray="storage" ico="stock" title="Storage" label="Storage" />
        </div>
        <div className="tool-group" role="group" aria-label="Running the shop">
          <Tool tray="menu" ico="cup" title="What's on the menu" label="Menu" />
          <Tool tray="beans" ico="sack" title="Beans" label={sumCups(S) + ' cups'} />
          <Tool tray="staff" ico="worker" title="Staff" label={S.workers.filter((w) => !w.leaving).length + ' of ' + S.R.maxWorkers} />
        </div>
        <ResearchTool />
      </nav>
    </footer>
  );
}

function Tool({ tray, ico, title, label }: { tray: string; ico: string; title: string; label: string }) {
  const { ui } = useUi();
  const game = useGame();
  const S = game.S, step = tutorialStep(S, game.level);
  const build = BUILD_TRAYS[tray];
  const hidden = build ? !build[1].some((x) => Sim.allowed(S, x)) : tray === 'staff' && S.R.maxWorkers <= 1;
  const locked = !build && game.toolLocked(tray);
  const isNew = build ? build[1].some((x) => game.freshItems.has(x)) : game.fresh.has(tray);
  const call = !!(step && step.act === 'tray' && step.arg === tray && ui.tray !== tray);
  return (
    <button type="button" className={'tool' + (call ? ' call' : '')} hidden={hidden} aria-expanded={ui.tray === tray} aria-controls="tray" title={title}
      aria-disabled={locked ? 'true' : undefined} onClick={() => { if (!locked) game.pickTray(tray); }}>
      <img alt="" src={game.icons[ico]} /><span>{label}</span>
      {isNew && <em className="badge">new</em>}
      {locked && <small className="why">{UNLOCK_WHY[tray]}</small>}
    </button>
  );
}

// the research chip: what is being researched and how long is left, or a nudge when nothing is
function ResearchTool() {
  const { ui } = useUi();
  const game = useGame();
  const S = game.S, locked = game.researchLocked();
  const open = researchable(S);
  let text = 'Research', cls = '', pct = 0;
  if (!locked) {
    const rr = researchRates(S), left = open.filter((k) => !S.research[k].complete);
    if (!left.length) { text = 'All researched'; cls = 'done'; }
    else if (rr.act.length) {
      const k = rr.act[0], r = S.research[k], work = S.R.research.topics[k].work;
      pct = Math.floor(100 * r.done / work);
      text = Sim.TOPICS[k].name + ' · ' + Math.ceil((work - r.done) / rr.per[k]) + ' min' + (rr.act.length > 1 ? ' +' + (rr.act.length - 1) : '');
    } else { text = 'Pick research'; cls = 'idle'; }
  }
  return (
    <button type="button" className={'tool research-tool' + (cls ? ' ' + cls : '')} hidden={!open.length} aria-expanded={ui.overlay === 'research'} aria-controls="research" title="Research (T)"
      aria-disabled={locked ? 'true' : undefined} onClick={() => { if (!locked) game.toggleOverlay('research'); }}>
      <img alt="" src={game.icons.research} /><span>{text}</span><i className="prog" aria-hidden="true"><s style={{ width: pct + '%' }}></s></i>
    </button>
  );
}
