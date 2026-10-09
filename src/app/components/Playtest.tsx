import { useRef, useState, type PointerEvent } from 'react';
import { Bot, Sim, type TrialResult } from '../engine';
import { money } from '../format';
import { useGame, useUi } from '../useGame';

const SCOL: Record<string, string> = { solo: '#3987e5', steady: '#d95926', rush: '#199e70' };
const START = Sim.DEFAULT_RULES.startCash;
const med = (a: number[]) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2; };

interface Row {
  k: string; name: string; rs: TrialResult[]; final: number; lo: number; hi: number; min: number; lastHour: number;
  served: number; walked: number; sat: number; staff: number; esp: number; broke: number; series: number[];
}
interface Results { rows: Row[]; hours: number; seeds: number }

function verdict(r: Row): [string, string] {
  if (r.lastHour > 0 && r.final >= START) return ['good', 'Growing'];
  if (r.lastHour > 0) return ['warn', 'Paying back'];
  return ['bad', 'Losing money'];
}
function summarise(out: Record<string, TrialResult[]>): Row[] {
  return Object.entries(out).map(([k, rs]) => ({
    k, name: Bot.STRATS[k].name, rs,
    final: med(rs.map((r) => r.finalCash)), lo: Math.min(...rs.map((r) => r.finalCash)), hi: Math.max(...rs.map((r) => r.finalCash)),
    min: med(rs.map((r) => r.minCash)), lastHour: med(rs.map((r) => r.lastHour)), served: med(rs.map((r) => r.served)),
    walked: med(rs.map((r) => r.abandoned / Math.max(1, r.arrived))), sat: med(rs.map((r) => r.sat)), staff: med(rs.map((r) => r.workers)),
    esp: rs.filter((r) => r.items.includes('espresso')).length, broke: rs.filter((r) => r.minCash < 0).length,
    series: rs[0].cash.map((_, j) => med(rs.map((r) => r.cash[j])))
  }));
}

function Seg({ label, values, value, unit, onPick }: { label: string; values: number[]; value: number; unit: string; onPick: (v: number) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {values.map((v) => <button key={v} type="button" aria-pressed={v === value} onClick={() => onPick(v)}>{v}{unit}</button>)}
    </div>
  );
}

// Bots play the game with the same actions a person has; many games at once show whether a strategy can make money
export function PlaytestModal() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  const [chosen, setChosen] = useState(() => new Set(Object.keys(Bot.STRATS)));
  const [seeds, setSeeds] = useState(8);
  const [hours, setHours] = useState(8);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const runRef = useRef(0);

  const run = () => {
    if (progress) return;
    const keys = Object.keys(Bot.STRATS).filter((k) => chosen.has(k));
    const jobs: [string, number][] = []; keys.forEach((k) => { for (let s = 1; s <= seeds; s++) jobs.push([k, s]); });
    const out: Record<string, TrialResult[]> = {}; keys.forEach((k) => { out[k] = []; });
    const id = ++runRef.current, h = hours, n = seeds; let i = 0;
    setProgress({ done: 0, of: jobs.length });
    // a slice of games at a time, so the page stays responsive
    const next = () => {
      if (id !== runRef.current) return;
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 40) { const [k, s] = jobs[i++]; out[k].push(Bot.trial(k, s, h)); }
      if (i < jobs.length) { setProgress({ done: i, of: jobs.length }); setTimeout(next, 0); return; }
      setProgress(null);
      setResults({ rows: summarise(out), hours: h, seeds: n });
    };
    next();
  };
  const toggle = (k: string, on: boolean) => { const c = new Set(chosen); if (on) c.add(k); else c.delete(k); setChosen(c); };

  return (
    <div className="modal" hidden={ui.modal !== 'playtest'} role="dialog" aria-modal="true" aria-labelledby="playTitle">
      <div className="sheet wide">
        <div className="sheet-head"><h2 id="playTitle">Playtest</h2><button type="button" aria-label="Close playtest" onClick={() => dispatch({ type: 'ModalClosed', resume: true })}>Close</button></div>
        <p>Bots play the game with the same actions you have. Run many games at once to see whether a strategy can make money, or watch one play.</p>
        <div className="strats">
          {Object.entries(Bot.STRATS).map(([k, s]) => (
            <div className="strat" key={k}>
              <header><i className="sw" style={{ background: SCOL[k] }}></i><b>{s.name}</b></header>
              <p>{s.blurb}</p>
              <div className="row">
                <label><input type="checkbox" checked={chosen.has(k)} onChange={(e) => toggle(k, e.target.checked)} /> Include</label>
                <button type="button" onClick={() => game.startBot(k)}>Watch it play</button>
              </div>
            </div>
          ))}
        </div>
        <div className="row pt-controls">
          <span className="pt-label">Games each</span>
          <Seg label="Games per strategy" values={[4, 8, 16]} value={seeds} unit="" onPick={setSeeds} />
          <span className="pt-label">Length</span>
          <Seg label="Game length" values={[2, 4, 8, 20]} value={hours} unit="h" onPick={setHours} />
          <button type="button" className="primary" disabled={!chosen.size || !!progress} onClick={run}>Run playtest</button>
          {progress && <span className="pt-progress"><i><s style={{ width: (100 * progress.done / progress.of) + '%' }}></s></i><span>{progress.done} of {progress.of} games</span></span>}
        </div>
        <div className="pt-results">{results && <PlaytestResults {...results} />}</div>
      </div>
    </div>
  );
}

