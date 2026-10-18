// The full alert card (build_execution.md §5.5) for one engine Decision, with the owner's actions.
import type { Decision, Engine, LedgerRecord } from '@swaroop/engine';
import { BAND_EDGES, BAND_LABEL, CAUSE_LABEL, fmtDateTime, STATUS_LABEL } from '../live/labels';
import { useLive } from '../live/react';
import { causeOf, statusOf, type AlertStatus } from '../live/view';
import { BuildUpChart } from './charts';
import { Bar, BandChip, ScoreRing, bandClass } from './ui';

function outcome(d: Decision, status: AlertStatus, owner: string) {
  const band = BAND_LABEL[d.band].toLowerCase();
  switch (status) {
    case 'held': return `Parked until ${owner} decides. The call has not run.`;
    case 'approved': return 'Held, then approved by the owner. The call ran.';
    case 'denied': return 'Held, then denied by the owner. The call never ran.';
    case 'role_change': return 'Approved as a role change. The charter was re-signed and the call ran.';
    case 'shadow': return `Shadow mode: this would have been ${band}. Nothing was enforced and the call ran.`;
    case 'blocked': return d.credentials.ok ? `Blocked (${band}). The call did not run.` : `Blocked: credentials failed (${d.credentials.reason}). The call did not run.`;
    case 'ran': return 'Ran normally.';
  }
}

// Browsers coarsen performance.now() to ~0.1 ms, so report at that resolution rather than as fake microseconds.
const ms = (us: number) => (us < 100 ? '< 0.1 ms' : `${(us / 1000).toFixed(1)} ms`);

const refersTo = (r: LedgerRecord, id: string) => r.type !== 'decision' && (r.payload.id === id || r.payload.decision === id);

