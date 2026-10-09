import { useEffect, useRef, type RefObject } from 'react';
import { inBuildMode } from '../ui';
import { useGame, useGameFrame, useUi } from '../useGame';
import { Labels } from './Labels';
import { Rail } from './Rail';
import { Panel } from './Panel';
import { ReplayBar, BotBar } from './Bars';
import { Ticker } from './Ticker';
import { Flow } from './Flow';
import { Research } from './Research';
import { Tray } from './Tray';
import { ContextMenu } from './ContextMenu';
import { PlaytestModal } from './Playtest';
import { EndModal } from './EndModal';
import { ReplayModal } from './ReplayModal';

// the live isometric shop, with everything that floats over it
export function Stage() {
  const { ui } = useUi();
  const game = useGame();
  const stageRef = useRef<HTMLElement>(null);
  const buildMode = inBuildMode(ui), menuOpen = !!ui.tray && !ui.placing;
  const cls = ['stage', ui.pixel && 'pixel', buildMode && 'building', menuOpen && 'menu-open', ui.overlay && 'flow-open', ui.overlay === 'research' && 'res-open'].filter(Boolean).join(' ');
  return (
    <main className={cls} ref={stageRef}>
      <ShopCanvas stageRef={stageRef} />
      {game.sceneError && <div className="fail">{game.sceneError}</div>}
      <Labels />
      <Rail />
      <Panel />
      <ReplayBar />
      <BotBar />
      <Ticker />
      {ui.overlay === 'flow' && <Flow />}
      {ui.overlay === 'research' && <Research />}
      {menuOpen && <Tray />}
      {ui.ctx && <ContextMenu />}
      {ui.hint && <p className="hint">Drag to orbit · right-drag to pan · scroll to zoom · Space pauses</p>}
      {ui.placing && <p className="build-status" aria-live="polite">Placing <b>{game.S.R.CAT[ui.placing.type].name}</b> · click the floor · R rotates · Shift-click to place several · Esc to choose again</p>}
      <PlaytestModal />
      {ui.modal === 'end' && <EndModal />}
      {ui.modal === 'replay' && <ReplayModal />}
    </main>
  );
}

// the canvas three.js draws into; it follows the pointer every frame to show what a click would do
function ShopCanvas({ stageRef }: { stageRef: RefObject<HTMLElement | null> }) {
  const game = useGameFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => game.attach(canvasRef.current!, stageRef.current!), [game, stageRef]);
  return (
    <canvas ref={canvasRef} style={{ cursor: game.cursor }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => game.pointerDown(e)}
      onPointerUp={(e) => game.pointerUp(e)}
      onPointerMove={(e) => game.pointerMove(e)}
      onPointerLeave={() => game.pointerLeave()} />
  );
}
