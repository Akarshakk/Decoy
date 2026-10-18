// Charts for the Evaluations page. Every number comes from public/eval/results.json; nothing here animates on its own.
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { AttackResult, CohortResult, LatencyResult, Rate, Results } from '@swaroop/eval';
import { stopProfile } from '../live/evals';

const pct = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`;
const ciText = (c: [number, number]) => `${pct(c[0], 1)} to ${pct(c[1], 1)}`;

/** One hover tooltip per chart, placed next to whatever the pointer is on. */
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; side: 'left' | 'right'; body: ReactNode } | null>(null);
  const on = (body: ReactNode) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement | SVGElement>) => {
      const b = box.current?.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect();
      if (!b) return;
      const x = r.left - b.left + r.width / 2;
      setTip({ x, y: r.top - b.top, side: x > b.width / 2 ? 'left' : 'right', body });
    },
    onMouseLeave: () => setTip(null),
  });
  const layer = tip && <div className="tip" data-side={tip.side} style={{ left: tip.x, top: Math.max(0, tip.y - 8) }}>{tip.body}</div>;
  return { box, on, layer };
}

/** A rate on a 0–100% track: the bar is the point estimate, the whisker its 95% Wilson interval. */
export function RateBar({ r, tone = 'ink' }: { r: Rate; tone?: 'ink' | 'warn' }) {
  return (
    <span className={`rb rb-${tone}`} aria-hidden>
      <span className="rb-fill" style={{ width: `${100 * r.rate}%` }} />
      <span className="rb-ci" style={{ left: `${100 * r.ci[0]}%`, width: `${100 * (r.ci[1] - r.ci[0])}%` }} />
    </span>
  );
}

/** Families × detector sets. The full engine's column is highlighted; hover a cell for counts and the interval. */
export function CatchMatrix({ r }: { r: Results }) {
  const { box, on, layer } = useTip();
  return (
    <div className="em chart" ref={box}>
      <div className="em-row em-head" role="row">
        <span className="em-fam" />
        {r.configs.map(c => (
          <span key={c.id} className={`em-cfg ${c.id === 'full' ? 'is-full' : ''}`} {...on(<><b>{c.label}</b><span>{c.note}</span></>)}>{c.label}</span>
        ))}
      </div>
      {r.attacks.map(a => (
        <div key={a.id} className={`em-row ${a.expectedMiss ? 'is-expected' : ''}`} role="row">
          <span className="em-fam">
            <b>{a.label}</b>
            {a.expectedMiss && <span className="tag">expected miss</span>}
          </span>
          {r.configs.map(c => {
            const x = a.byConfig[c.id]!;
            return (
              <span key={c.id} className={`em-cell ${c.id === 'full' ? 'is-full' : ''}`} data-cfg={c.label}
                {...on(<><b>{a.label} · {c.label}</b><span><b className="num">{x.k}</b> of {x.n} caught</span><span>95% interval {ciText(x.ci)}</span><span>Caught = {a.damage.startsWith('not caught') ? 'alarm or stopped call' : `prevented: ${a.damage}`}</span></>)}>
                <span className="num em-num">{pct(x.rate)}</span>
                <RateBar r={x} />
              </span>
            );
          })}
        </div>
      ))}
      {layer}
    </div>
  );
}

const STEP_CLASS = ['st-1', 'st-2', 'st-3'];

/** Single-session attacks: which attack call was the first one stopped, as a share of all trials. */
export function StopBars({ attacks }: { attacks: AttackResult[] }) {
  const { box, on, layer } = useTip();
  const fams = attacks.filter(a => a.unit === 'calls');
  const maxStep = Math.max(1, ...fams.flatMap(a => stopProfile(a).stops.map(s => s.step)));
  return (
    <div className="chart sb" ref={box}>
      <ul className="sb-legend">
        {Array.from({ length: maxStep }, (_, i) => <li key={i}><i className={`sb-key ${STEP_CLASS[Math.min(i, 2)]}`} />Stopped at attack call {i + 1}</li>)}
        <li><i className="sb-key st-miss" />Got through</li>
      </ul>
      {fams.map(a => {
        const p = stopProfile(a);
        return (
          <div key={a.id} className="sb-row">
            <span className="sb-name">{a.label}</span>
            <span className="sb-track">
              {p.stops.map(s => (
                <span key={s.step} className={`sb-seg ${STEP_CLASS[Math.min(s.step - 1, 2)]}`} style={{ width: `${(100 * s.n) / p.n}%` }}
                  {...on(<><b>{a.label}</b><span>Stopped at attack call {s.step}: <b className="num">{s.n}</b> of {p.n}</span></>)} />
              ))}
              {p.missed > 0 && <span className="sb-seg st-miss" style={{ width: `${(100 * p.missed) / p.n}%` }}
                {...on(<><b>{a.label}</b><span>Got through: <b className="num">{p.missed}</b> of {p.n}</span></>)} />}
            </span>
          </div>
        );
      })}
      {layer}
    </div>
  );
}

const SH_H = 120, SH_TOP = 8, SH_BOTTOM = 20;

/** Multi-session attacks: how many daily sessions it took to catch them, one histogram per family, same scale. */
export function SessionHistograms({ attacks }: { attacks: AttackResult[] }) {
  const { box, on, layer } = useTip();
  const fams = attacks.filter(a => a.unit === 'sessions');
  const horizon = Math.max(...fams.map(a => a.horizon ?? 0));
  // The scale fits the catches; a "not caught" column taller than that is drawn full height with its count.
  const maxN = Math.max(1, ...fams.flatMap(a => stopProfile(a).stops.map(s => s.n)));
  const lastSeen = Math.max(1, ...fams.flatMap(a => stopProfile(a).stops.map(s => s.step)));
  const cols = Math.min(horizon, lastSeen + 1);        // sessions 1…(last catch + 1), then a "not caught" column
  return (
    <div className="sh" ref={box}>
      {fams.map(a => {
        const p = stopProfile(a), by = new Map(p.stops.map(s => [s.step, s.n]));
        const field = Object.keys(a.variants[0] ?? {})[0];
        const split = (step: number) => {
          if (!field) return null;
          const counts = new Map<string, number>();
          a.byConfig.full!.detectAt.forEach((d, i) => { if (d === step) { const v = String(a.variants[i]![field]); counts.set(v, (counts.get(v) ?? 0) + 1); } });
          return [...counts].sort().map(([v, n]) => `${field} ${v}: ${n}`).join(' · ');
        };
        const W = 100 / (cols + 1.6);
        const y = (n: number) => n <= 0 ? SH_TOP + (SH_H - SH_TOP - SH_BOTTOM) : Math.min(SH_H - SH_BOTTOM - 2, SH_TOP + (1 - Math.min(1, n / maxN)) * (SH_H - SH_TOP - SH_BOTTOM));
        return (
          <figure key={a.id} className="sh-fig chart">
            <figcaption><b>{a.label}</b>{a.expectedMiss && <span className="tag">expected miss</span>}</figcaption>
            <svg width="100%" height={SH_H} role="img" aria-label={`${a.label}: ${p.stops.map(s => `${s.n} caught at session ${s.step}`).join(', ') || 'none caught'}; ${p.missed} not caught within ${a.horizon} sessions`}>
              <line x1="0" x2="100%" y1={y(0)} y2={y(0)} className="tl-axis" />
              {Array.from({ length: cols }, (_, i) => {
                const n = by.get(i + 1) ?? 0;
                return (
                  <g key={i}>
                    {n > 0 && <rect x={`${(i + 0.15) * W}%`} width={`${W * 0.7}%`} y={y(n)} height={y(0) - y(n)} rx={2} className="sh-bar"
                      {...on(<><b>{a.label} · session {i + 1}</b><span><b className="num">{n}</b> of {p.n} caught here</span>{split(i + 1) && <span>{split(i + 1)}</span>}</>)} />}
                    {(i === 0 || (i + 1) % 5 === 0) && <text x={`${(i + 0.5) * W}%`} y={SH_H - 6} textAnchor="middle" className="tl-label">{i + 1}</text>}
                  </g>
                );
              })}
              {p.missed > 0 && <rect x={`${(cols + 0.45) * W}%`} width={`${W}%`} y={y(p.missed)} height={y(0) - y(p.missed)} rx={2} className="sh-miss"
                {...on(<><b>{a.label}</b><span><b className="num">{p.missed}</b> of {p.n} not caught within {a.horizon} sessions</span></>)} />}
              <text x="100%" y={SH_H - 6} textAnchor="end" className="tl-label">{p.missed > 0 ? `not caught ${p.missed}` : 'all caught'}</text>
            </svg>
          </figure>
        );
      })}
      <p className="small muted">Bars count trials by the daily session in which the drift alarm fired or a call was first held. Same vertical scale in every panel (top = {maxN} trials); a red column is the trials never caught.</p>
      {layer}
    </div>
  );
}

/** Benign cohorts: share of sessions flagged and calls held, inline-only against full, with drift alarms. */
export function BenignTable({ benign }: { benign: CohortResult[] }) {
  const { box, on, layer } = useTip();
  const rateCell = (label: string, x: Rate, unit: string, what: string) => (
    <span className="bt-cell" data-col={label} {...on(<><b>{label}</b><span><b className="num">{x.k}</b> of {x.n} {unit} {what}</span><span>95% interval {ciText(x.ci)}</span></>)}>
      <span className="num">{pct(x.rate, x.rate > 0 && x.rate < 0.1 ? 1 : 0)}</span>
      <RateBar r={x} tone={x.k ? 'warn' : 'ink'} />
    </span>
  );
  return (
    <div className="bt chart" ref={box}>
      <div className="bt-row bt-head">
        <span>Cohort</span><span>Sessions flagged, inline only</span><span>Sessions flagged, full</span><span>Calls held or blocked, full</span><span className="r">Drift alarms, full</span>
      </div>
      {benign.map(b => {
        const a = b.byConfig.a!, f = b.byConfig.full!;
        return (
          <div key={b.id} className={`bt-row ${f.flagged ? 'is-hit' : ''}`}>
            <span className="bt-name" {...on(<><b>{b.label}</b><span>{b.summary}</span></>)}><b>{b.label}</b>{b.shifted && <span className="tag">shifted</span>}</span>
            {rateCell('Inline only', a.flaggedRate, 'sessions', 'flagged')}
            {rateCell('Full', f.flaggedRate, 'sessions', 'flagged')}
            {rateCell('Full', f.blockedRate, 'calls', 'held or blocked')}
            <span className="bt-cell r num" data-col="Drift alarms">{f.alarms}</span>
          </div>
        );
      })}
      {layer}
    </div>
  );
}

const LH_H = 150, LH_TOP = 10, LH_BOTTOM = 34;

/** Per-call latency histogram for the inline checks and the whole decision, as a share of calls per bucket. */
export function LatencyChart({ l }: { l: LatencyResult }) {
  const { box, on, layer } = useTip();
  const n = l.calls;
  // Drop empty buckets above the slowest call so the axis covers the data, not the bucket list.
  const last = l.histogram.reduce((k, h, i) => (h.inline || h.total ? i : k), 0);
  const hist = l.histogram.slice(0, last + 1);
  const max = Math.max(...hist.flatMap(h => [h.inline, h.total])) / n;
  const label = (i: number) => {
    const lo = i ? l.histogram[i - 1]!.edgeUs : 0, hi = l.histogram[i]!.edgeUs;
    return hi === null || !isFinite(hi) ? `≥${lo}` : `${lo}–${hi}`;
  };
  const B = hist.length, W = 100 / B;
  // A bucket with any calls stays visible (2px at least); hover gives its exact count.
  const y = (share: number) => (share > 0 ? Math.min(LH_H - LH_BOTTOM - 2, LH_TOP + (1 - share / max) * (LH_H - LH_TOP - LH_BOTTOM)) : LH_H - LH_BOTTOM);
  return (
    <div className="chart" ref={box}>
      <ul className="mc-legend">
        <li><i className="lh-key lh-inline" />Inline checks: p50 <b className="num">{l.inlineUs.p50} µs</b>, p95 <b className="num">{l.inlineUs.p95} µs</b></li>
        <li><i className="lh-key lh-total" />Whole decision: p50 <b className="num">{l.totalUs.p50} µs</b>, p95 <b className="num">{l.totalUs.p95} µs</b></li>
      </ul>
      <svg width="100%" height={LH_H} role="img" aria-label={`Latency over ${n} calls. Inline p50 ${l.inlineUs.p50} µs, p95 ${l.inlineUs.p95} µs. Whole decision p50 ${l.totalUs.p50} µs, p95 ${l.totalUs.p95} µs.`}>
        <line x1="0" x2="100%" y1={y(0)} y2={y(0)} className="tl-axis" />
        {hist.map((h, i) => (
          <g key={i}>
            {h.inline > 0 && <rect x={`${(i + 0.14) * W}%`} width={`${W * 0.34}%`} y={y(h.inline / n)} height={y(0) - y(h.inline / n)} rx={2} className="lh-inline"
              {...on(<><b>Inline checks · {label(i)} µs</b><span><b className="num">{h.inline}</b> of {n} calls ({pct(h.inline / n, 1)})</span></>)} />}
            {h.total > 0 && <rect x={`${(i + 0.52) * W}%`} width={`${W * 0.34}%`} y={y(h.total / n)} height={y(0) - y(h.total / n)} rx={2} className="lh-total"
              {...on(<><b>Whole decision · {label(i)} µs</b><span><b className="num">{h.total}</b> of {n} calls ({pct(h.total / n, 1)})</span></>)} />}
            <text x={`${(i + 0.5) * W}%`} y={LH_H - 18} textAnchor="middle" className="tl-label">{label(i)}</text>
          </g>
        ))}
        <text x="0" y={LH_H - 3} className="tl-label">µs per call, share of {n.toLocaleString('en-US')} calls</text>
      </svg>
      {layer}
    </div>
  );
}
