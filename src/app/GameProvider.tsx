import { useEffect, useLayoutEffect, useReducer, type ReactNode } from 'react';
import { saveHideDone, storedHideDone, type Game } from './game';
import { initialUi, reduce } from './ui';
import { GameContext, UiContext } from './useGame';

// Owns the player's UI state. The game loop reads each committed state and dispatches what happens in the shop;
// the reducer alone decides what that means for the screen.
export function GameProvider({ game, children }: { game: Game; children: ReactNode }) {
  const [ui, dispatch] = useReducer(reduce, undefined, () => initialUi(storedHideDone()));
  // before paint, so the next animation frame already sees this state
  useLayoutEffect(() => { game.connect(ui, dispatch); }, [game, ui]);
  useEffect(() => { game.trayOpened(ui.tray); }, [game, ui.tray]);
  useEffect(() => { saveHideDone(ui.hideDone); }, [ui.hideDone]);
  useEffect(() => { game.resize(); }, [game, ui.pixel]);
  return (
    <GameContext.Provider value={game}>
      <UiContext.Provider value={{ ui, dispatch }}>{children}</UiContext.Provider>
    </GameContext.Provider>
  );
}
