import { describe, expect, it } from 'vitest';
import { inBuildMode, initialUi, reduce, type UiEvent, type UiState } from './ui';

const after = (...events: UiEvent[]) => events.reduce(reduce, initialUi(false));

describe('trays', () => {
  it('opening a build tray enters build mode and drops the selection', () => {
    const ui = after({ type: 'Selected', target: { kind: 'worker', id: 1 } }, { type: 'TrayPicked', tray: 'machines' });
    expect(inBuildMode(ui)).toBe(true);
    expect(ui.sel).toBeNull();
    expect(ui.lastBuildTray).toBe('machines');
  });

  it('picking the open tray again closes it', () => {
    expect(after({ type: 'TrayPicked', tray: 'menu' }, { type: 'TrayPicked', tray: 'menu' }).tray).toBeNull();
  });

  it('picking the open tray while placing goes back to the tray', () => {
    const ui = after({ type: 'TrayPicked', tray: 'counters' }, { type: 'PlacementStarted', item: 'till', r: 0 }, { type: 'TrayPicked', tray: 'counters' });
    expect(ui.tray).toBe('counters');
    expect(ui.placing).toBeNull();
  });

  it('build mode toggles back to the last build tray used', () => {
    const ui = after({ type: 'TrayPicked', tray: 'storage' }, { type: 'BuildModeToggled' }, { type: 'BuildModeToggled' });
    expect(ui.tray).toBe('storage');
  });

  it('opening a tray closes the flow charts', () => {
    const ui = after({ type: 'OverlayToggled', overlay: 'flow', open: true }, { type: 'TrayPicked', tray: 'beans' });
    expect(ui.overlay).toBeNull();
  });
});

describe('placing', () => {
  it('starting from the floor menu opens the matching build tray', () => {
    const ui = after({ type: 'PlacementStarted', item: 'grinder', r: 1 });
    expect(ui.tray).toBe('machines');
    expect(ui.placing).toEqual({ type: 'grinder', r: 1 });
  });

  it('rotating turns a quarter at a time and wraps', () => {
    let ui: UiState = after({ type: 'PlacementStarted', item: 'till', r: 3 });
    ui = reduce(ui, { type: 'PlacementRotated' });
    expect(ui.placing!.r).toBe(0);
  });

  it('opening an overlay puts down what was being placed', () => {
    const ui = after({ type: 'PlacementStarted', item: 'till', r: 0 }, { type: 'OverlayToggled', overlay: 'research', open: true });
    expect(ui.placing).toBeNull();
    expect(ui.tray).toBeNull();
    expect(ui.overlay).toBe('research');
  });
});

describe('speed', () => {
  it('remembers the last running speed through a pause', () => {
    const ui = after({ type: 'SpeedChanged', speed: 5 }, { type: 'SpeedChanged', speed: 0 });
    expect(ui.speed).toBe(0);
    expect(ui.lastRunSpeed).toBe(5);
  });

  it('the title screen pauses and remembers the speed to come back to', () => {
    const ui = after({ type: 'SplashClosed', speed: 2 }, { type: 'SplashOpened' });
    expect(ui.speed).toBe(0);
    expect(ui.splashSpeed).toBe(2);
  });

  it('closing the playtest resumes the speed it interrupted', () => {
    const ui = after({ type: 'SpeedChanged', speed: 20 }, { type: 'ModalOpened', modal: 'playtest' }, { type: 'ModalClosed', resume: true });
    expect(ui.modal).toBeNull();
    expect(ui.speed).toBe(20);
  });

  it('the end of a level stops the clock and clears the shop floor', () => {
    const ui = after({ type: 'SpeedChanged', speed: 5 }, { type: 'TrayPicked', tray: 'counters' }, { type: 'ModalOpened', modal: 'end' });
    expect(ui.speed).toBe(0);
    expect(ui.tray).toBeNull();
  });
});

describe('a new game', () => {
  it('forgets the selection, menus and the end of the last one', () => {
    const ui = after(
      { type: 'Selected', target: { kind: 'item', id: 3 } },
      { type: 'ContextMenuOpened', menu: { kind: 'item', id: 3, x: 0, y: 0, armed: true } },
      { type: 'ModalOpened', modal: 'end' },
      { type: 'GameStarted' }
    );
    expect(ui.sel).toBeNull();
    expect(ui.ctx).toBeNull();
    expect(ui.modal).toBeNull();
  });
});
