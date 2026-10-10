// What the player has open, selected and in hand. Changed only by events: things that have happened.
import type { Cell } from './engine';

export type Target = { kind: 'worker' | 'item'; id: number };
export type ContextMenu =
  | { kind: 'item'; id: number; x: number; y: number; armed: boolean }
  | { kind: 'floor'; cell: Cell; x: number; y: number };
export type Overlay = 'flow' | 'research';
export type Modal = 'replay' | 'playtest' | 'end';
export type FlowMode = 'stock' | 'cumulative';

export interface UiState {
  splash: boolean; started: boolean; splashSpeed: number;
  speed: number; lastRunSpeed: number; speedBeforePlaytest: number;
  sel: Target | null;
  armed: { act: string; id: number; until: number } | null;
  tray: string | null; lastBuildTray: string; tileFocus: string | null;
  // what is in hand; on touch, the cell it is aimed at before a second tap places it, and whether to keep placing
  placing: { type: string; r: number; at?: Cell | null; several?: boolean } | null;
  ctx: ContextMenu | null;
  overlay: Overlay | null;
  flowRange: number; flowMode: FlowMode;
  resSel: string | null; hideDone: boolean;
  more: boolean; hint: boolean; pixel: boolean;
  modal: Modal | null;
  // the replay sheet opened to paste a code in, rather than to copy this game's
  pasting: boolean;
}

export const BUILD_TRAYS: Record<string, [string, string[]]> = {
  counters: ['Counters', ['till', 'pickup']],
  machines: ['Machines', ['brewer', 'grinder', 'espresso', 'pastry', 'milk', 'syrup']],
  storage: ['Storage', ['stock', 'store']]
};
export const trayOf = (type: string) => Object.keys(BUILD_TRAYS).find((k) => BUILD_TRAYS[k][1].includes(type)) || 'counters';
export const isBuildTray = (t: string | null) => !!(t && BUILD_TRAYS[t]);
export const inBuildMode = (ui: UiState) => isBuildTray(ui.tray) || !!ui.placing;

export const isArmed = (ui: UiState, act: string, id: number) => !!ui.armed && ui.armed.act === act && ui.armed.id === id && performance.now() < ui.armed.until;

export const initialUi = (hideDone: boolean): UiState => ({
  splash: true, started: false, splashSpeed: 1,
  speed: 0, lastRunSpeed: 1, speedBeforePlaytest: 1,
  sel: null, armed: null,
  tray: null, lastBuildTray: 'counters', tileFocus: null,
  placing: null, ctx: null, overlay: null,
  flowRange: 120, flowMode: 'stock',
  resSel: null, hideDone,
  more: false, hint: false, pixel: true,
  modal: null, pasting: false
});

export type UiEvent =
  | { type: 'GameStarted' }
  | { type: 'SpeedChanged'; speed: number }
  | { type: 'SpeedCycled' }
  | { type: 'SplashOpened' }
  | { type: 'SplashClosed'; speed: number }
  | { type: 'TrayPicked'; tray: string | null }
  | { type: 'BuildModeToggled' }
  | { type: 'PlacementStarted'; item: string; r: number }
  | { type: 'PlacementRotated' }
  | { type: 'PlacementAimed'; cell: Cell | null }
  | { type: 'SeveralToggled' }
  | { type: 'PlacementEnded' }
  | { type: 'TileFocused'; item: string }
  | { type: 'Selected'; target: Target | null }
  | { type: 'RemovalArmed'; act: string; id: number; until: number }
  | { type: 'RemovalDisarmed' }
  | { type: 'ContextMenuOpened'; menu: ContextMenu }
  | { type: 'ContextRemovalArmed' }
  | { type: 'ContextMenuClosed' }
  | { type: 'OverlayToggled'; overlay: Overlay; open: boolean }
  | { type: 'OverlaysClosed' }
  | { type: 'FlowRangeChosen'; range: number }
  | { type: 'FlowModeChosen'; mode: FlowMode }
  | { type: 'TopicSelected'; topic: string }
  | { type: 'FinishedTopicsToggled' }
  | { type: 'MoreMenuToggled'; open: boolean }
  | { type: 'CameraHintToggled'; on: boolean }
  | { type: 'PixelModeToggled' }
  | { type: 'ModalOpened'; modal: Modal; pasting?: boolean }
  | { type: 'ModalClosed'; resume?: boolean };

// the running speeds the narrow-screen speed button steps through, in order
export const RUN_SPEEDS = [1, 2, 5, 20];
const withSpeed = (ui: UiState, speed: number): UiState => ({ ...ui, speed, lastRunSpeed: speed > 0 ? speed : ui.lastRunSpeed });

