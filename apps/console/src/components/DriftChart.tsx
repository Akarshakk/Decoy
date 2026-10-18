import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DriftSession } from '../live/scenarios';
import { BandChip } from './ui';

const H = 300, TOP = 104, BOTTOM = 24, PAD_X = 8;

// The three moments worth a label, found in the data: first export, the last session under H, the crossing.
function notesFor(data: DriftSession[], h: number) {
  const notes: Record<number, { n: number; text: string; end?: boolean }> = {};
  const first = data.find(d => d.exports > 0);
  const alarm = data.find(d => d.alarm);
  const before = alarm ? data[data.indexOf(alarm) - 1] : undefined;
  let n = 0;
  if (first && first !== alarm && first !== before) notes[first.session] = { n: ++n, text: `Session ${first.session} · first export added to a normal session` };
  if (before && before.S > 0) notes[before.session] = { n: ++n, text: `Session ${before.session} · ${before.exports} export${before.exports === 1 ? '' : 's'} a session, drift at ${before.S.toFixed(1)} of ${h}`, end: true };
  if (alarm) notes[alarm.session] = { n: ++n, text: `Session ${alarm.session} · crosses the line, agent put on watch`, end: true };
  return notes;
}

/** Per-call scores stay in Allow while the session-level drift accumulator climbs past H. Data from a live D6 run. */
export function DriftChart({ data, h, agent }: { data: DriftSession[]; h: number; agent: string }) {
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

  const NOTES = useMemo(() => notesFor(data, h), [data, h]);
  const Y_MAX = Math.max(h * 1.8, ...data.map(d => d.S * 1.15));
  const n = data.length;
  const maxCall = Math.max(...data.map(d => d.maxCall));
  const alarm = data.find(d => d.alarm);
  const x = (i: number) => PAD_X + (i * (w - 2 * PAD_X)) / (n - 1);
  const y = (s: number) => TOP + (1 - s / Y_MAX) * (H - TOP - BOTTOM);
  const base = H - BOTTOM;
  const line = data.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.S)}`).join(' ');
  const area = `${line} L ${x(n - 1)} ${base} L ${x(0)} ${base} Z`;
  const hv = hover === null ? null : data[hover]!;

  return (
    <figure className={`drift ${w < 1000 ? 'is-compact' : ''}`}>
      <figcaption className="drift-cap">Drift level for <span className="mono">{agent}</span> under a stolen token, one point per session (scenario D6, played live in your browser)</figcaption>
      <div className="drift-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label={`Drift accumulator rises to ${data.at(-1)!.S.toFixed(1)} over ${n} sessions${alarm ? ` and crosses the alarm line at ${h} in session ${alarm.session}` : ''}, while every individual call scores ${maxCall} or less.`}>
          <defs>
            <linearGradient id="drift-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--down)" stopOpacity=".55" />
              <stop offset=".45" stopColor="var(--mark)" stopOpacity=".9" />
              <stop offset="1" stopColor="var(--mark)" stopOpacity=".08" />
            </linearGradient>
          </defs>
          {data.map((d, i) => NOTES[d.session] && (
            <g key={d.session}>
              <line x1={x(i)} x2={x(i)} y1={TOP - 26} y2={base} className="drift-guide" />
              <text x={NOTES[d.session]!.end ? x(i) - 8 : x(i)} y={TOP - 72} className="drift-num" textAnchor={NOTES[d.session]!.end ? 'end' : 'middle'}>{NOTES[d.session]!.n}</text>
            </g>
          ))}
          <path d={area} fill="url(#drift-fill)" />
          <line x1={0} x2={w} y1={y(h)} y2={y(h)} className="drift-h" />
          <text x={4} y={y(h) - 8} className="drift-hlabel">Alarm line H = {h}</text>
          <path d={line} className="drift-line" />
          <line x1={0} x2={w} y1={base} y2={base} className="drift-axis" />
          {hv && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={TOP - 26} y2={base} className="drift-cross" />
              <circle cx={x(hover!)} cy={y(hv.S)} r={5} className="drift-dot" />
            </g>
          )}
          {data.map((_, i) => (
            <rect key={i} x={x(i) - (w / n) / 2} y={0} width={w / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {data.map((d, i) => NOTES[d.session] && (
          <p key={d.session} className="drift-note" style={{ left: x(i), top: TOP - 62 }} data-edge={NOTES[d.session]!.end ? 'end' : undefined}>
            {NOTES[d.session]!.text}
          </p>
        ))}
        {hv && (
          <div className="drift-tip" data-side={x(hover!) > w / 2 ? 'left' : 'right'} style={{ left: x(hover!), top: Math.max(TOP - 20, y(hv.S) - 30) }}>
            <b>Session {hv.session}</b>
            <span>Drift <b className="num">{hv.S.toFixed(2)}</b> of {h}</span>
            <span>{hv.calls} calls, {hv.exports} report export{hv.exports === 1 ? '' : 's'}</span>
            <span>Highest single call <b className="num">{hv.maxCall}</b></span>
          </div>
        )}
      </div>
      <ol className="drift-x">
        {data.map((d, i) => (
          <li key={d.session} style={{ left: x(i) }} data-edge={i === 0 ? 'start' : i === n - 1 ? 'end' : undefined}>
            <span className="mono"><span className="sm-hide">session </span>{d.session}</span>
            <span className="muted sm-hide">max call {d.maxCall}</span>
            <span className="sm-hide"><BandChip band={d.maxCall >= 30 ? 'HOLD' : 'ALLOW'} /></span>
          </li>
        ))}
      </ol>
      <ol className="drift-list">
        {Object.values(NOTES).map(note => <li key={note.n}><b>{note.n}</b> {note.text}</li>)}
        <li>Highest single call in any session: {maxCall}, {maxCall < 30 ? 'always Allow' : 'at or above the hold line'}.</li>
      </ol>
    </figure>
  );
}
