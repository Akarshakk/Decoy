import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bandOf, type Scenario, type Step, type Verdict } from '../data/fixtures';
import { BandChip, ScoreRing, bandClass } from './ui';

// In shadow mode nothing is enforced: no token changes and no escalation, so the band is the score's own band.
export function verdictFor(step: Step, shadow: boolean): Verdict & { wouldHave: boolean } {
  if (!shadow) return { ...step, wouldHave: false };
  const v = step.shadow ?? { ...step, escalated: undefined, band: bandOf(step.score) };
  return { ...v, wouldHave: v.band !== 'ALLOW' };
}

interface Props {
  scenario: Scenario;
  visible: number;
  selected: number;
  onSelect: (i: number) => void;
  shadow?: boolean;
  compact?: boolean;
  renderAside?: (i: number) => ReactNode;
}

type Thread = { d: string; dots: [number, number][] };

export function Spine({ scenario, visible, selected, onSelect, shadow = false, compact = false, renderAside }: Props) {
  const wrap = useRef<HTMLOListElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const taint = scenario.taint;

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
  }, [taint, visible, compact, scenario.id]);

  return (
    <ol ref={wrap} className={`spine ${compact ? 'spine-compact' : ''} ${renderAside ? 'spine-with-aside' : ''}`}>
      {scenario.steps.map((step, i) => {
        const shown = i < visible;
        const v = verdictFor(step, shadow);
        const tag = v.escalated ? 'escalated' : step.tag;
        return (
          <li key={i} className={`spine-row ${shown ? '' : 'is-pending'}`}>
            {step.dividerBefore && <div className="spine-divider">{step.dividerBefore}</div>}
            {!compact && <span className="spine-index">{i + 1}</span>}
            <span className="spine-dot" aria-hidden />
            <button
              ref={el => { cards.current[i] = el; }}
              className={`call ${i === selected ? 'is-selected' : ''} call-${bandClass(v.band)}`}
              onClick={() => onSelect(i)}
              disabled={!shown}
              aria-current={i === selected}
            >
              <span className="call-name">
                <span className="call-tool">{step.tool}</span>
                {step.arg && <span className="call-arg"> · {step.arg}</span>}
                {step.agent !== scenario.agent && <span className="call-agent">{step.agent}</span>}
              </span>
              <ScoreRing score={shown ? v.score : 0} band={v.band} size={compact ? 30 : 34} />
              <span className="call-verdict">
                <BandChip band={v.band} prefix={v.wouldHave ? 'Would ' : undefined} />
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
