import { useEffect, useRef, type RefObject } from 'react';
import { isTouch } from '../touch';
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
  const { ui, dispatch } = useUi();
  const game = useGame();
  const stageRef = useRef<HTMLElement>(null);
  const buildMode = inBuildMode(ui), menuOpen = !!ui.tray && !ui.placing, touch = isTouch();
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
      {ui.hint && <p className="hint">{touch ? 'Drag to pan · drag with two fingers to turn · pinch to zoom' : 'Drag to orbit · right-drag to pan · scroll to zoom · Space pauses'}</p>}
      {ui.placing && (
        <div className="build-status">
          <p aria-live="polite">Placing <b>{game.S.R.CAT[ui.placing.type].name}</b> · {touch ? 'tap the floor to aim, then tap it again or ✓ Place' : 'click the floor · R rotates · Shift-click to place several · Esc to choose again'}</p>
          <div className="place-acts" role="group" aria-label="Placing">
            <button type="button" title="Rotate (R)" onClick={() => dispatch({ type: 'PlacementRotated' })}>⟳ Rotate</button>
            <button type="button" aria-pressed={!!ui.placing.several} title="Keep placing after each one (or Shift-click)" onClick={() => dispatch({ type: 'SeveralToggled' })}>Several</button>
            {ui.placing.at && <button type="button" className="go" onClick={() => game.placeAimed()}>✓ Place</button>}
            <button type="button" title="Choose again (Esc)" onClick={() => dispatch({ type: 'PlacementEnded' })}>Cancel</button>
            <button type="button" title="Leave build mode (B)" onClick={() => dispatch({ type: 'TrayPicked', tray: null })}>Done</button>
          </div>
        </div>
      )}
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
      onPointerCancel={(e) => game.pointerCancel(e)}
      onPointerMove={(e) => game.pointerMove(e)}
      onPointerLeave={() => game.pointerLeave()} />
  );
}
