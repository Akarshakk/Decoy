import { FACTOR_NAME, LADDER, type Scenario } from '../data/fixtures';
import { verdictFor } from './Spine';
import { Bar, BandChip, ScoreRing, bandClass } from './ui';

interface Props {
  scenario: Scenario;
  index: number;
  shadow?: boolean;
  compact?: boolean;
}

export function AlertCard({ scenario, index, shadow = false, compact = false }: Props) {
  const step = scenario.steps[index]!;
  const v = verdictFor(step, shadow);
  const blocked = v.band !== 'ALLOW';
  const sorted = [...v.factors].sort((a, b) => b.drop - a.drop);
  const top = sorted[0];

  if (compact) {
    return (
      <div className="alert alert-compact">
        <div className="alert-head">
          <ScoreRing score={v.score} band={v.band} size={40} />
          <BandChip band={v.band} />
          <span className="alert-call">{step.tool}</span>
        </div>
        {v.factors.length ? (
          <ul className="factors">
            {v.factors.map(f => (
              <li key={f.factor} className="factor">
                <span className="factor-name"><b>{f.factor}</b> {FACTOR_NAME[f.factor]}</span>
                <Bar value={f.weighted} />
                <span className="num">{f.weighted.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="alert-quiet">No factor fired. In role, in baseline.</p>}
        <dl className="alert-facts">
          <div><dt>Root cause</dt><dd>{top ? `${top.factor} ${FACTOR_NAME[top.factor]}` : 'none'}</dd></div>
          <div><dt>Culprit</dt><dd className="mono">{step.culprit ? <mark className="mark">{step.culprit.doc}</mark> : '—'}</dd></div>
        </dl>
        <p className="alert-foot">credentials {step.credentials.ok ? '✓ valid' : '✕ failed'} · no LLM in this decision</p>
      </div>
    );
  }

  return (
    <div className="alert">
      <div className="alert-title">
        <h2>{blocked ? 'Alert' : 'Decision'} <span className="mono muted">· {scenario.code.toLowerCase()}_{String(index + 1).padStart(4, '0')}</span></h2>
        <span className="mono muted">{step.agent}</span>
      </div>

      <div className="alert-score">
        <ScoreRing score={v.score} band={v.band} size={92} ticks />
        <ul className="legend" aria-label="Band edges">
          {LADDER.slice(1).map(l => (
            <li key={l.band} className={v.score >= l.from ? 'is-hit' : ''}>
              <span className={`swatch sw-${bandClass(l.band)}`} />{l.from}
            </li>
          ))}
        </ul>
        <div className="alert-band">
          <BandChip band={v.band} prefix={v.wouldHave ? 'Would ' : undefined} />
          {v.escalated && <span className="tag">escalated</span>}
        </div>
      </div>

      <p className="alert-outcome">{v.outcome}{v.escalated && <span className="muted"> {v.escalated}.</span>}</p>

      {v.rootCause && (
        <section className="alert-sec">
          <h3>Root cause</h3>
          <p>{v.rootCause}</p>
        </section>
      )}

      <section className="alert-sec">
        <h3>Factors <span className="muted mono">weight · drop if removed</span></h3>
        {sorted.length ? (
          <ul className="factors">
            {sorted.map(f => (
              <li key={f.factor} className="factor factor-full">
                <span className="factor-name"><b>{f.factor}</b> {FACTOR_NAME[f.factor]}</span>
                <Bar value={f.weighted} max={f.factor === 'TRIPWIRE' ? 1 : 0.6} />
                <span className="num">{f.weighted.toFixed(2)}</span>
                <span className="num drop">−{f.drop}</span>
                <span className="factor-why">{f.reason}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No factor fired. The call is in role and in this agent’s baseline.</p>}
      </section>

      {step.culprit && (
        <section className="alert-sec">
          <h3>Culprit</h3>
          <p className="doc"><DocIcon /><mark className="mark mono">{step.culprit.doc}</mark><span className="muted"> {step.culprit.finding}</span></p>
        </section>
      )}

      {(step.token || !step.credentials.ok) && (
        <section className="alert-sec">
          <h3>Token</h3>
          {step.token && !shadow && <p className="mono small"><b>{step.token.from} → {step.token.to}</b> · {step.token.change}</p>}
          {step.token && shadow && <p className="mono small muted">No change in shadow mode.</p>}
          {!step.credentials.ok && <p className="small">Credentials failed: {step.credentials.reason}.</p>}
        </section>
      )}
    </div>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M4 1.5h5l3 3v10H4z" /><path d="M9 1.5v3h3" />
    </svg>
  );
}
