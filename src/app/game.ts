// The running game: the sim state, the frame loop, and the player's actions on it. React components read from it and
// call its methods; it tells them when to look again (subscribe for the HUD, subscribeFrame for things that move).
import { Bot, Levels, Sim, type BotPlayer, type Cell, type GameState, type Level } from './engine';
import { centreOf, patchText, researchable, unassigned } from './derive';
import { renderIcons, type Icons } from './scene/icons';
import { ShopScene } from './scene/shop';
import { goalTitle, newlyMetGoals, tutorialStep, type Ticket } from './tickets';
import { BUILD_TRAYS, inBuildMode, initialUi, isArmed, isBuildTray, type ContextMenu, type Target, type UiEvent, type UiState } from './ui';
import { price } from './format';
import { isTouch } from './touch';

export const SEED = 1;
const TPS = 30;                     // ticks per real second at 1×
export const SPEEDS = [0, 1, 2, 5, 20];
const CHEAT = 'doppio';

export interface Note { id: number; text: string; kind: string; at: number; n: number }
export interface HoverTip { text: string; bad: boolean; x: number; y: number }
type Press = { clientX: number; clientY: number; pointerId?: number; pointerType?: string };
const LONG_PRESS = 500;             // ms a still finger takes to open a context menu
const SETTLE = 600;                 // ms paused frames keep drawing after anything changes, so poses and camera come to rest
const IDLE_FRAME = 1000;            // ms between frames drawn anyway while paused and idle

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key: string, v: string) { try { localStorage.setItem(key, v); } catch (e) { /* storage unavailable */ } }
};
export function wonLevels(): Set<string> {
  try { return new Set(JSON.parse(store.get('coffeeflow.won') || '[]')); } catch (e) { return new Set(); }
}
export const storedHideDone = () => store.get('coffeeflow.hideDone') === '1';
export const saveHideDone = (on: boolean) => store.set('coffeeflow.hideDone', on ? '1' : '0');
export const allUnlocked = () => store.get('coffeeflow.unlocked') === '1';
export const isLevelOpen = (L: Level, won: Set<string>) => L.n === 1 || allUnlocked() || won.has(Levels.LEVELS[Levels.LEVELS.indexOf(L) - 1].id);

export class Game {
  // The player's UI state is React's (useReducer in GameProvider). The game sees the latest committed snapshot and
  // reports what happens through dispatch; it never works out UI state itself.
  ui: UiState = initialUi(false);
  private send: (e: UiEvent) => void = () => {};
  S!: GameState;
  level: Level | null = null;
  icons: Icons = {};
  ticker: Note[] = [];
  // progressive disclosure: tools appear once they are useful, and stay
  readonly revealed = new Set<string>();
  readonly fresh = new Set<string>();
  readonly freshItems = new Set<string>();
  private readonly seenDone = new Set<string>();
  readonly dismissed = new Set<string>();
  readonly goalsMet = new Set<string>();
  watching = false;
  bot: BotPlayer | null = null;
  private endShown = false;
  private seenEvent = 0;
  private noteId = 0;
  private typed = '';
  cheated = false;
  private hintTimer = 0;

