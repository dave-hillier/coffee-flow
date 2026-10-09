import { Fragment, useEffect, useRef } from 'react';
import { fmtTime, money } from '../format';
import { useGame, useUi } from '../useGame';

const LOST_TITLE: Record<string, string> = { bankrupt: 'Bankrupt', service: 'Trade dried up' };

// the end of a level: won or lost, how it went, and where next
export function EndModal() {
  const { dispatch } = useUi();
  const game = useGame();
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, []);
  const S = game.S, E = S.end!, won = E.won, level = game.level, next = game.nextLevel(), st = S.st;
  const close = () => dispatch({ type: 'ModalClosed' });
  const buttons: [string, string, () => void][] = [];
  if (next) buttons.push(['Next: ' + next.title, 'primary', () => game.playLevel(next)]);
  if (level) buttons.push([won ? 'Play again' : 'Try again', won ? '' : 'primary', () => game.playLevel(level)]);
  buttons.push(
    ['See the flow charts', '', () => { close(); game.setOverlay('flow', true); }],
    ['Choose a level', '', () => game.showSplash()],
    ['Replay code', '', () => dispatch({ type: 'ModalOpened', modal: 'replay' })]
  );
  const stats: [string, string | number][] = [['Time', fmtTime(E.t)], ['Served', st.served], ['Walked out', st.abandoned], ['Happy', Math.round(st.sat * 100) + '%'], ['Cash', money(S.cash)]];
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="endTitle" aria-describedby="endText">
      <article className={'sheet end ' + (won ? 'won' : 'lost')}>
        <p className="end-k">{level ? 'Level ' + level.n + ' · ' + level.title : 'Free play'}</p>
        <h2 id="endTitle">{won ? 'Level complete' : LOST_TITLE[E.why] || 'Game over'}</h2>
        <p id="endText">{E.text}</p>
        <dl className="kv">{stats.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        {won && level && level.lesson && <p className="lesson">{level.lesson}</p>}
        <div className="row">
          {buttons.map(([label, cls, fn], i) => <button key={label} type="button" className={cls || undefined} ref={i === 0 ? firstRef : undefined} onClick={fn}>{label}</button>)}
        </div>
      </article>
    </div>
  );
}
