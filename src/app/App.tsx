import { useEffect } from 'react';
import { useGame, useUi } from './useGame';
import { Splash } from './components/Splash';
import { TopBar } from './components/TopBar';
import { Stage } from './components/Stage';
import { Dock } from './components/Dock';

export function App() {
  const { ui } = useUi();
  const game = useGame();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => game.keydown(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);
  return (
    <div className="app">
      {ui.splash && <Splash />}
      <TopBar />
      <Stage />
      <Dock />
    </div>
  );
}
