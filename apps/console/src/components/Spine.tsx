import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { StepView } from '../live/scenarios';
import { BandChip, ScoreRing, bandClass } from './ui';

interface Props {
  steps: StepView[];
  mainAgent: string;
  taint: { from: number; to: number[] } | null;
  visible: number;
  selected: number;
  onSelect: (i: number) => void;
  shadow?: boolean;
  compact?: boolean;
  renderAside?: (i: number) => ReactNode;
}

type Thread = { d: string; dots: [number, number][] };

export function Spine({ steps, mainAgent, taint, visible, selected, onSelect, shadow = false, compact = false, renderAside }: Props) {
  const wrap = useRef<HTMLOListElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);

  // The taint thread runs from the untrusted document to every call it influenced, hugging the cards' left edge.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || !taint) { setThread(null); return; }
    const measure = () => {
      const box = el.getBoundingClientRect();
      const at = (i: number) => {
        const c = cards.current[i];
        if (!c || i >= visible) return null;
        const r = c.getBoundingClientRect();
        return [r.left - box.left, r.top - box.top + r.height / 2] as [number, number];
      };
      const from = at(taint.from);
      const tos = taint.to.map(at).filter((p): p is [number, number] => !!p);
      if (!from || !tos.length) { setThread(null); return; }
      // A bracket: out of the document, down a rail beside the cards, into each influenced call.
      const [cx, fy] = from;
      const x = cx - (compact ? 14 : 16), r = 6;
      const ly = tos[tos.length - 1]![1];
      const d = `M ${cx} ${fy} H ${x + r} Q ${x} ${fy} ${x} ${fy + r} V ${ly - r} Q ${x} ${ly} ${x + r} ${ly} H ${cx}` +
        tos.slice(0, -1).map(([tx, ty]) => ` M ${x} ${ty} H ${tx}`).join('');
      setThread({ d, dots: [from, ...tos] });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [taint, visible, compact, steps]);

  return (
    <ol ref={wrap} className={`spine ${compact ? 'spine-compact' : ''} ${renderAside ? 'spine-with-aside' : ''}`}>
      {steps.map((step, i) => {
        const shown = i < visible;
        const d = step.decision;
        const would = shadow && d.band !== 'ALLOW';
        const tag = d.escalated ? 'escalated' : step.tag;
        return (
          <li key={d.id} className={`spine-row ${shown ? '' : 'is-pending'}`}>
            {step.divider && <div className="spine-divider">{step.divider}</div>}
            {!compact && <span className="spine-index">{i + 1}</span>}
            <span className="spine-dot" aria-hidden />
            <button
              ref={el => { cards.current[i] = el; }}
              className={`call ${i === selected ? 'is-selected' : ''} call-${bandClass(d.band)}`}
              onClick={() => onSelect(i)}
              disabled={!shown}
              aria-current={i === selected}
            >
              <span className="call-name">
                <span className="call-tool">{step.tool}</span>
                {step.arg && <span className="call-arg"> · {step.arg}</span>}
                {step.agent !== mainAgent && <span className="call-agent">{step.agent}</span>}
              </span>
              <ScoreRing score={shown ? d.score : 0} band={d.band} size={compact ? 30 : 34} />
              <span className="call-verdict">
                <BandChip band={d.band} prefix={would ? 'Would ' : undefined} />
                {tag && <span className="tag">{tag}</span>}
              </span>
            </button>
            {renderAside && <div className="spine-aside">{renderAside(i)}</div>}
          </li>
        );
      })}
      {thread && (
        <svg className="thread" aria-hidden>
          <path d={thread.d} className="thread-marker" />
          <path d={thread.d} className="thread-line" />
          {thread.dots.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={3} className="thread-dot" />)}
        </svg>
      )}
    </ol>
  );
}
