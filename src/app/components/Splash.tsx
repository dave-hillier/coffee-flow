import { useEffect, useRef } from 'react';
import { Levels } from '../engine';
import { isLevelOpen, wonLevels } from '../game';
import { useGame, useUi } from '../useGame';

// the title screen: levels in order, the first one not yet won is the one to play next
export function Splash() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  const resumeRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const started = ui.started;
  const won = wonLevels(), next = Levels.LEVELS.find((L) => !won.has(L.id) && isLevelOpen(L, won)) || Levels.LEVELS[0];
  useEffect(() => {
    (started ? resumeRef.current : nextRef.current)?.focus({ preventScroll: true });
  }, [started]);
  return (
    <div className="splash" role="dialog" aria-modal="true" aria-labelledby="splashTitle">
      <div className="splash-inner">
        <h1 id="splashTitle">Coffee <em>Flow</em></h1>
        <p>A small café game about queues, capacity and getting drinks out the door.</p>
        {started && <button type="button" className="primary" ref={resumeRef} onClick={() => game.hideSplash(ui.splashSpeed)}>Back to the shop</button>}
        <nav className="levels" aria-labelledby="levelsTitle">
          <h2 id="levelsTitle">Levels{game.cheated ? ' · all unlocked' : ''}</h2>
          <ol>
            {Levels.LEVELS.map((L, i) => {
              const open = isLevelOpen(L, won);
              const goals = L.goals.map((g, k) => (k ? g.title[0].toLowerCase() + g.title.slice(1) : g.title)).join(', then ');
              return (
                <li key={L.id}>
                  <button type="button" className={L === next ? 'next' : undefined} disabled={!open} ref={L === next ? nextRef : undefined} onClick={() => game.playLevel(L)}>
                    <span className="n" aria-hidden="true">{L.n}</span>
                    <b className="t">{L.title}</b>
                    {won.has(L.id) ? <span className="won">Won</span> : open ? <span></span> : <span className="lock">Locked</span>}
                    <span className="g">{open ? goals : 'Win ' + Levels.LEVELS[i - 1].title + ' to unlock'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="splash-btns">
          <button type="button" onClick={() => game.freePlay()}>Free play</button>
          <button type="button" onClick={() => { game.hideSplash(0); dispatch({ type: 'ModalOpened', modal: 'replay', pasting: true }); }}>Watch a replay</button>
        </div>
      </div>
      <p className="splash-foot">{game.scenario}</p>
    </div>
  );
}