function PlaytestResults({ rows, hours, seeds }: Results) {
  const game = useGame();
  // plain-language findings
  const best = rows.slice().sort((a, b) => b.final - a.final)[0];
  const grow = rows.filter((r) => verdict(r)[1] === 'Growing');
  const noEsp = rows.filter((r) => !r.esp);
  const lines: string[] = [];
  lines.push(grow.length ? grow.map((r) => r.name).join(' and ') + ' ended above the £600 starting cash and was still earning.' :
    'No strategy got back above the £600 starting cash in ' + hours + ' game hours.');
  lines.push('Best: ' + best.name + ', ' + money(best.final) + ' typical final cash, earning ' + money(best.lastHour) + ' in the last hour.');
  if (noEsp.length === rows.length) lines.push('No bot could afford espresso in any game.');
  else if (noEsp.length) lines.push(noEsp.map((r) => r.name).join(' and ') + ' never afforded espresso.');
  const broke = rows.filter((r) => r.broke);
  if (broke.length) lines.push(broke.map((r) => r.name + ' went into debt in ' + r.broke + ' of ' + r.rs.length).join('; ') + ' games.');
  return (
    <>
      <p className="finding">{lines.join(' ')}</p>
      <div className="chartbox">
        <h3>Cash over {hours} game hours · typical of {seeds} games</h3>
        <div className="legend">
          {rows.map((r) => <span key={r.k}><i style={{ background: SCOL[r.k] }}></i>{r.name}</span>)}
          <span><i className="dash"></i>Starting cash</span>
        </div>
        <CashChart rows={rows} hours={hours} />
      </div>
      <div className="tablewrap">
        <table className="pt">
          <thead><tr><th>Strategy</th><th>Final cash</th><th>Lowest</th><th>Last hour</th><th>Served</th><th>Walked out</th><th>Satisfaction</th><th>Staff</th><th>Espresso</th><th>Verdict</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [cls, txt] = verdict(r);
              return (
                <tr key={r.k}>
                  <td><i className="sw" style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, marginRight: 6, verticalAlign: 'middle', background: SCOL[r.k] }}></i>{r.name}</td>
                  <td className={r.final < 0 ? 'neg' : undefined}>{money(r.final)}<small>{money(r.lo)} to {money(r.hi)}</small></td>
                  <td className={r.min < 0 ? 'neg' : undefined}>{money(r.min)}</td>
                  <td className={r.lastHour < 0 ? 'neg' : undefined}>{(r.lastHour >= 0 ? '+' : '') + money(r.lastHour)}/h</td>
                  <td>{Math.round(r.served)}</td><td>{Math.round(r.walked * 100)}%</td><td>{Math.round(r.sat * 100)}%</td><td>{r.staff}</td>
                  <td>{r.esp} of {r.rs.length}</td><td><span className={'pill ' + cls}>{txt}</span></td>
                  <td><button type="button" onClick={() => game.startBot(r.k)}>Watch</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CashChart({ rows, hours }: { rows: Row[]; hours: number }) {
  const [hover, setHover] = useState<{ j: number; left: number; top: number } | null>(null);
  const W = 640, H = 240, m = { l: 52, r: 64, t: 10, b: 26 };
  const n = rows[0].series.length, xs = (j: number) => m.l + (W - m.l - m.r) * (j + 1) / n;
  let lo = Math.min(0, ...rows.flatMap((r) => r.series)), hi = Math.max(START, ...rows.flatMap((r) => r.series));
  const span = hi - lo, step = [5000, 10000, 20000, 25000, 50000, 100000].find((s) => span / s <= 6) || 200000;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const ys = (v: number) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const grid: number[] = []; for (let v = lo; v <= hi + 1; v += step) grid.push(v);
  const hStep = hours <= 4 ? 1 : hours <= 8 ? 2 : 5;
  const hourMarks: number[] = []; for (let h = 0; h <= hours; h += hStep) hourMarks.push(h);
  const pts = (r: Row) => [[m.l, ys(START)]].concat(r.series.map((v, j) => [xs(j), ys(v)])).map((p) => p.map((q) => q.toFixed(1)).join(',')).join(' ');
  // direct labels at the line ends, nudged apart
  const ends = rows.map((r) => ({ r, y: ys(r.series[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
  const move = (e: PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!, r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width;
    const j = Math.max(0, Math.min(n - 1, Math.round((x - m.l) / ((W - m.l - m.r) / n)) - 1));
    // the tip sits in the chart box, kept inside its right edge
    const bx = svg.parentElement!.getBoundingClientRect();
    setHover({ j, left: Math.min(e.clientX - bx.left + 12, bx.width - 136), top: e.clientY - bx.top + 12 });
  };
  const mins = hover ? (hover.j + 1) * 10 : 0;
  return (
    <>
      <svg viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Typical cash over time for each strategy; the table below has the numbers">
        {grid.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke={v === 0 ? '#aab6c4' : '#2a3a4e'} strokeWidth="1" />
            <text x={m.l - 6} y={ys(v) + 4} textAnchor="end" fill="#aab6c4" fontSize="11">{money(v)}</text>
          </g>
        ))}
        {hourMarks.map((h) => <text key={h} x={m.l + (W - m.l - m.r) * h / hours} y={H - 6} textAnchor="middle" fill="#aab6c4" fontSize="11">{h}h</text>)}
        <line x1={m.l} x2={W - m.r} y1={ys(START)} y2={ys(START)} stroke="#aab6c4" strokeWidth="1.5" strokeDasharray="4 3" />
        {rows.map((r) => <polyline key={r.k} fill="none" stroke={SCOL[r.k]} strokeWidth="2" strokeLinejoin="round" points={pts(r)} />)}
        {ends.map((e) => (
          <g key={e.r.k}>
            <circle cx={xs(n - 1)} cy={ys(e.r.series[n - 1])} r="3.5" fill={SCOL[e.r.k]} stroke="#121a24" strokeWidth="2" />
            <text x={xs(n - 1) + 8} y={e.y + 4} fill="#e9e4d8" fontSize="11">{e.r.name}</text>
          </g>
        ))}
        {hover && <line x1={xs(hover.j)} x2={xs(hover.j)} y1={m.t} y2={H - m.b} stroke="#aab6c4" strokeWidth="1" />}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="ctip" style={{ left: hover.left, top: hover.top }}>
          <b>{Math.floor(mins / 60)}h {String(mins % 60).padStart(2, '0')}m</b>
          {rows.slice().sort((a, b) => b.series[hover.j] - a.series[hover.j]).map((q) => (
            <span key={q.k}><span><i style={{ background: SCOL[q.k] }}></i>{q.name}</span>{money(q.series[hover.j])}</span>
          ))}
        </div>
      )}
    </>
  );
}
