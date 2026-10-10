import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GameState } from '../engine';
import { fmtClock } from '../format';
import type { FlowMode } from '../ui';
import { useGame, useUi } from '../useGame';

// Flow: two charts. Who did what (an activity Gantt per worker), and the value chain (stock at every stage, or the
// same thing as a cumulative flow diagram), with beans and research as extra lanes.
const ACT_COLS: Record<string, string> = { till: '#3987e5', make: '#d95926', build: '#199e70', chore: '#c98500' };
const ACT_NAMES: Record<string, string> = { till: 'Till', make: 'Making', build: 'Building', chore: 'Chores' };
type Stage = [string, string, string];
type Line = [string, string, string, boolean];
const ORDER_STAGES: Stage[] = [['queue', 'Queuing to order', '#3987e5'], ['rail', 'On the rail', '#d95926'], ['making', 'Being made', '#199e70'], ['ready', 'Ready at pickup', '#c98500']];
const CUM_CURVES: [string, string][] = [['cArrived', 'Arrived'], ['cOrdered', 'Ordered'], ['cClaimed', 'Started'], ['cMade', 'Made'], ['cDone', 'Done']];
const BEAN_STAGES: Stage[] = [['hoppers', 'In hoppers', '#199e70'], ['store', 'In stock', '#3987e5'], ['door', 'At the back door', '#c98500']];
const BEAN_LINES: Line[] = [['onOrder', 'On order', '#d95926', true], ['grounds', 'Grounds in bins', '#d55181', false]];
const RES_STAGES: Stage[] = [['rDone', 'Complete', '#199e70'], ['rActive', 'In progress', '#d95926'], ['rAvailable', 'Not started', '#3987e5']];
const RANGES: [number, string][] = [[60, '1h'], [120, '2h'], [480, '8h'], [0, 'All']];

type Series = Record<string, number[]>;
function flowData(S: GameState, range: number): Series {
  const H = S.hist, n = H.t.length, from = range ? Math.max(0, n - range) : 0, pick = (k: string) => H[k].slice(from).map((v) => v || 0);
  const d: Series = { t: H.t.slice(from) };
  ['queue', 'rail', 'making', 'ready', 'onOrder', 'grounds', 'served', 'used', 'door', 'store', 'cArrived', 'cOrdered', 'cClaimed', 'cMade', 'cDone', 'rAvailable', 'rActive', 'rDone'].forEach((k) => { d[k] = pick(k); });
  d.hoppers = pick('beans');
  d.onhand = d.hoppers.map((v, i) => v + d.door[i] + d.store[i]);
  return d;
}
function niceMax(v: number) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
// geometry shared by every lane so they line up under the Gantt
const GW_ = 600, ML = 92, MR = 12;
const xOf = (i: number, n: number) => ML + (GW_ - ML - MR) * i / Math.max(1, n - 1);

