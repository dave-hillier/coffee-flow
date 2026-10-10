import { useEffect, useRef, useState } from 'react';
import { Sim } from '../engine';
import { isTouch } from '../touch';
import { useGame, useUi } from '../useGame';

// Every decision is recorded against game time, so a code rebuilds a run exactly
export function ReplayModal() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  // this game's code as it was when the sheet opened
  const [code] = useState(() => Sim.encode(game.S));
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [restartArmed, setRestartArmed] = useState(false);
  const outRef = useRef<HTMLTextAreaElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const pasting = ui.pasting;
  useEffect(() => { (pasting ? inRef.current : copyRef.current)?.focus(); }, [pasting]);
  // a second click within four seconds confirms the restart
  useEffect(() => {
    if (!restartArmed) return;
    const t = setTimeout(() => setRestartArmed(false), 4000);
    return () => clearTimeout(t);
  }, [restartArmed]);
  const close = () => dispatch({ type: 'ModalClosed' });
  const copy = () => {
    const fallback = () => { outRef.current?.focus(); outRef.current?.select(); setCopyMsg(isTouch() ? 'Selected. Use Copy in the menu that comes up.' : 'Selected. Press Ctrl+C or Cmd+C to copy.'); };
    try { navigator.clipboard.writeText(code).then(() => setCopyMsg('Copied.'), fallback); } catch (e) { fallback(); }
  };
  const load = () => { const e = game.loadCode(paste || code); setErr(e || ''); };
  const restart = () => { if (restartArmed) { setRestartArmed(false); game.restart(); } else setRestartArmed(true); };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div className="sheet">
        <h2 id="modalTitle">Replay</h2>
        <p>Every decision is recorded against game time. Anyone with this code rebuilds your run exactly, from the same seed and rules, and can watch it at any speed. A scenario code from the headless explorer has rules but no decisions: loading it starts a fresh game for you to play.</p>
        <label htmlFor="codeOut">Your run so far</label>
        <textarea id="codeOut" rows={3} readOnly value={code} ref={outRef} />
        <div className="row"><button type="button" ref={copyRef} onClick={copy}>Copy code</button><span className="help">{copyMsg}</span></div>
        <label htmlFor="codeIn">Watch a run or load a scenario</label>
        <textarea id="codeIn" rows={3} placeholder="Paste a replay or scenario code (starts with CF1-)" value={paste} onChange={(e) => setPaste(e.target.value)} ref={inRef} />
        <p className="err">{err}</p>
        <div className="row">
          <button type="button" onClick={load}>Load code</button>
          <button type="button" className="danger" onClick={restart}>{restartArmed ? (isTouch() ? 'Tap' : 'Click') + ' again to restart' : 'Start a new game'}</button>
          <button type="button" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