// picking a tool opens its tray; picking the open one again closes it. Opening any tray closes the overlays.
function pickTray(ui: UiState, t: string | null): UiState {
  if (t && t === ui.tray && !ui.placing) t = null;
  const next: UiState = { ...ui, tray: t, placing: null, tileFocus: null, overlay: t ? null : ui.overlay };
  if (isBuildTray(t)) return { ...next, lastBuildTray: t!, sel: null, armed: null };
  return next;
}

export function reduce(ui: UiState, e: UiEvent): UiState {
  switch (e.type) {
    case 'GameStarted':
      return { ...ui, sel: null, armed: null, placing: null, tray: null, tileFocus: null, ctx: null, resSel: null, modal: ui.modal === 'end' ? null : ui.modal };
    case 'SpeedChanged':
      return withSpeed(ui, e.speed);
    case 'SpeedCycled':
      return withSpeed(ui, RUN_SPEEDS[(RUN_SPEEDS.indexOf(ui.lastRunSpeed) + 1) % RUN_SPEEDS.length]);
    case 'SplashOpened':
      return { ...ui, splashSpeed: ui.speed || ui.lastRunSpeed, speed: 0, more: false, splash: true, modal: ui.modal === 'end' ? null : ui.modal };
    case 'SplashClosed':
      return withSpeed({ ...ui, splash: false, started: true }, e.speed);
    case 'TrayPicked':
      return pickTray(ui, e.tray);
    case 'BuildModeToggled':
      return pickTray(ui, inBuildMode(ui) ? null : ui.lastBuildTray);
    case 'PlacementStarted': {
      const base = isBuildTray(ui.tray) ? ui : pickTray(ui, trayOf(e.item));
      return { ...base, placing: { type: e.item, r: e.r } };
    }
    case 'PlacementRotated':
      return ui.placing ? { ...ui, placing: { ...ui.placing, r: (ui.placing.r + 1) % 4 } } : ui;
    case 'PlacementAimed':
      return ui.placing ? { ...ui, placing: { ...ui.placing, at: e.cell } } : ui;
    case 'SeveralToggled':
      return ui.placing ? { ...ui, placing: { ...ui.placing, several: !ui.placing.several } } : ui;
    case 'PlacementEnded':
      return { ...ui, placing: null };
    case 'TileFocused':
      return { ...ui, tileFocus: e.item };
    case 'Selected':
      return { ...ui, sel: e.target, armed: null };
    case 'RemovalArmed':
      return { ...ui, armed: { act: e.act, id: e.id, until: e.until } };
    case 'RemovalDisarmed':
      return { ...ui, armed: null };
    case 'ContextMenuOpened':
      return { ...ui, ctx: e.menu };
    case 'ContextRemovalArmed':
      return ui.ctx && ui.ctx.kind === 'item' ? { ...ui, ctx: { ...ui.ctx, armed: true } } : ui;
    case 'ContextMenuClosed':
      return { ...ui, ctx: null };
    case 'OverlayToggled':
      if (!e.open) return ui.overlay === e.overlay ? { ...ui, overlay: null } : ui;
      return { ...ui, overlay: e.overlay, tray: null, placing: null, tileFocus: null };
    case 'OverlaysClosed':
      return { ...ui, overlay: null, tray: null, placing: null, tileFocus: null };
    case 'FlowRangeChosen':
      return { ...ui, flowRange: e.range };
    case 'FlowModeChosen':
      return { ...ui, flowMode: e.mode };
    case 'TopicSelected':
      return { ...ui, resSel: e.topic };
    case 'FinishedTopicsToggled':
      return { ...ui, hideDone: !ui.hideDone };
    case 'MoreMenuToggled':
      return { ...ui, more: e.open };
    case 'CameraHintToggled':
      return { ...ui, hint: e.on };
    case 'PixelModeToggled':
      return { ...ui, pixel: !ui.pixel };
    case 'ModalOpened':
      if (e.modal === 'playtest') return { ...ui, modal: 'playtest', speedBeforePlaytest: ui.speed, speed: 0 };
      if (e.modal === 'end') return { ...ui, modal: 'end', speed: 0, overlay: null, tray: null, placing: null, tileFocus: null, more: false };
      return { ...ui, modal: e.modal, speed: 0, pasting: !!e.pasting };
    case 'ModalClosed': {
      const closed = { ...ui, modal: null };
      return e.resume && ui.modal === 'playtest' ? withSpeed(closed, ui.speedBeforePlaytest) : closed;
    }
  }
}