export function Flow() {
  const { ui, dispatch } = useUi();
  const game = useGame();
  const S = game.S;
  const d = flowData(S, ui.flowRange), n = d.t.length, last = n - 1;
  const wip = n ? d.queue[last] + d.rail[last] + d.making[last] + d.ready[last] : 0;
  const hr = Math.min(60, last), thr = n > 1 ? (d.served[last] - d.served[last - hr]) * 60 / Math.max(1, hr) : 0;
  const use = n > 1 ? (d.used[last] - d.used[last - hr]) / Math.max(1, hr) : 0;
  const lasts = use > 0 ? Math.floor((n ? d.onhand[last] : 0) / use) : null;
  const stats: [string, string][] = [
    ['In the system now', wip + ' customers'], ['Served, last hour', thr.toFixed(0) + '/h'],
    ['Lead time', S.st.served ? (S.st.lead / 60).toFixed(1) + ' min' : '–'],
    ['Little’s Law', thr > 0 ? wip + ' ÷ ' + thr.toFixed(0) + '/h ≈ ' + (wip / (thr / 60)).toFixed(1) + ' min' : '–'],
    ['Beans last', lasts == null ? '–' : lasts >= 600 ? '10h+' : Math.floor(lasts / 60) + 'h ' + String(lasts % 60).padStart(2, '0') + 'm']
  ];
  const cum = ui.flowMode === 'cumulative';
  const mode = (m: FlowMode) => dispatch({ type: 'FlowModeChosen', mode: m });
  return (
    <section className="flow" aria-label="Flow over time">
      <header><h2>Flow</h2>
        <div className="seg" role="group" aria-label="Chart style">
          <button type="button" aria-pressed={!cum} onClick={() => mode('stock')}>Stock</button>
          <button type="button" aria-pressed={cum} onClick={() => mode('cumulative')}>Cumulative</button>
        </div>
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map(([r, label]) => <button key={r} type="button" aria-pressed={ui.flowRange === r} onClick={() => dispatch({ type: 'FlowRangeChosen', range: r })}>{label}</button>)}
        </div>
        <button type="button" aria-label="Close flow panel" onClick={() => game.setOverlay('flow', false)}>Close</button></header>
      <div className="flow-stats">{stats.map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div>
      <div className="flow-chart"><Gantt S={S} d={d} /></div>
      <div className="flow-chart" id="flowOrders"><Lane d={d} title="Value chain" label="Orders" sub={cum ? 'cumulative' : 'customers at each stage'} stages={ORDER_STAGES} cumulative={cum} curves={CUM_CURVES} height={130} /></div>
      <div className="flow-chart"><Lane d={d} label="Beans" sub="cups at each stage" stages={BEAN_STAGES} lines={BEAN_LINES} unit="cups" height={92} /></div>
      <div className="flow-chart"><Lane d={d} label="Research" sub="topics" stages={RES_STAGES} height={72} axis /></div>
    </section>
  );
}

