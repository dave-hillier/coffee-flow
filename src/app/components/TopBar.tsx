import { Fragment } from 'react';
import { Sim } from '../engine';
import { cashPerHour, passStages } from '../derive';
import { fmtTime, money } from '../format';
import { useGame, useUi } from '../useGame';
import { MoreMenu } from './MoreMenu';
import { useWhyTip } from './WhyTip';

const SPEED_BUTTONS: [number, string, string][] = [
  [0, '❚❚', 'Pause (Space)'], [1, '1×', 'Normal speed (2)'], [2, '2×', 'Speed 2× (3)'], [5, '5×', 'Speed 5× (4)'], [20, '20×', 'Speed 20× (5)']
];

// the top bar: money on the left, the pass in the middle, time on the right
export function TopBar() {
  const { ui } = useUi();
  const game = useGame();
  const { handlers, tip } = useWhyTip();
  const S = game.S, st = S.st;
  const ph = cashPerHour(S);
  const trading = S.open || st.arrived > 0;
  const why = S.open ? null : Sim.whyNotOpen(S);
  // always there; greyed out with the reason until the shop can open
  const label = S.open ? 'open' : trading ? 'closed' : 'shut';
  const openCls = [S.open ? 'is-open' : '', !S.open && !why && !trading ? 'call' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <header className="bar">
      <div className="money" aria-label="Money">
        <b id="cash" className={S.cash < 0 ? 'neg' : undefined}>{money(S.cash)}</b>
        <span id="cashRate" className={ph > 0 ? 'up' : ph < 0 && S.cash < -ph * 2 ? 'down' : undefined}>
          {(ph >= 0 ? '+' : '−') + money(Math.abs(ph)) + ' an hour' + (!S.open && !st.arrived ? ' before you open' : '')}
        </span>
        {trading && (
          <span className={'mood' + (st.sat < 0.45 ? ' bad' : st.sat < 0.65 ? ' meh' : '')}>
            <i></i>{Math.round(st.sat * 100)}% happy{st.abandoned ? ' · ' + st.abandoned + ' walked out' : ''}
          </span>
        )}
      </div>
      {trading && <Pass />}
      <div className="controls">
        <button id="openBtn" type="button" aria-describedby="openWhy" data-label={label} className={openCls}
          aria-disabled={why ? 'true' : undefined}
          title={why ? undefined : S.open ? 'Click to close: no new customers will arrive' : 'Let customers in'}
          onClick={() => { if (!why) game.act('open'); }} {...handlers}>
          <span data-for="shut">Open shop</span><span data-for="open">Open</span><span data-for="closed">Closed</span>
        </button>
        <span className="why" id="openWhy">{why || ''}</span>
        {tip}
        <span className="clock" title="Time trading">{fmtTime(S.t)}</span>
        <div className="seg" role="group" aria-label="Game speed">
          {SPEED_BUTTONS.map(([s, text, title]) => (
            <button key={s} type="button" aria-pressed={ui.speed === s} title={title} aria-label={s === 0 ? 'Pause' : undefined} onClick={() => game.setSpeed(s)}>{text}</button>
          ))}
        </div>
        <MoreMenu />
      </div>
    </header>
  );
}

function Pass() {
  const game = useGame();
  const S = game.S, st = S.st;
  const c = passStages(S), worst = Math.max(c.queue, c.rail, c.making, c.ready);
  const stages: [number, string][] = [[c.queue, 'queuing'], [c.rail, 'orders'], [c.making, 'making'], [c.ready, 'ready']];
  return (
    <ol className="pass" aria-label="Orders in the shop">
      {stages.map(([n, label], i) => (
        <Fragment key={label}>
          {i > 0 && <li className="chev" aria-hidden="true">›</li>}
          <li className={n >= 6 ? 'jam' : n >= 3 && n === worst ? 'hot' : undefined}><b>{n}</b><span>{label}</span></li>
        </Fragment>
      ))}
      <li className="lead"><b>{st.served ? (st.lead / 60).toFixed(1) + ' min' : '–'}</b><span>door to cup</span></li>
    </ol>
  );
}
