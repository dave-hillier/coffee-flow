import { type CSSProperties } from 'react';
import { railTickets, ticketKey } from '../tickets';
import { useGame } from '../useGame';

const TILTS = ['-1deg', '0.7deg', '-0.3deg', '0.4deg', '-0.6deg'];
const tiltOf = (key: string) => TILTS[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % TILTS.length];

// tickets hang on the rail while they matter. Keyed, so a ticket that stays up keeps its element and only new ones drop in.
export function Rail() {
  const game = useGame();
  const { shown, more } = railTickets({ S: game.S, level: game.level, dismissed: game.dismissed, goalsMet: game.goalsMet });
  if (!shown.length) return null;
  return (
    <section className="rail" aria-label="Needs your attention">
      <ol className="tickets">
        {shown.map((t) => {
          const key = ticketKey(t);
          return (
            <li key={key} className={'ticket ' + t.sev} style={{ '--tilt': tiltOf(key) } as CSSProperties}>
              <span className="k">{t.k}</span>
              <h3>{t.title}</h3>
              {t.bar != null && <div className="tbar"><s style={{ width: Math.round(100 * Math.min(1, t.bar)) + '%' }}></s></div>}
              {t.body && <p>{t.body}</p>}
              {t.btn && <button type="button" onClick={() => game.ticketAct(t)}>{t.btn}</button>}
            </li>
          );
        })}
        {more > 0 && <li key="more" className="ticket more">+{more} more</li>}
      </ol>
    </section>
  );
}
