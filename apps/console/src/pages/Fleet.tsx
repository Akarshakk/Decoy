import { Link } from 'react-router';
import { DRIFT_H } from '@swaroop/engine';
import { INCIDENTS } from '@swaroop/scenarios';
import { Sparkline } from '../components/charts';
import { BandChip, Bar, Frame, ScoreRing } from '../components/ui';
import { CAUSE_LABEL, fmtDateTime, pct, STATE_BAND, STATE_LABEL } from '../live/labels';
import { useLive, useView } from '../live/react';
import { alerts, byRootCause, fleet, pendingHolds } from '../live/view';
import { SandboxControls } from './Console';

export function Fleet() {
  const { store, busy, run } = useLive();
  const rows = useView(fleet);
  const list = useView(alerts);
  const holds = useView(pendingHolds);
  const engine = run?.engine;

  return (
    <div className="main-col">
      <header className="topbar">
        <p className="crumb"><b>Fleet</b></p>
        <SandboxControls />
      </header>

      <div className="workspace">
        <section className="canvas" aria-label="Agents">
          <div className="page">
            <p className="page-meta">
              {run ? <>Sandbox clock <b>{fmtDateTime(run.t)}</b> · {engine!.decisions.length} decisions · {list?.length ?? 0} alerts</> : 'Loading the sandbox…'}
            </p>

            <Frame className="table-frame">
              <table className="fleet">
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Role</th>
                    <th scope="col">State</th>
                    <th scope="col">Token</th>
                    <th scope="col">Baseline</th>
                    <th scope="col">Last 24 calls</th>
                    <th scope="col" className="r">Last</th>
                    <th scope="col">Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map(r => (
                    <tr key={r.id}>
                      <td><Link to={`/app/agents/${r.id}`} className="row-link mono">{r.id}</Link><span className="cell-sub">{r.displayName}</span></td>
                      <td><span className="mono">{r.role}</span><span className="cell-sub">charter v{r.charterVersion} · {r.owner}</span></td>
                      <td><BandChip band={STATE_BAND[r.state]} label={STATE_LABEL[r.state]} /></td>
                      <td>
                        <span className="mono">v{r.tokenVer}</span>
                        <span className="cell-sub">
                          {r.state === 'revoked' ? 'no scopes' : r.extraScopes.length
                            ? <mark className="mark" title={r.extraScopes.join(', ')}>{r.extraScopes.length} beyond charter</mark>
                            : `${r.scopes.length} ${r.scopes.length === 1 ? 'scope' : 'scopes'}, all in charter`}
                        </span>
                      </td>
                      <td className="cell-conf"><span className="num">{pct(r.confidence)}</span><Bar value={r.confidence} max={1} /></td>
                      <td><Sparkline calls={r.recent} /></td>
                      <td className="r">{r.last ? <ScoreRing score={r.last.score} band={r.last.band} size={32} /> : <span className="muted">—</span>}</td>
                      <td>{r.drift.alarmed ? <span className="tag tag-alarm">alarm</span> : <span className="num small">{r.drift.S.toFixed(1)} <span className="muted">/ {DRIFT_H}</span></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Frame>

            <h2 className="sec-h">Incidents</h2>
            <p className="sec-sub">Each one plays a scripted attack or change against this fleet. The engine scores every call as it happens.</p>
            <ul className="incidents">
              {INCIDENTS.map(inc => (
                <li key={inc.id}>
                  <span className="inc-code mono">{inc.code}</span>
                  <span className="inc-body"><b>{inc.title}</b> <span className="mono small muted">{inc.agent}</span><span className="inc-sum">{inc.summary}</span></span>
                  <button className="btn btn-line" disabled={!!busy || !run} onClick={() => store.inject(inc.id)}>Run</button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="panel" aria-label="Hold queue">
          <h2 className="panel-h">Hold queue <span className="num muted">{holds?.length ?? 0}</span></h2>
          {holds?.length ? (
            <ul className="holds">
              {holds.map(({ decision: d, offCharter }) => (
                <li key={d.id} className="hold">
                  <div className="hold-head">
                    <ScoreRing score={d.score} band={d.band} size={34} />
                    <span><b className="mono">{d.call.tool}</b><span className="cell-sub mono">{d.call.agentId} · {d.id}</span></span>
                  </div>
                  <p className="small">{d.factors.length ? [...d.factors].sort((a, b) => b.looImpact - a.looImpact)[0]!.subs.map(s => s.reason).join('; ') : 'No factor detail.'}</p>
                  <div className="hold-actions">
                    <button className="btn btn-ink" disabled={!!busy} onClick={() => store.approveHold(d.id)}>Approve</button>
                    {offCharter && <button className="btn btn-line" disabled={!!busy} onClick={() => store.approveAsRoleChange(d.id)}>Role change</button>}
                    <button className="btn btn-line" disabled={!!busy} onClick={() => store.denyHold(d.id)}>Deny</button>
                    <Link className="hold-open" to={`/app/alerts/${d.id}`}>Details</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">Nothing is waiting. Calls scoring 30–54 park here until their owner decides.</p>}

          <h2 className="panel-h">Alerts by root cause</h2>
          {list && list.length ? (
            <ul className="causes">
              {byRootCause(list).map(c => (
                <li key={c.cause}>
                  <Link to={`/app/alerts?cause=${c.cause}`}><span className="mono"><b>{c.cause}</b> {CAUSE_LABEL[c.cause]}</span></Link>
                  <Bar value={c.count} max={Math.max(...byRootCause(list).map(x => x.count))} />
                  <span className="num">{c.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">No alerts yet. Run an incident to see one.</p>}
        </aside>
      </div>
    </div>
  );
}
