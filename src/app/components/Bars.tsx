import { useGame } from '../useGame';

// shown while a replay plays itself out
export function ReplayBar() {
  const game = useGame();
  const n = game.S.pending.length;
  if (!game.watching || !n) return null;
  return (
    <div className="replaybar">
      <span>Watching a replay · {n} decision{n === 1 ? '' : 's'} to come</span>
      <button type="button" onClick={() => game.takeOverReplay()}>Take over</button>
    </div>
  );
}

// shown while a bot plays
export function BotBar() {
  const game = useGame();
  if (!game.bot) return null;
  return (
    <div className="replaybar botbar">
      <span>Bot playing · <b>{game.bot.name}</b></span>
      <button type="button" onClick={() => game.stopBot('You took over from the bot.')}>Take over</button>
    </div>
  );
}