// hover over a chart: a crosshair at the nearest minute, and a tip saying what was there. A finger taps or drags
// sideways along the chart instead, and the tip stays until the next touch elsewhere.
function useChartHover(n: number) {
  const [hover, setHover] = useState<{ i: number; px: number; py: number; left: number; top: number; touch: boolean } | null>(null);
  const area = useRef<Element | null>(null);
  const move = (e: PointerEvent<SVGRectElement>, height: number) => {
    area.current = e.currentTarget;
    const svg = e.currentTarget.ownerSVGElement!, r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * GW_ / r.width, py = (e.clientY - r.top) * height / r.height;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - ML) / ((GW_ - ML - MR) / Math.max(1, n - 1)))));
    const bx = svg.parentElement!.getBoundingClientRect();
    setHover({ i, px, py, left: Math.max(0, Math.min(e.clientX - bx.left + 12, bx.width - 160)), top: e.clientY - bx.top, touch: e.pointerType === 'touch' });
  };
  const touch = !!hover && hover.touch;
  useEffect(() => {
    if (!touch) return;
    const away = (e: Event) => { if (e.target !== area.current) setHover(null); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [touch]);
  const leave = (e: PointerEvent) => { if (e.pointerType !== 'touch') setHover(null); };
  const hit = (height: number) => {
    const at = (e: PointerEvent<SVGRectElement>) => move(e, height);
    return { onPointerDown: at, onPointerMove: at, onPointerLeave: leave };
  };
  return { hover, hit };
}
function ChartTip({ at, children }: { at: { left: number; top: number }; children: ReactNode }) {
  // above the pointer, inside the chart
  return <div className="ctip" style={{ left: at.left, top: Math.max(0, at.top - 8), transform: 'translateY(-100%)' }}>{children}</div>;
}
const TipRow = ({ name, col, v, unit }: { name: string; col?: string; v: number | string; unit?: string }) => (
  <span><span>{col && <i style={{ background: col }}></i>}{name}</span>{v}{unit ? ' ' + unit : ''}</span>
);

// ---------- lane chart: stacked stock, a cumulative flow diagram, or lines ----------
interface LaneProps {
  d: Series; title?: string; label: string; sub?: string; stages: Stage[]; lines?: Line[]; cumulative?: boolean;
  curves?: [string, string][]; height?: number; axis?: boolean; unit?: string;
}
function Lane(o: LaneProps) {
  const { d } = o, n = d.t.length, Hh = o.height || 120, top = 6, bot = o.axis ? 18 : 6;
  const { hover, hit } = useChartHover(n);
  if (n < 2) return <><h3>{o.title || o.label}</h3><p className="flow-empty">Fills in as the shop trades, one point per game minute.</p></>;
  const x = (i: number) => xOf(i, n);
  let sums: number[] = [], ymax: number, base0 = 0;
  const curves = o.curves || [];
  if (o.cumulative) {
    base0 = d[curves[curves.length - 1][0]][0];
    ymax = niceMax(Math.max(1, d[curves[0][0]][n - 1] - base0));
  } else {
    sums = d.t.map((_, i) => o.stages.reduce((a, [k]) => a + d[k][i], 0));
    ymax = niceMax(Math.max(1, ...sums, ...(o.lines || []).flatMap(([k]) => d[k])));
  }
  const y = (v: number) => top + (Hh - top - bot) * (1 - v / ymax);
  const pts = (vs: number[]) => vs.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1));
  const poly = (key: string, upper: number[], lower: number[], col: string, op?: number) =>
    <polygon key={key} points={pts(upper).concat(pts(lower).reverse()).join(' ')} fill={col} fillOpacity={op || 0.8} stroke="#121a24" strokeWidth="0.6" />;
  const shapes: ReactNode[] = [];
  if (o.cumulative) {
    // bands between successive curves: the gap between two lines is the stock at that stage
    const cs = curves.map(([k]) => d[k].map((v) => v - base0));
    shapes.push(poly('done', cs[cs.length - 1], cs[cs.length - 1].map(() => 0), '#4a5a6e', 0.55));
    for (let j = cs.length - 2; j >= 0; j--) shapes.push(poly('b' + j, cs[j], cs[j + 1], o.stages[j][2]));
    cs.forEach((c, j) => { if (j === 0 || j === cs.length - 1) shapes.push(<polyline key={'c' + j} fill="none" stroke={j ? '#e9e4d8' : '#aab6c4'} strokeWidth="1.2" points={pts(c).join(' ')} />); });
  } else {
    const base = new Array(n).fill(0);
    o.stages.slice().reverse().forEach(([k, , col]) => { const up = base.map((b, i) => b + d[k][i]); shapes.push(poly(k, up, base.slice(), col)); for (let i = 0; i < n; i++) base[i] = up[i]; });
    (o.lines || []).forEach(([k, , col, dash]) => {
      const p = pts(d[k]).join(' ');
      shapes.push(<polyline key={k + 'u'} fill="none" stroke="#121a24" strokeWidth="4" points={p} />, <polyline key={k} fill="none" stroke={col} strokeWidth="2" strokeDasharray={dash ? '5 3' : undefined} points={p} />);
    });
  }
  const tip = (i: number) => {
    if (o.cumulative) {
      const v = curves.map(([k]) => d[k][i]);
      return <><b>{fmtClock(d.t[i])}</b>{o.stages.map(([, name, col], j) => <TipRow key={name} name={name} col={col} v={v[j] - v[j + 1]} unit={o.unit} />)}
        <TipRow name="Arrived so far" v={v[0]} /><TipRow name="Done so far" v={v[v.length - 1]} /></>;
    }
    return <><b>{fmtClock(d.t[i])}</b>{o.stages.map(([k, name, col]) => <TipRow key={k} name={name} col={col} v={d[k][i]} unit={o.unit} />)}
      {o.stages.length > 1 && <TipRow name="Total" v={sums[i]} unit={o.unit} />}
      {(o.lines || []).map(([k, name, col]) => <TipRow key={k} name={name} col={col} v={d[k][i]} unit={o.unit} />)}</>;
  };
  return (
    <>
      {o.title && <h3>{o.title}</h3>}
      <div className="legend">
        {o.stages.map(([, name, col]) => <span key={name}><i style={{ background: col }}></i>{name}</span>)}
        {o.cumulative && <span><i style={{ background: '#4a5a6e' }}></i>Done (served or lost)</span>}
        {(o.lines || []).map(([, name, col, dash]) => <span key={name}><i style={{ background: col, color: col }} className={dash ? 'dash' : undefined}></i>{name}</span>)}
      </div>
      <svg viewBox={'0 0 ' + GW_ + ' ' + Hh} role="img" aria-label={o.label}>
        {[0, 1, 2].map((k) => { const v = ymax * k / 2; return <g key={k}><line x1={ML} x2={GW_ - MR} y1={y(v)} y2={y(v)} stroke="#2a3a4e" /><text x={ML - 5} y={y(v) + 3.5} textAnchor="end" fill="#aab6c4" fontSize="10">{Math.round(v)}</text></g>; })}
        {shapes}
        {o.axis && [0, 1, 2, 3, 4, 5].map((k) => { const i = Math.round((n - 1) * k / 5); return <text key={k} x={x(i)} y={Hh - 4} textAnchor={k === 0 ? 'start' : k === 5 ? 'end' : 'middle'} fill="#aab6c4" fontSize="10">{fmtClock(d.t[i])}</text>; })}
        <text x="4" y={top + 10} fill="#e9e4d8" fontSize="11" fontWeight="600">{o.label}</text>
        {o.sub && <text x="4" y={top + 23} fill="#aab6c4" fontSize="10">{o.sub}</text>}
        {hover && <line x1={xOf(hover.i, n)} x2={xOf(hover.i, n)} y1={top} y2={Hh - bot} stroke="#aab6c4" />}
        <rect x={ML} y={top} width={GW_ - ML - MR} height={Hh - top - bot} fill="transparent" {...hit(Hh)} />
      </svg>
      {hover && <ChartTip at={hover}>{tip(hover.i)}</ChartTip>}
    </>
  );
}