  scene: ShopScene | null = null;
  sceneError: string | null = null;
  private stageEl: HTMLElement | null = null;
  hover: Target | null = null;
  private hoverCell: { x: number; z: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down: { x: number; y: number; b: number } | null = null;
  private readonly touches = new Set<number>();
  private press = 0;
  tip: HoverTip | null = null;
  cursor = 'grab';

  version = 0;
  frameVersion = 0;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private hudAt = 0;
  private acc = 0;
  private woke = 0;
  private drawn = 0;
  private shownUi: UiState | null = null;

  constructor() {
    this.newGame(SEED);
  }

  // ---------- subscriptions ----------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  subscribeFrame = (fn: () => void) => { this.frameListeners.add(fn); return () => { this.frameListeners.delete(fn); }; };
  getVersion = () => this.version;
  getFrameVersion = () => this.frameVersion;
  private changed(wake = true) { if (wake) this.wake(); this.version++; this.listeners.forEach((fn) => fn()); }
  // something on screen may differ: draw frames again even while paused
  private wake = () => { this.woke = performance.now(); };

  connect(ui: UiState, dispatch: (e: UiEvent) => void) { this.ui = ui; this.send = dispatch; }
  dispatch(e: UiEvent) { this.send(e); }
  get buildMode() { return inBuildMode(this.ui); }

  // ---------- the game ----------
  newGame(seed: number, log?: unknown[] | null, rules?: Record<string, unknown>, lvl?: Level | null) {
    this.level = lvl || null;
    this.S = Sim.create(seed, log, rules, this.level);
    this.seenEvent = 0; this.ticker = [];
    [this.revealed, this.fresh, this.freshItems, this.seenDone, this.dismissed, this.goalsMet].forEach((s) => s.clear());
    this.watching = !!(log && log.length); this.bot = null; this.endShown = false;
    this.hover = null; this.tip = null;
    if (this.scene) this.scene.buildRoom(this.S);
    this.wake();
    this.dispatch({ type: 'GameStarted' });
    this.hudTick();
  }
  get scenario() {
    const S = this.S;
    return (this.level ? 'Level ' + this.level.n + ' · ' + this.level.title : 'Free play · seed ' + S.seed) + (Object.keys(S.over).length ? ' · custom rules' : '');
  }

  act(op: string, ...args: unknown[]) {
    const wasWatching = this.watching && this.S.pending.length;
    if (this.bot) this.stopBot('You took over from the bot.');
    const err = Sim.act(this.S, op, ...args);
    if (wasWatching) { this.watching = false; this.note('You took over the replay.', 'warn'); }
    if (err) this.note(err, 'bad');
    this.changed();
    return err;
  }
  note(text: string, kind?: string) {
    const ticker = this.ticker, last = ticker[ticker.length - 1], now = performance.now();
    if (last && last.text === text && now - last.at < 15000) this.ticker = ticker.slice(0, -1).concat({ ...last, n: last.n + 1, at: now });
    else this.ticker = ticker.concat({ id: ++this.noteId, text, kind: kind || 'info', at: now, n: 1 }).slice(-4);
    this.changed();
  }

  setSpeed(speed: number) { this.dispatch({ type: 'SpeedChanged', speed }); }
  togglePause() { this.setSpeed(this.ui.speed ? 0 : this.ui.lastRunSpeed); }

  // ---------- the canvas ----------
  attach(canvas: HTMLCanvasElement, stage: HTMLElement) {
    this.stageEl = stage;
    try { this.scene = new ShopScene(canvas); this.scene.onMove = this.wake; }
    catch (e) { this.sceneError = 'This browser could not start WebGL, so the shop cannot be shown.'; this.changed(); return () => { this.stageEl = null; }; }
    if (!Object.keys(this.icons).length) this.icons = renderIcons();
    this.scene.buildRoom(this.S);
    this.resize();
    this.scene.resetView();
    const ro = new ResizeObserver(() => this.resize()); ro.observe(stage);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.changed();
    return () => {
      ro.disconnect(); cancelAnimationFrame(this.raf);
      if (this.scene) this.scene.dispose();
      this.scene = null; this.stageEl = null;
    };
  }
  resize() { this.wake(); if (this.scene && this.stageEl) this.scene.resize(this.stageEl.clientWidth, this.stageEl.clientHeight, this.ui.pixel); }
  resetView() { this.wake(); if (this.scene) this.scene.resetView(); }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const S = this.S, speed = this.ui.speed;
    if (speed > 0 && !this.ui.modal) {
      this.acc += dt * TPS * speed;
      let n = Math.floor(this.acc);
      if (n > 80) { n = 80; this.acc = n; }
      for (let i = 0; i < n; i++) { if (this.bot) Bot.tick(this.bot, S, (m) => this.note('Bot: ' + m, 'info')); Sim.step(S); }
      this.acc -= n;
    }
    const frac = speed > 0 ? this.acc : 0;
    if (S.end && !this.endShown) this.showEnd();
    // events from the sim
    for (const e of S.events) if (e.n > this.seenEvent) { this.seenEvent = e.n; this.note(e.text, e.kind); }
    if (this.ui !== this.shownUi) { this.shownUi = this.ui; this.wake(); }
    // paused with nothing moving and nothing touched: leave the last frame up and skip the per-frame updates
    if (speed > 0 || now - this.woke < SETTLE || now - this.drawn > IDLE_FRAME) {
      this.drawn = now;
      const scene = this.scene!;
      scene.sync(S, { sel: this.ui.sel, hover: this.hover, buildMode: this.buildMode, speed }, frac, dt);
      this.hoverTick();
      scene.render();
      this.frameVersion++; this.frameListeners.forEach((fn) => fn());
    }
    if (now - this.hudAt > 200) { this.hudAt = now; this.hudTick(); }
    this.raf = requestAnimationFrame(this.frame);
  };

