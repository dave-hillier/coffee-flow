import { useGame } from '../useGame';

// the last few things that happened, fading out after a few seconds
export function Ticker() {
  const game = useGame();
  return (
    <div className="ticker" aria-live="polite">
      {game.ticker.map((t) => <p key={t.id} className={t.kind}>{t.text}{t.n > 1 ? ' ×' + t.n : ''}</p>)}
    </div>
  );
}
