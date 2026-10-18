// Live charts for the console. Data comes from engine decisions and the drift accumulator's own history.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { bandOf, DRIFT_K, type Band, type Decision } from '@swaroop/engine';
import { BAND_EDGES, BAND_LABEL, CAUSE_LABEL, fmtDateTime } from '../live/labels';
import { buildUp } from '../live/scenarios';
import { isAlert } from '../live/view';
import { BandChip, bandClass } from './ui';

function useWidth(fallback: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** The last N calls of one agent as bars, height = score, colour = band. Empty slots stay as a baseline. */
export function Sparkline({ calls, slots = 24 }: { calls: { id: string; score: number; band: Band }[]; slots?: number }) {
  const bw = 3, gap = 2, h = 26;
  const pad = slots - calls.length;
  return (
    <svg className="spark" width={slots * (bw + gap)} height={h} role="img" aria-label={`Last ${calls.length} call scores: ${calls.map(c => c.score).join(', ')}`}>
      <line x1={0} x2={slots * (bw + gap)} y1={h - 0.5} y2={h - 0.5} className="spark-base" />
      {calls.map((c, i) => {
        const bh = Math.max(2, (c.score / 100) * (h - 2));
        return (
          <rect key={c.id} x={(pad + i) * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1} className={`spark-bar sb-${bandClass(c.band)}`}>
            <title>{`${c.id} · ${c.score} ${BAND_LABEL[c.band]}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const TL_H = 200, TL_TOP = 10, TL_BOTTOM = 22;

/** Every decision for one agent, in order. Dashed lines are the band edges; hairlines split sessions. */
export function ScoreTimeline({ decisions }: { decisions: Decision[] }) {
  const [ref, w] = useWidth(800);
  const [hover, setHover] = useState<number | null>(null);
  if (!decisions.length) return <p className="muted chart-empty">No calls yet.</p>;
  const labelW = 96;
  const plotW = w - labelW;
  const n = decisions.length;
  const step = plotW / n;
  const bw = Math.max(2, Math.min(10, step - 2));
  const y = (s: number) => TL_TOP + (1 - s / 100) * (TL_H - TL_TOP - TL_BOTTOM);
  const base = TL_H - TL_BOTTOM;
  const hd = hover === null ? null : decisions[hover]!;
  const x = (i: number) => i * step + step / 2;

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={TL_H} role="img" aria-label={`${n} calls; highest score ${Math.max(...decisions.map(d => d.score))}`}>
        {decisions.map((d, i) => i > 0 && d.call.sessionId !== decisions[i - 1]!.call.sessionId && (
          <line key={`s${i}`} x1={i * step} x2={i * step} y1={TL_TOP} y2={base} className="tl-session" />
        ))}
        {BAND_EDGES.map(([t, b]) => (
          <g key={t}>
            <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} className={`tl-edge te-${bandClass(b)}`} />
            <text x={plotW + 8} y={y(t)} dominantBaseline="central" className="tl-label">{t} {BAND_LABEL[b]}</text>
          </g>
        ))}
        <line x1={0} x2={plotW} y1={base} y2={base} className="tl-axis" />
        {decisions.map((d, i) => {
          const top = y(Math.max(d.score, 1.5));
          return <rect key={d.id} x={x(i) - bw / 2} y={top} width={bw} height={base - top} rx={Math.min(2, bw / 2)} className={`tl-bar sb-${bandClass(d.band)} ${hover === i ? 'is-hover' : ''}`} />;
        })}
        {plotW >= 360 && <text x={0} y={TL_H - 6} className="tl-label">{fmtDateTime(decisions[0]!.call.ts)}</text>}
        <text x={plotW} y={TL_H - 6} textAnchor="end" className="tl-label">{fmtDateTime(decisions[n - 1]!.call.ts)}</text>
        {decisions.map((d, i) => (
          <rect key={`h${d.id}`} x={i * step} y={0} width={step} height={TL_H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hd && (
        <div className="tip" data-side={x(hover!) > plotW / 2 ? 'left' : 'right'} style={{ left: x(hover!), top: Math.max(4, y(hd.score) - 40) }}>
          <b className="mono">{hd.call.tool}</b>
          <span><b className="num">{hd.score}</b> <BandChip band={hd.band} /></span>
          <span className="mono">{hd.id} · {fmtDateTime(hd.call.ts)}</span>
          {isAlert(hd) && <Link to={`/app/alerts/${hd.id}`} className="tip-link">Open alert</Link>}
        </div>
      )}
    </div>
  );
}

const AC_H = 190, AC_TOP = 14, AC_BOTTOM = 22;

/** Drift accumulator S after each session (the value that was compared with H), with the alarm line. */
export function AccumulatorChart({ history, H }: { history: { S: number; x: number; alarm: boolean }[]; H: number }) {
  const [ref, w] = useWidth(800);
  const [hover, setHover] = useState<number | null>(null);
  if (!history.length) return <p className="muted chart-empty">No session has ended since the snapshot was frozen.</p>;
  const n = history.length;
  const yMax = Math.max(H * 1.5, ...history.map(h => h.S * 1.1));
  const padX = 14;
  const x = (i: number) => (n === 1 ? w / 2 : padX + (i * (w - 2 * padX)) / (n - 1));
  const y = (s: number) => AC_TOP + (1 - s / yMax) * (AC_H - AC_TOP - AC_BOTTOM);
  const base = AC_H - AC_BOTTOM;
  const line = history.map((h, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(h.S)}`).join(' ');
  const hv = hover === null ? null : history[hover]!;

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={AC_H} role="img" aria-label={`Drift accumulator over ${n} sessions; ${history.filter(h => h.alarm).length} alarm(s)`}>
        <line x1={0} x2={w} y1={y(H)} y2={y(H)} className="ac-h" />
        <text x={4} y={y(H) - 7} className="tl-label">Alarm line H = {H}</text>
        <line x1={0} x2={w} y1={base} y2={base} className="tl-axis" />
        {n > 1 && <path d={`${line} L ${x(n - 1)} ${base} L ${x(0)} ${base} Z`} className="ac-area" />}
        {n > 1 && <path d={line} className="ac-line" />}
        {history.map((h, i) => (
          <circle key={i} cx={x(i)} cy={y(h.S)} r={h.alarm ? 5 : hover === i ? 4.5 : 3} className={h.alarm ? 'ac-alarm' : 'ac-dot'} />
        ))}
        {history.map((h, i) => h.alarm && <text key={`a${i}`} x={x(i)} y={y(h.S) - 10} textAnchor="middle" className="ac-alarm-label">alarm</text>)}
        <text x={x(0)} y={AC_H - 6} textAnchor={n === 1 ? 'middle' : 'start'} className="tl-label">session 1</text>
        {n > 1 && <text x={x(n - 1)} y={AC_H - 6} textAnchor="end" className="tl-label">session {n}</text>}
        {history.map((_, i) => (
          <rect key={`h${i}`} x={x(i) - w / n / 2} y={0} width={w / n} height={AC_H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hv && (
        <div className="tip" data-side={x(hover!) > w / 2 ? 'left' : 'right'} style={{ left: x(hover!), top: Math.max(4, y(hv.S) - 34) }}>
          <b>Session {hover! + 1}</b>
          <span>Drift <b className="num">{hv.S.toFixed(2)}</b> of {H}{hv.alarm ? ': alarm, then reset to 0' : ''}</span>
          <span>This session added <b className="num">{hv.x.toFixed(2)}</b> (minus k = {DRIFT_K})</span>
        </div>
      )}
    </div>
  );
}

/** How the noisy-OR total is built: one row per factor, each bar running from the score before it to the score after it. */
export function BuildUpChart({ decision }: { decision: Decision }) {
  const rows = buildUp(decision);
  if (!rows.length) return <p className="small muted">No factor fired, so there is nothing to add up.</p>;
  let prev = 0;
  return (
    <div className="bu">
      <div className="bu-plot">
        {BAND_EDGES.map(([t, b]) => <i key={t} className={`bu-edge te-${bandClass(b)}`} style={{ left: `calc(112px + (100% - 160px) * ${t / 100})` }} aria-hidden />)}
        <ol>
          {rows.map(r => {
            const from = prev, to = r.cumulative;
            prev = to;
            return (
              <li key={r.factor} className="bu-row">
                <span className="bu-name mono"><b>{r.factor}</b> {CAUSE_LABEL[r.factor]}</span>
                <span className="bu-track">
                  <span className="bu-carry" style={{ width: `${from}%` }} />
                  <span className={`bu-seg sb-${bandClass(bandOf(Math.round(to)))}`} style={{ left: `${from}%`, width: `${Math.max(0.6, to - from)}%` }}
                    title={`${r.factor}: weighted ${r.weighted.toFixed(2)}, score ${from.toFixed(1)} → ${to.toFixed(1)}`} />
                </span>
                <span className="num bu-num">+{(to - from).toFixed(1)}</span>
              </li>
            );
          })}
        </ol>
        <div className="bu-axis" aria-hidden><span>0</span>{BAND_EDGES.map(([t]) => <span key={t} style={{ left: `${t}%` }}>{t}</span>)}</div>
      </div>
      <p className="small muted bu-foot">
        {decision.rootCause === 'TRIPWIRE' ? 'A decoy was touched: the score is set to 100.'
          : <>Each factor adds its weight times what is left below 100{decision.multiplier < 1 ? `, scaled by ×${decision.multiplier.toFixed(2)} for data sensitivity` : ''}. Total <b className="num">{decision.score}</b>.</>}
      </p>
    </div>
  );
}

const MC_H = 170, MC_TOP = 12, MC_BOTTOM = 24;

/** The same script in both modes: enforced scores (solid) against shadow scores (dashed). One axis, 0–100. */
export function ModeCompareChart({ enforce, shadow, cursor, visible, onPick }: { enforce: Decision[]; shadow: Decision[]; cursor?: number; visible?: number; onPick?: (i: number) => void }) {
  const [ref, w] = useWidth(600);
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.min(enforce.length, shadow.length);
  if (!n) return null;
  const shown = Math.max(1, Math.min(n, visible ?? n));     // the replay only reveals steps it has played
  const padL = 10, padR = 96;
  const plotW = w - padL - padR;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (s: number) => MC_TOP + (1 - s / 100) * (MC_H - MC_TOP - MC_BOTTOM);
  const path = (ds: Decision[]) => ds.slice(0, shown).map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.score)}`).join(' ');
  const differ = enforce.slice(0, n).some((d, i) => d.score !== shadow[i]!.score);
  const hi = hover ?? null;

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <ul className="mc-legend">
        <li><i className="mc-key mc-key-enf" />Enforce</li>
        <li><i className="mc-key mc-key-sh" />Shadow{differ ? '' : ' (same scores)'}</li>
      </ul>
      <svg width={w} height={MC_H} role="img" aria-label={`Scores per step. Enforce: ${enforce.slice(0, n).map(d => d.score).join(', ')}. Shadow: ${shadow.slice(0, n).map(d => d.score).join(', ')}.`}>
        {BAND_EDGES.map(([t, b]) => (
          <g key={t}>
            <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} className={`tl-edge te-${bandClass(b)}`} />
            <text x={padL + plotW + 8} y={y(t)} dominantBaseline="central" className="tl-label">{t} {BAND_LABEL[b]}</text>
          </g>
        ))}
        <line x1={padL} x2={padL + plotW} y1={y(0)} y2={y(0)} className="tl-axis" />
        {cursor !== undefined && cursor < n && <line x1={x(cursor)} x2={x(cursor)} y1={MC_TOP} y2={y(0)} className="mc-cursor" />}
        <path d={path(shadow)} className="mc-sh" />
        <path d={path(enforce)} className="mc-enf" />
        {shadow.slice(0, shown).map((d, i) => d.score !== enforce[i]!.score && <circle key={`s${i}`} cx={x(i)} cy={y(d.score)} r={3.5} className="mc-dot-sh" />)}
        {enforce.slice(0, shown).map((d, i) => <circle key={`e${i}`} cx={x(i)} cy={y(d.score)} r={hi === i ? 5 : 4} className={`mc-dot sb-${bandClass(d.band)}`} />)}
        {enforce.slice(0, n).map((_, i) => <text key={`t${i}`} x={x(i)} y={MC_H - 6} textAnchor="middle" className="tl-label">{i + 1}</text>)}
        {enforce.slice(0, shown).map((_, i) => (
          <rect key={`h${i}`} x={x(i) - plotW / Math.max(1, n - 1) / 2} y={0} width={plotW / Math.max(1, n - 1)} height={MC_H} fill="transparent"
            onMouseEnter={() => setHover(i)} onClick={() => onPick?.(i)} style={{ cursor: onPick ? 'pointer' : undefined }} />
        ))}
      </svg>
      {hi !== null && (
        <div className="tip" data-side={x(hi) > w / 2 ? 'left' : 'right'} style={{ left: x(hi), top: 6 }}>
          <b>Step {hi + 1} · <span className="mono">{enforce[hi]!.call.tool}</span></b>
          <span>Enforce <b className="num">{enforce[hi]!.score}</b> <BandChip band={enforce[hi]!.band} /></span>
          <span>Shadow <b className="num">{shadow[hi]!.score}</b> <BandChip band={shadow[hi]!.band} prefix="Would " /></span>
        </div>
      )}
    </div>
  );
}