/** `readOnly` for replays (Investigate): owner actions belong to the live fleet, not to a recorded scenario run. */
export function DecisionCard({ decision: d, engine, readOnly = false }: { decision: Decision; engine: Engine; readOnly?: boolean }) {
  const { store, busy } = useLive();
  const status = statusOf(engine, d);
  const charter = engine.charterOf(d.call.agentId);
  const agentState = engine.agent(d.call.agentId).state;
  const factors = [...d.factors].sort((a, b) => b.looImpact - a.looImpact);
  const cause = causeOf(d);
  const recs = engine.ledgerRecords();
  const own = recs.find(r => r.hash === d.ledgerHash);
  const follow = recs.filter(r => refersTo(r, d.id));
  const evidence = [...new Set(d.factors.flatMap(f => f.subs.flatMap(s => s.evidence)))];
  const t = d.tokenAction;
  const offCharter = !charter.tools.includes(d.call.tool);
  const fpLogged = follow.some(r => r.type === 'fp_review');
  const unvetted = engine.unvetted.has(d.call.tool);
  const newRuntime = d.factors.some(f => f.subs.some(s => s.code === 'new_runtime'));

  return (
    <div className="alert">
      <div className="alert-title">
        <h2>{d.band === 'ALLOW' && d.credentials.ok ? 'Decision' : 'Alert'} <span className="mono muted">· {d.id}</span></h2>
        <span className="mono muted">{fmtDateTime(d.call.ts)}</span>
      </div>
      <p className="mono small dc-call"><b>{d.call.tool}</b> · {d.call.agentId} ({charter.role}@v{d.charterVersion})</p>

      <div className="alert-score">
        <ScoreRing score={d.score} band={d.band} size={92} ticks />
        <ul className="legend" aria-label="Band edges">
          {BAND_EDGES.map(([from, b]) => (
            <li key={b} className={d.score >= from ? 'is-hit' : ''}><span className={`swatch sw-${bandClass(b)}`} />{from}</li>
          ))}
        </ul>
        <div className="alert-band">
          <BandChip band={d.band} prefix={status === 'shadow' ? 'Would ' : undefined} />
          {d.escalated && <span className="tag">escalated</span>}
          <span className="tag">{STATUS_LABEL[status]}</span>
        </div>
      </div>

      <p className="alert-outcome">{outcome(d, status, charter.owner)}{d.escalationReason && <span className="muted"> Escalated: {d.escalationReason}.</span>}</p>

      {cause && (
        <section className="alert-sec">
          <h3>Root cause</h3>
          <p><b className="mono">{cause}</b> {CAUSE_LABEL[cause]}{factors[0] && cause !== 'credentials' && cause !== 'TRIPWIRE' ? `: ${factors[0].subs.map(s => s.reason).join('; ')}` : ''}</p>
          {cause === 'TRIPWIRE' && <p>A decoy that no real job touches was read. Score set to 100.</p>}
        </section>
      )}

      <section className="alert-sec">
        <h3>How the score adds up</h3>
        <BuildUpChart decision={d} />
      </section>

      <section className="alert-sec">
        <h3>Factors <span className="muted mono">weight · drop if removed</span></h3>
        {factors.length ? (
          <ul className="factors">
            {factors.map(f => (
              <li key={f.factor} className="factor factor-full">
                <span className="factor-name"><b>{f.factor}</b> {CAUSE_LABEL[f.factor]}</span>
                <Bar value={f.weighted} />
                <span className="num">{f.weighted.toFixed(2)}</span>
                <span className="num drop">−{f.looImpact}</span>
                <span className="factor-why">{f.subs.map(s => s.reason).join('; ')}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{d.rootCause === 'TRIPWIRE' ? 'The tripwire overrides every factor.' : 'No factor fired. The call is in role and in this agent’s baseline.'}</p>}
        <p className="mono small muted dc-mult">sensitivity multiplier ×{d.multiplier.toFixed(2)}</p>
      </section>

      {d.culpritDoc && (
        <section className="alert-sec">
          <h3>Culprit</h3>
          <p className="doc"><mark className="mark mono">{d.culpritDoc}</mark></p>
        </section>
      )}

      <section className="alert-sec">
        <h3>Credentials and token</h3>
        <p className="small">{d.credentials.ok ? 'Credentials valid: signature, expiry, version and scope all passed.' : `Credentials failed: ${d.credentials.reason}.`}</p>
        {t.kind !== 'none' && (
          <div className="dc-token">
            <p className="mono small">
              <b>{t.target === 'delegated_session' ? 'delegated session token' : 'agent token'} v{d.tokenVerBefore} → {t.kind === 'revoke' ? 'revoked' : `v${d.tokenVerAfter}`}</b>
            </p>
            {!!t.removed?.length && <p className="dc-scopes">{t.removed.map(s => <s key={s} className="mono">{s}</s>)}</p>}
            {!!t.cascade?.length && <p className="small">Cascaded to {t.cascade.join(', ')}.</p>}
          </div>
        )}
        {d.invariant && <p className="small muted">{d.invariant}</p>}
      </section>

      <section className="alert-sec">
        <h3>Evidence</h3>
        <dl className="dc-facts">
          <div><dt>Snapshot</dt><dd className="mono">{d.snapshotId}</dd></div>
          <div><dt>Charter</dt><dd className="mono">{charter.role} v{d.charterVersion}</dd></div>
          {evidence.length > 0 && <div><dt>Refs</dt><dd className="mono">{evidence.join(', ')}</dd></div>}
          <div><dt>Latency</dt><dd className="mono" title="Measured in this browser. Browsers round performance.now() to about 0.1 ms, so faster steps show as under 0.1 ms.">{ms(d.latencyUs)} total · {ms(d.inlineLatencyUs)} inline checks</dd></div>
          <div><dt>Ledger</dt><dd className="mono">#{own?.seq ?? '?'} · {d.ledgerHash.slice(0, 12)}</dd></div>
        </dl>
        <details className="dc-raw">
          <summary>Explanation as logged</summary>
          <pre>{d.explanation}</pre>
        </details>
      </section>

      {follow.length > 0 && (
        <section className="alert-sec">
          <h3>Owner actions</h3>
          <ul className="dc-follow">
            {follow.map(r => <li key={r.seq} className="mono small">#{r.seq} {r.type}{r.payload.outcome ? `: ${String(r.payload.outcome)}` : ''}{r.type === 'role_change' ? `: charter v${r.payload.from} → v${r.payload.to}` : ''}</li>)}
          </ul>
        </section>
      )}

      {!readOnly && <div className="actions">
        {status === 'held' && (
          <>
            <button className="btn btn-ink btn-block" disabled={!!busy} onClick={() => store.approveHold(d.id)}>Approve and run</button>
            {offCharter && <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.approveAsRoleChange(d.id)}>Approve as role change (charter v{charter.version + 1})</button>}
            <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.denyHold(d.id)}>Deny</button>
            {newRuntime && <p className="small muted">Approving also registers <span className="mono">{d.call.runtime.id}</span> ({d.call.runtime.asn}) as a known runtime for {d.call.agentId}.</p>}
          </>
        )}
        {status === 'shadow' && d.band === 'HOLD' && offCharter && !follow.some(r => r.type === 'role_change') && (
          <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.approveAsRoleChange(d.id)}>Approve as role change (charter v{charter.version + 1})</button>
        )}
        {unvetted && <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.approveToolVersion(d.call.tool)}>Trust the new {d.call.tool} definition</button>}
        {agentState !== 'revoked' && status !== 'shadow' && (
          <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.confirmCompromise(d.id)}>Confirm compromise and revoke</button>
        )}
        {!fpLogged && <button className="btn btn-line btn-block" disabled={!!busy} onClick={() => store.markFalsePositive(d.id)}>Mark false positive</button>}
        {agentState === 'revoked' && <p className="small muted">{d.call.agentId} is revoked. Reset the sandbox to restore it.</p>}
      </div>}
    </div>
  );
}
