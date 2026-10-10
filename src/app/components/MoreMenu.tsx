import { useEffect, useRef, type KeyboardEvent } from 'react';
import { isTouch } from '../touch';
import { useGame, useUi } from '../useGame';

// the ⋯ menu: tools and settings most players rarely need
export function MoreMenu() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  const open = ui.more;
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const setOpen = (on: boolean) => dispatch({ type: 'MoreMenuToggled', open: on });

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) dispatch({ type: 'MoreMenuToggled', open: false }); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, game]);

  const keys = (e: KeyboardEvent) => {
    // Esc from inside the menu hands focus back to its button
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...menuRef.current!.querySelectorAll('button')], i = bs.indexOf(document.activeElement as HTMLButtonElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
  };
  // any choice closes the menu
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  const S = game.S, rules = Object.entries(S.over).map(([k, v]) => k + ' = ' + v);
  return (
    <div className="more" ref={boxRef}>
      <button type="button" ref={btnRef} aria-haspopup="menu" aria-expanded={open} aria-controls="moreMenu" aria-label="More tools" title="More tools" onClick={() => setOpen(!open)}>⋯</button>
      <div className="more-menu" id="moreMenu" role="menu" hidden={!open} ref={menuRef} onKeyDown={keys}>
        <p className="more-h" title={rules.join('\n')}>{game.scenario}</p>
        {/* no hover on a finger: the custom rules are listed instead */}
        {isTouch() && rules.length > 0 && <ul className="more-rules">{rules.map((r) => <li key={r}>{r}</li>)}</ul>}
        <button type="button" role="menuitemcheckbox" aria-checked={ui.overlay === 'flow'} onClick={pick(() => game.toggleOverlay('flow'))}>Flow charts<kbd>F</kbd></button>
        <button type="button" role="menuitem" onClick={pick(() => dispatch({ type: 'ModalOpened', modal: 'replay' }))}>Replay code</button>
        <button type="button" role="menuitem" onClick={pick(() => dispatch({ type: 'ModalOpened', modal: 'playtest' }))}>Playtest bots</button>
        <button type="button" role="menuitemcheckbox" aria-checked={ui.pixel} onClick={pick(() => dispatch({ type: 'PixelModeToggled' }))}>Pixel mode</button>
        <button type="button" role="menuitemcheckbox" aria-checked={ui.hint} onClick={pick(() => dispatch({ type: 'CameraHintToggled', on: !ui.hint }))}>Camera controls</button>
        <button type="button" role="menuitem" onClick={pick(() => game.showSplash())}>Title screen</button>
      </div>
    </div>
  );
}