  // what changes with time rather than with a click: tools coming in, milestones, the replay catching up, old notes
  private hudTick() {
    const S = this.S, rs = S.research;
    const now = {
      menu: Sim.PKEYS.some((p) => Sim.unlocked(S, p)),
      beans: S.st.beansUsed > 0 || S.st.beansBought > 0,
      staff: S.st.served >= 3 || S.workers.length > 1 || S.items.reduce((n, i) => n + (i.type === 'till' ? i.queue.length : 0), 0) >= 3,
      research: true
    };
    for (const [k, on] of Object.entries(now)) if (on && !this.revealed.has(k)) { this.revealed.add(k); if (S.t > 0) this.fresh.add(k); }
    for (const k of Sim.TKEYS) if (rs[k].complete && rs[k].finished > 0 && !this.seenDone.has(k)) { this.seenDone.add(k); (Sim.TOPICS[k].unlocks || []).forEach((t) => { if (S.R.CAT[t]) this.freshItems.add(t); }); }
    if (!this.level && !tutorialStep(S, this.level)) newlyMetGoals(S, this.goalsMet).forEach((id) => this.note('Goal met: ' + goalTitle(id).toLowerCase() + '.', 'good'));
    if (this.watching && !S.pending.length) { this.watching = false; this.note('The replay has caught up. You are in control now.', 'warn'); }
    const sel = this.ui.sel;
    if (sel && !(sel.kind === 'worker' ? S.wmap[sel.id] : S.imap[sel.id])) this.dispatch({ type: 'Selected', target: null });
    const t = performance.now();
    if (this.ticker.length && t - this.ticker[0].at > 7000) this.ticker = this.ticker.slice(1);
    this.changed(false);
  }