// ---------- Gantt: what each worker spent their time on ----------
const ACT_TEXT = (code: string) => {
  if (code === 'idle') return 'Idle';
  const cat = code.replace(/[~!]/, ''), name = ACT_NAMES[cat];
  return name + (code.endsWith('~') ? ', walking' : code.endsWith('!') ? ', held up' : '');
};
const MK: Record<string, string> = { built: '#199e70', research: '#e9e4d8', delivery: '#c98500', hire: '#3987e5' };
function Gantt({ S, d }: { S: GameState; d: Series }) {
  const n = d.t.length;
  const { hover, hit } = useChartHover(n);
  if (n < 2) return <><h3>Who did what</h3><p className="flow-empty">Fills in as the shop trades.</p></>;
  const t0 = d.t[0] - 60, t1 = d.t[n - 1], cols = GW_ - ML - MR, span = Math.max(1, t1 - t0);
  const rows = Object.entries(S.acts).filter(([, a]) => a.segs.length && a.segs[a.segs.length - 1][2] >= t0);
  const rowH = 16, gap = 5, top = 4, axis = 16, Hh = top + rows.length * (rowH + gap) + axis;
  const colData = rows.map(([id, a], r) => {
    // bucket the activity log into one column per pixel; each column shows what took most of that slice
    const y0 = top + r * (rowH + gap), buckets: Record<string, number>[] = Array.from({ length: cols }, () => ({}));
    for (const [code, f, to] of a.segs) {
      if (to < t0) continue;
      const a0 = Math.max(f, t0), a1 = Math.min(to + 1, t1);
      for (let c = Math.floor((a0 - t0) / span * cols); c <= Math.min(cols - 1, Math.floor((a1 - t0) / span * cols)); c++) {
        const cs = t0 + span * c / cols, ce = t0 + span * (c + 1) / cols, ov = Math.min(ce, a1) - Math.max(cs, a0);
        if (ov > 0) buckets[c][code] = (buckets[c][code] || 0) + ov;
      }
    }
    const tot: Record<string, number> = {}; let busy = 0, all = 0;
    const codes = buckets.map((b) => { let best: string | null = null, bv = 0; for (const k in b) { tot[k] = (tot[k] || 0) + b[k]; all += b[k]; if (b[k] > bv) { bv = b[k]; best = k; } } return best; });
    for (const k in tot) if (k !== 'idle' && !k.endsWith('~') && !k.endsWith('!')) busy += tot[k];
    const runs: { c: number; e: number; code: string }[] = [];
    for (let c = 0; c < cols;) {
      const code = codes[c]; let e = c; while (e < cols && codes[e] === code) e++;
      if (code && code !== 'idle') runs.push({ c, e, code });
      c = e;
    }
    return { id, name: a.name, left: a.left, codes, y0, runs, busy: Math.round(100 * busy / Math.max(1, all)) };
  });
  const marks = S.marks.filter((m) => m.t >= t0 && m.t <= t1);
  const tip = () => {
    if (!hover) return null;
    const row = colData.find((c) => hover.py >= c.y0 && hover.py <= c.y0 + rowH); if (!row) return null;
    const c = Math.max(0, Math.min(cols - 1, Math.round(hover.px - ML))), t = t0 + span * c / cols;
    const near = S.marks.filter((m) => Math.abs(m.t - t) < span / cols * 4);
    return <><b>{row.name} · {fmtClock(t)}</b><span><span>{ACT_TEXT(row.codes[c] || 'idle')}</span></span>{near.map((m, i) => <TipRow key={i} name={m.text} v={fmtClock(m.t)} />)}</>;
  };
  const tipBody = tip();
  return (
    <>
      <h3>Who did what</h3>
      <div className="legend">
        {Object.keys(ACT_COLS).map((k) => <span key={k}><i style={{ background: ACT_COLS[k] }}></i>{ACT_NAMES[k]}</span>)}
        <span className="key">solid = working · faint = walking · striped = held up · blank = idle · % = time working</span>
      </div>
      <svg viewBox={'0 0 ' + GW_ + ' ' + Hh} role="img" aria-label="Activity of each worker over time">
        <defs>
          {Object.entries(ACT_COLS).map(([k, c]) => (
            <pattern key={k} id={'hatch-' + k} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill={c} fillOpacity="0.25" /><line x1="0" y1="0" x2="0" y2="4" stroke={c} strokeWidth="2" />
            </pattern>
          ))}
        </defs>
        {colData.map((row) => (
          <g key={row.id}>
            <rect x={ML} y={row.y0} width={cols} height={rowH} fill="#18222e" />
            {row.runs.map(({ c, e, code }) => {
              const cat = code.replace(/[~!]/, '');
              return <rect key={c} x={ML + c} y={row.y0} width={e - c} height={rowH} fill={code.endsWith('!') ? 'url(#hatch-' + cat + ')' : ACT_COLS[cat]} fillOpacity={code.endsWith('~') ? 0.45 : undefined} />;
            })}
            <text x="4" y={row.y0 + 12} fill="#e9e4d8" fontSize="11">{row.name}{row.left ? ' (left)' : ''}</text>
            <text x={ML - 6} y={row.y0 + 12} textAnchor="end" fill="#aab6c4" fontSize="10">{row.busy}%</text>
          </g>
        ))}
        {/* marks: builds, deliveries, hires, research */}
        {marks.map((m, i) => {
          const mx = ML + (m.t - t0) / span * cols, label = fmtClock(m.t) + ' ' + m.text;
          return (
            <g key={i}>
              <line x1={mx} x2={mx} y1={top} y2={Hh - axis} stroke={MK[m.kind]} strokeOpacity="0.7" strokeDasharray="2 2"><title>{label}</title></line>
              <path d={'M' + (mx - 4) + ',' + (Hh - axis + 1) + ' L' + (mx + 4) + ',' + (Hh - axis + 1) + ' L' + mx + ',' + (Hh - axis - 5) + 'Z'} fill={MK[m.kind]}><title>{label}</title></path>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5].map((k) => <text key={k} x={ML + cols * k / 5} y={Hh - 3} textAnchor={k === 0 ? 'start' : k === 5 ? 'end' : 'middle'} fill="#aab6c4" fontSize="10">{fmtClock(t0 + span * k / 5)}</text>)}
        {hover && <line x1={xOf(hover.i, n)} x2={xOf(hover.i, n)} y1={top} y2={Hh - axis} stroke="#aab6c4" />}
        <rect x={ML} y={top} width={cols} height={Hh - axis - top} fill="transparent" {...hit(Hh)} />
      </svg>
      {hover && tipBody && <ChartTip at={hover}>{tipBody}</ChartTip>}
    </>
  );
}
