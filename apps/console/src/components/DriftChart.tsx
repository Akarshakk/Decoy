import { useLayoutEffect, useRef, useState } from 'react';
import { DRIFT_D6, DRIFT_H } from '../data/fixtures';
import { BandChip } from './ui';

// `end` right-aligns a note against its guide so neighbouring notes don't collide.
const NOTES: Record<number, { n: number; text: string; end?: boolean }> = {
  3: { n: 1, text: 'Session 3 · first export added to a normal session' },
  6: { n: 2, text: 'Session 6 · two exports a session, drift at 4.3 of 5', end: true },
  7: { n: 3, text: 'Session 7 · crosses the line, agent put on watch', end: true },
};

const H = 300, TOP = 104, BOTTOM = 24, PAD_X = 8, Y_MAX = 9;

// D6: per-call scores stay in Allow while the session-level drift accumulator climbs past H.
export function DriftChart() {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = DRIFT_D6.length;
  const x = (i: number) => PAD_X + (i * (w - 2 * PAD_X)) / (n - 1);
  const y = (s: number) => TOP + (1 - s / Y_MAX) * (H - TOP - BOTTOM);
  const base = H - BOTTOM;
  const line = DRIFT_D6.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.S)}`).join(' ');
  const area = `${line} L ${x(n - 1)} ${base} L ${x(0)} ${base} Z`;
  const hv = hover === null ? null : DRIFT_D6[hover]!;

  return (
    <figure className="drift">
      <figcaption className="drift-cap">Drift level for <span className="mono">procurement-01</span> under a stolen token, one point per session (scenario D6)</figcaption>
      <div className="drift-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Drift accumulator rises from 0 to 7.7 over seven sessions and crosses the alarm line at 5 in session 7, while every individual call scores 25 or less.">
          <defs>
            <linearGradient id="drift-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--down)" stopOpacity=".55" />
              <stop offset=".45" stopColor="var(--mark)" stopOpacity=".9" />
              <stop offset="1" stopColor="var(--mark)" stopOpacity=".08" />
            </linearGradient>
          </defs>
          {DRIFT_D6.map((d, i) => NOTES[d.session] && (
            <g key={d.session}>
              <line x1={x(i)} x2={x(i)} y1={TOP - 26} y2={base} className="drift-guide" />
              <text x={NOTES[d.session]!.end ? x(i) - 8 : x(i)} y={TOP - 72} className="drift-num" textAnchor={NOTES[d.session]!.end ? 'end' : 'middle'}>{NOTES[d.session]!.n}</text>
            </g>
          ))}
          <path d={area} fill="url(#drift-fill)" />
          <line x1={0} x2={w} y1={y(DRIFT_H)} y2={y(DRIFT_H)} className="drift-h" />
          <text x={4} y={y(DRIFT_H) - 8} className="drift-hlabel">Alarm line H = {DRIFT_H}</text>
          <path d={line} className="drift-line" />
          <line x1={0} x2={w} y1={base} y2={base} className="drift-axis" />
          {hv && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={TOP - 26} y2={base} className="drift-cross" />
              <circle cx={x(hover!)} cy={y(hv.S)} r={5} className="drift-dot" />
            </g>
          )}
          {DRIFT_D6.map((_, i) => (
            <rect key={i} x={x(i) - (w / n) / 2} y={0} width={w / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {DRIFT_D6.map((d, i) => NOTES[d.session] && (
          <p key={d.session} className="drift-note" style={{ left: x(i), top: TOP - 62 }} data-edge={NOTES[d.session]!.end ? 'end' : undefined}>
            {NOTES[d.session]!.text}
          </p>
        ))}
        {hv && (
          <div className="drift-tip" data-side={x(hover!) > w / 2 ? 'left' : 'right'} style={{ left: x(hover!), top: Math.max(TOP - 20, y(hv.S) - 30) }}>
            <b>Session {hv.session}</b>
            <span>Drift <b className="num">{hv.S.toFixed(2)}</b> of {DRIFT_H}</span>
            <span>{hv.calls} calls, {hv.exports} report export{hv.exports === 1 ? '' : 's'}</span>
            <span>Highest single call <b className="num">{hv.maxCall}</b></span>
          </div>
        )}
      </div>
      <ol className="drift-x">
        {DRIFT_D6.map((d, i) => (
          <li key={d.session} style={{ left: x(i) }} data-edge={i === 0 ? 'start' : i === n - 1 ? 'end' : undefined}>
            <span className="mono"><span className="sm-hide">session </span>{d.session}</span>
            <span className="muted sm-hide">max call {d.maxCall}</span>
            <span className="sm-hide"><BandChip band="ALLOW" /></span>
          </li>
        ))}
      </ol>
      <ol className="drift-list">
        {Object.values(NOTES).map(note => <li key={note.n}><b>{note.n}</b> {note.text}</li>)}
        <li>Highest single call in any session: 25, always Allow.</li>
      </ol>
    </figure>
  );
}