  // ---------- pointer on the shop ----------
  pointerDown(e: Press & { button: number }) {
    this.wake();
    this.down = { x: e.clientX, y: e.clientY, b: e.button };
    if (e.pointerType !== 'touch') return;
    // a still finger held down is a right-click; a second finger is a pinch, not a tap
    this.touches.add(e.pointerId ?? 0);
    this.endPress();
    if (this.touches.size > 1) { this.down = null; return; }
    this.press = window.setTimeout(this.longPress, LONG_PRESS);
  }
  pointerMove(e: Press) {
    this.wake();
    this.pointer = { x: e.clientX, y: e.clientY };
    // a touchscreen laptop: once the mouse moves, the ghost follows it again
    if (e.pointerType !== 'touch' && this.ui.placing && this.ui.placing.at) this.dispatch({ type: 'PlacementAimed', cell: null });
    const down = this.down;
    if (this.press && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) this.endPress();
  }
  pointerLeave() { this.wake(); this.pointer = null; this.hover = null; this.hoverCell = null; this.tip = null; }
  pointerCancel(e: Press) { this.wake(); this.touches.delete(e.pointerId ?? 0); this.endPress(); this.down = null; }
  pointerUp(e: Press & { shiftKey: boolean }) {
    this.wake();
    const down = this.down; this.down = null;
    if (e.pointerType === 'touch') { this.touches.delete(e.pointerId ?? 0); this.endPress(); }
    if (!down || (down.b !== 0 && down.b !== 2) || !this.scene) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    this.scene.aim(e.clientX, e.clientY);
    if (down.b === 2) this.contextClick(e); else this.click(e);
  }
  private endPress() { clearTimeout(this.press); this.press = 0; }
  private longPress = () => {
    this.press = 0;
    const down = this.down;
    if (!down || !this.scene || this.ui.placing) return;
    this.down = null;               // so letting go is not also a tap
    this.scene.aim(down.x, down.y);
    this.contextClick({ clientX: down.x, clientY: down.y });
  };
  private stagePoint(e: { clientX: number; clientY: number }) {
    const r = this.stageEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private click(e: Press & { shiftKey: boolean }) {
    const scene = this.scene!, S = this.S, ui = this.ui;
    if (ui.placing) {
      const c = scene.pickCell(); if (!c) return;
      // a finger hides what it touches: the first tap shows where it would go, a second tap there places it
      const aim = ui.placing.at;
      if (e.pointerType === 'touch' && !(aim && aim.x === c.x && aim.z === c.z)) { this.dispatch({ type: 'PlacementAimed', cell: c }); return; }
      this.placeOn(c, e.shiftKey);
      return;
    }
    const p = scene.pickObject();
    if (this.buildMode) {
      if (p && p.kind === 'item') { this.openItemCtx(p.id, e); return; }
      if (p && p.kind === 'worker') { this.dispatch({ type: 'TrayPicked', tray: null }); this.select(p); }
      return;
    }
    const sel = ui.sel;
    if (p && p.kind === 'worker') { this.select(sel && sel.kind === 'worker' && sel.id === p.id ? null : p); return; }
    if (p && p.kind === 'item') {
      const it = S.imap[p.id]; if (!it) return;
      const w = sel && sel.kind === 'worker' ? S.wmap[sel.id] : null;
      if (w) {
        if (!it.built) {
          const had = w.builds.includes(it.id);
          if (!this.act('build', w.id, it.id)) this.note(had ? w.name + ' won’t build ' + Sim.label(S, it) + ' after all' : w.name + ' will build ' + Sim.label(S, it) + (w.builds.length > 1 ? ' (#' + w.builds.length + ' in the list)' : ''), 'info');
        } else if (!this.act('patch', w.id, it.id)) this.note(patchText(S, w.id), 'info');
        return;
      }
      this.select(p); return;
    }
    this.select(null);
  }
  private placeOn(c: Cell, keep: boolean) {
    const placing = this.ui.placing!, at = this.scene!.placeAt(this.S, placing, c);
    if (at.reason) { this.note(at.reason, 'bad'); return; }
    if (this.act('place', placing.type, at.x, at.z, placing.r)) return;
    this.dispatch(keep || placing.several ? { type: 'PlacementAimed', cell: null } : { type: 'PlacementEnded' });
  }
  // the on-screen ✓ while placing by touch
  placeAimed() { const p = this.ui.placing; if (p && p.at && this.scene) this.placeOn(p.at, false); }
  private contextClick(e: { clientX: number; clientY: number }) {
    const scene = this.scene!;
    this.closeCtx();
    if (this.ui.placing) { this.dispatch({ type: 'PlacementEnded' }); return; }
    const p = scene.pickObject();
    if (p && p.kind === 'item') { this.openItemCtx(p.id, e); return; }
    if (p && p.kind === 'worker') { if (this.buildMode) this.dispatch({ type: 'TrayPicked', tray: null }); this.select(p); return; }
    const c = scene.pickCell();
    if (c && Sim.inRoom(this.S, c)) { const at = this.stagePoint(e); this.openCtx({ kind: 'floor', cell: c, x: at.x, y: at.y }); }
  }
  private hoverTick() {
    const scene = this.scene!, S = this.S, ui = this.ui;
    if (ui.placing && ui.placing.at && !ui.ctx) { this.aimTick(ui.placing, ui.placing.at); return; }
    if (!this.pointer || this.down || ui.ctx) { if (!this.pointer || ui.ctx) this.tip = null; scene.showGhost(S, null, null); return; }
    scene.aim(this.pointer.x, this.pointer.y);
    this.hoverCell = scene.pickCell();
    let text: string | null = null, bad = false;
    if (ui.placing) {
      this.hover = null;
      scene.showGhost(S, ui.placing, this.hoverCell);
      const c = S.R.CAT[ui.placing.type], reason = this.hoverCell ? scene.placeAt(S, ui.placing, this.hoverCell).reason : null;
      text = reason ? reason : c.name + ' · ' + price(c) + ' · click to place · R rotates · Esc or right-click to choose again. Blue: staff stand here. Amber: customers.';
      bad = !!reason;
    } else {
      scene.showGhost(S, null, null);
      const hover = this.hover = scene.pickObject();
      const w = ui.sel && ui.sel.kind === 'worker' ? S.wmap[ui.sel.id] : null;
      if (this.buildMode) {
        if (hover && hover.kind === 'item') { const it = S.imap[hover.id]; text = it ? Sim.label(S, it) + ' · click for builders, details or selling' : null; }
        else if (hover && hover.kind === 'worker') { const h = S.wmap[hover.id]; text = h ? 'Click to select ' + h.name + ' and leave build mode' : null; }
      } else if (hover && hover.kind === 'worker') { const h = S.wmap[hover.id]; text = h ? (w && w.id === h.id ? 'Click to deselect ' + h.name : 'Click to select ' + h.name) : null; }
      else if (hover && hover.kind === 'item') {
        const it = S.imap[hover.id];
        if (it && w) {
          const name = Sim.label(S, it);
          if (!it.built) text = w.builds.includes(it.id) ? 'Click to take ' + name + ' off ' + w.name + '’s build list' : 'Click to have ' + w.name + ' build ' + name;
          else if (w.all) text = 'Click to make ' + w.name + ' work only at ' + name;
          else text = w.patch.includes(it.id) ? 'Click to take ' + w.name + ' off ' + name : 'Click to add ' + name + ' to ' + w.name + '’s stations';
        } else if (it) text = Sim.label(S, it) + (it.built ? '' : ' (crate)') + ' · click for details';
      }
    }
    this.cursor = this.hover || ui.placing ? 'pointer' : 'grab';
    if (!text) { this.tip = null; return; }
    const r = this.stageEl!.getBoundingClientRect();
    const x = Math.min(this.pointer.x - r.left, r.width - 290), y = Math.min(this.pointer.y - r.top, r.height - 60);
    this.tip = { text, bad, x: Math.max(0, x), y: Math.max(0, y) };
  }

  // placing by touch: the ghost and its tip stay on the cell last tapped, whatever the finger does next
  private aimTick(placing: { type: string; r: number }, cell: Cell) {
    const scene = this.scene!, S = this.S;
    this.hover = null;
    scene.showGhost(S, placing, cell);
    const reason = scene.placeAt(S, placing, cell).reason, c = S.R.CAT[placing.type];
    const p = scene.project(cell.x + 0.5, 0, cell.z + 0.5), r = this.stageEl!.getBoundingClientRect();
    const text = reason || c.name + ' · ' + price(c) + ' · tap again or ✓ to place';
    this.tip = { text, bad: !!reason, x: Math.max(0, Math.min(p.left, r.width - 290)), y: Math.max(0, Math.min(p.top, r.height - 60)) };
  }

  // ---------- selection ----------
  select(target: Target | null) { this.dispatch({ type: 'Selected', target }); }
  focusItem(id: number) {
    const it = this.S.imap[id]; if (!it) return;
    const c = centreOf(it);
    if (this.scene) { this.scene.focusOn(c.x, c.z); this.wake(); }
    this.dispatch({ type: 'OverlaysClosed' });
    this.select({ kind: 'item', id });
  }

  // the selection panel's buttons
  panelAct(a: string, w: number, i: number) {
    const S = this.S;
    if (a === 'all') { if (!this.act('all', w)) this.note(patchText(S, w), 'info'); }
    else if (a === 'patch') { if (!this.act('patch', w, i)) this.note(patchText(S, w), 'info'); }
    else if (a === 'build') this.act('build', w, i);
    else if (a === 'fire' || a === 'remove') {
      const id = a === 'fire' ? w : i;
      if (isArmed(this.ui, a, id)) {
        this.dispatch({ type: 'RemovalDisarmed' });
        if (a === 'fire') this.act('fire', w); else if (!this.act('remove', i)) this.select(null);
      } else this.dispatch({ type: 'RemovalArmed', act: a, id, until: performance.now() + 4000 });
    }
  }

  // ---------- context menus ----------
  private openCtx(menu: ContextMenu) { this.tip = null; this.dispatch({ type: 'ContextMenuOpened', menu }); }
  openItemCtx(id: number, e: { clientX: number; clientY: number }) {
    if (!this.S.imap[id]) return;
    const at = this.stagePoint(e);
    this.openCtx({ kind: 'item', id, x: at.x, y: at.y, armed: false });
  }
  closeCtx() { if (this.ui.ctx) this.dispatch({ type: 'ContextMenuClosed' }); }
  ctxPlace(type: string, r: number) { this.closeCtx(); this.dispatch({ type: 'PlacementStarted', item: type, r }); }
  ctxToggleBuild() { this.closeCtx(); this.dispatch({ type: 'BuildModeToggled' }); }
  ctxDetails(id: number) { this.closeCtx(); if (this.buildMode) this.dispatch({ type: 'TrayPicked', tray: null }); this.select({ kind: 'item', id }); }
  ctxRemove(id: number) {
    const ctx = this.ui.ctx;
    if (ctx && ctx.kind === 'item' && !ctx.armed) { this.dispatch({ type: 'ContextRemovalArmed' }); return; }
    this.closeCtx();
    if (!this.act('remove', id) && this.ui.sel && this.ui.sel.id === id) this.select(null);
  }
  ctxBuild(w: number, id: number) {
    const S = this.S, wk = S.wmap[w], it = S.imap[id]; if (!wk || !it) return;
    if (!this.act('build', w, id)) this.note(wk.builds.includes(id) ? wk.name + ' will build ' + Sim.label(S, it) : wk.name + ' won’t build ' + Sim.label(S, it) + ' after all', 'info');
    this.disarmCtx();
  }
  ctxPatch(w: number, id: number) {
    if (!this.S.wmap[w]) return;
    if (!this.act('patch', w, id)) this.note(patchText(this.S, w), 'info');
    this.disarmCtx();
  }
  private disarmCtx() { const ctx = this.ui.ctx; if (ctx && ctx.kind === 'item' && ctx.armed) this.dispatch({ type: 'ContextMenuOpened', menu: { ...ctx, armed: false } }); }
  // Fit an item so the clicked square is inside it, trying each rotation in turn.
  fitAt(type: string, cell: { x: number; z: number }) {
    let reason: string | null = null;
    for (let r = 0; r < 4; r++) {
      const [w, d] = Sim.dimsOf(type, r);
      for (let oz = 0; oz < d; oz++) for (let ox = 0; ox < w; ox++) {
        const why = Sim.canPlace(this.S, type, cell.x - ox, cell.z - oz, r);
        if (!why) return { r, reason: null };
        if (!reason) reason = why;
      }
    }
    return { r: 0, reason };
  }

  // ---------- trays, build mode and the dock ----------
  pickTray(t: string | null) {
    this.closeCtx();
    this.dispatch({ type: 'TrayPicked', tray: t });
  }
  // a tray the player has looked in no longer has anything new in it
  trayOpened(tray: string | null) {
    if (!tray) return;
    if (isBuildTray(tray)) BUILD_TRAYS[tray][1].forEach((x) => this.freshItems.delete(x));
    this.fresh.delete(tray);
    this.changed();
  }
  toggleBuildMode() { this.closeCtx(); this.pickTray(this.buildMode ? null : this.ui.lastBuildTray); }
  startPlacing(type: string) { this.dispatch({ type: 'PlacementStarted', item: type, r: 0 }); }
  hire() { if (!this.act('hire')) { const w = this.S.workers[this.S.workers.length - 1]; this.select({ kind: 'worker', id: w.id }); } }
  showWorker(id: number) { this.dispatch({ type: 'TrayPicked', tray: null }); this.select({ kind: 'worker', id }); }
  toggleAuto() { const sp = this.S.supply; this.act('auto', sp.auto.point || 40, sp.auto.qty ? 0 : 4); }
  stepAuto(kind: 'qty' | 'point', d: number) {
    const sp = this.S.supply;
    if (kind === 'qty') this.act('auto', sp.auto.point, Math.max(1, Math.min(20, sp.auto.qty + d)));
    else this.act('auto', Math.max(0, Math.min(400, sp.auto.point + d)), sp.auto.qty);
  }
  assignAll() {
    const ws = this.S.workers.filter((w) => !w.leaving);
    for (const it of unassigned(this.S)) {
      const w = ws.slice().sort((a, b) => a.builds.length - b.builds.length)[0];
      if (w) this.act('build', w.id, it.id);
    }
  }
  ticketAct(t: Ticket) {
    if (t.dismiss) this.dismissed.add(t.dismiss);
    if (t.act === 'show') this.focusItem(Number(t.arg));
    else if (t.act === 'tray') this.pickTray(String(t.arg));
    else if (t.act === 'assignAll') this.assignAll();
    else if (t.act === 'open') this.act('open');
    else if (t.act === 'order') this.act('order', Number(t.arg));
    else if (t.act === 'research') this.setOverlay('research', true);
    this.changed();
  }
  researchLocked() { return !this.revealed.has('research'); }
  toolLocked(t: string) { return !this.revealed.has(t); }

  // ---------- overlays: flow charts and research ----------
  setOverlay(overlay: 'flow' | 'research', open: boolean) {
    if (overlay === 'research' && open) this.fresh.delete('research');
    this.dispatch({ type: 'OverlayToggled', overlay, open });
  }
  toggleOverlay(overlay: 'flow' | 'research') { this.setOverlay(overlay, this.ui.overlay !== overlay); }
  setResearch(k: string, weight: number) { this.act('research', k, weight); }
  planResearch(k: string) { this.act('plan', k); }
  // one topic at full pace, the rest paused
  researchNext(k: string) {
    const S = this.S;
    Sim.TKEYS.forEach((o) => { if (!S.research[o].complete) { const w = o === k ? 1 : 0; if (S.research[o].weight !== w) this.act('research', o, w); } });
  }
  researchOpen() { return researchable(this.S); }

  // ---------- title screen and levels ----------
  showSplash() { this.dispatch({ type: 'SplashOpened' }); }
  hideSplash(speed: number) { this.dispatch({ type: 'SplashClosed', speed }); }
  private showHintFor(ms: number) {
    this.dispatch({ type: 'CameraHintToggled', on: true });
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.dispatch({ type: 'CameraHintToggled', on: false }), ms);
  }
  playLevel(L: Level) {
    this.newGame(L.seed, null, {}, L); this.resetView();
    this.hideSplash(1);
    if (L.tutorial) this.showHintFor(20000);
  }
  freePlay() {
    this.newGame(SEED); this.resetView();
    this.hideSplash(1); this.showHintFor(20000);
  }
  // typed on the title screen, letter by letter; returns true when it unlocks every level
  cheatKey(key: string) {
    if (key.length !== 1) return false;
    this.typed = (this.typed + key.toLowerCase()).slice(-CHEAT.length);
    if (this.typed !== CHEAT || allUnlocked()) return false;
    store.set('coffeeflow.unlocked', '1');
    this.cheated = true;
    this.changed();
    return true;
  }

