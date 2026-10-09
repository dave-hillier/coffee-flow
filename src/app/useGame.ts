import { createContext, useContext, useSyncExternalStore, type Dispatch } from 'react';
import type { Game } from './game';
import type { UiEvent, UiState } from './ui';

export const GameContext = createContext<Game | null>(null);
export const UiContext = createContext<{ ui: UiState; dispatch: Dispatch<UiEvent> } | null>(null);

function useGameContext() {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame needs a GameProvider');
  return game;
}

// the game, re-read whenever the sim changes (an action, or a few times a second while it runs)
export function useGame() {
  const game = useGameContext();
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}

// the game, re-read every animation frame: for labels that follow things around the shop
export function useGameFrame() {
  const game = useGameContext();
  useSyncExternalStore(game.subscribeFrame, game.getFrameVersion);
  return game;
}

// what the player has open and selected, and how to tell it what happened
export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi needs a GameProvider');
  return ctx;
}