  // ---------- the end of a level ----------
  private showEnd() {
    this.endShown = true;
    const won = this.S.end!.won;
    if (won && this.level && !this.watching && !this.bot) {
      const done = wonLevels(); done.add(this.level.id);
      store.set('coffeeflow.won', JSON.stringify([...done]));
    }
    this.dispatch({ type: 'ModalOpened', modal: 'end' });
  }
  nextLevel() { const i = this.level ? Levels.LEVELS.indexOf(this.level) : -1; return this.S.end && this.S.end.won && i >= 0 ? Levels.LEVELS[i + 1] || null : null; }

  // ---------- replays ----------
  loadCode(raw: string): string | null {
    let d;
    try { d = Sim.decode(raw); } catch (err) { return (err as Error).message; }
    try { this.newGame(d.seed, d.log, d.rules, d.level ? Levels.byId(d.level) : null); }
    catch (err) { return (err as Error).message; }
    this.dispatch({ type: 'ModalClosed' }); this.resetView();
    if (d.level && !Levels.byId(d.level)) this.note('This code is from a level this version of the game does not have, so it plays as free play.', 'bad');
    if (!d.current) this.note('This code was made with an older version of the game, so it may play out differently.', 'bad');
    if (d.log.length) { this.setSpeed(5); this.note('Watching a replay. Act at any point to take over.', 'warn'); }
    else {
      this.setSpeed(1); this.select({ kind: 'worker', id: this.S.workers[0].id });
      this.note(Object.keys(d.rules).length ? 'Scenario loaded with ' + Object.keys(d.rules).length + ' custom rules. ' + (isTouch() ? 'They are listed under ⋯.' : 'Hover the subtitle to see them.') + ' Your move.' : 'New game on seed ' + d.seed + '. Your move.', 'warn');
    }
    return null;
  }
  restart() {
    if (this.level) this.newGame(this.level.seed, null, {}, this.level); else this.newGame(SEED);
    this.dispatch({ type: 'ModalClosed' }); this.setSpeed(1); this.resetView();
  }
  takeOverReplay() { this.S.pending = []; this.watching = false; this.note('You took over the replay.', 'warn'); }

  // ---------- bots ----------
  startBot(key: string) {
    this.newGame(SEED);
    this.bot = Bot.create(key);
    this.dispatch({ type: 'ModalClosed' }); this.setSpeed(5); this.resetView();
    this.note('The ' + Bot.STRATS[key].name + ' bot is playing. Act at any point to take over.', 'warn');
  }
  stopBot(msg?: string) { if (!this.bot) return; this.bot = null; if (msg) this.note(msg, 'warn'); this.changed(); }

  // ---------- keyboard ----------
  keydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && target.closest && target.closest('textarea, input')) return;
    const ui = this.ui;
    if (ui.splash) { if (e.key === 'Escape' && ui.started) this.hideSplash(ui.splashSpeed); else this.cheatKey(e.key); return; }
    if (ui.modal === 'end') { if (e.key === 'Escape') this.dispatch({ type: 'ModalClosed' }); return; }
    if (e.key === 'Escape' && ui.more) { this.dispatch({ type: 'MoreMenuToggled', open: false }); return; }
    const replayOpen = ui.modal === 'replay';
    if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
    else if (/^Digit[1-5]$/.test(e.code)) this.setSpeed(SPEEDS[+e.code.slice(5) - 1]);
    else if (e.key === 'r' || e.key === 'R') { if (ui.placing) this.dispatch({ type: 'PlacementRotated' }); }
    else if ((e.key === 'b' || e.key === 'B') && !replayOpen) this.toggleBuildMode();
    else if ((e.key === 'f' || e.key === 'F') && !replayOpen) this.toggleOverlay('flow');
    else if ((e.key === 't' || e.key === 'T') && !replayOpen && ((!this.researchLocked() && researchable(this.S).length > 0) || ui.overlay === 'research')) this.toggleOverlay('research');
    else if (e.key === 'Escape') {
      if (replayOpen) this.dispatch({ type: 'ModalClosed' });
      else if (ui.modal === 'playtest') this.dispatch({ type: 'ModalClosed', resume: true });
      else if (ui.ctx) this.closeCtx();
      else if (ui.placing) this.dispatch({ type: 'PlacementEnded' });
      else if (ui.tray) this.pickTray(null);
      else if (ui.overlay) this.dispatch({ type: 'OverlayToggled', overlay: ui.overlay, open: false });
      else this.select(null);
    }
  }
}

export const game = new Game();