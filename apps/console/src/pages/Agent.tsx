import { Navigate, useNavigate, useParams } from 'react-router';
import { CONFIDENCE_K } from '@swaroop/engine';
import { AccumulatorChart, ScoreTimeline } from '../components/charts';
import { BandChip, Bar, Frame } from '../components/ui';
import { fmtDateTime, pct, STATE_BAND, STATE_LABEL } from '../live/labels';
import { useLive, useView } from '../live/react';
import { agentView } from '../live/view';

export function Agent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { store, busy, engine } = useLive();
  const ids = useView(e => e.agentIds());
  const v = useView(e => (id && e.agentIds().includes(id) ? agentView(e, id) : null), [id]);

  if (ids && (!id || !ids.includes(id))) return <Navigate to={`/app/agents/${ids[0]}`} replace />;
  if (!v || !engine) return <div className="main-col"><header className="topbar"><p className="crumb muted">Loading the sandbox…</p></header></div>;

  const { row, charter, baseline, drift } = v;
  const maxVol = Math.max(1, ...v.volume.map(b => b.mu + b.sd));

  return (
    <div className="main-col">
      <header className="topbar">
        <p className="crumb">
          <span className="muted">Agents /</span>
          <label className="select">
            <span className="sr-only">Agent</span>
            <select value={row.id} onChange={e => navigate(`/app/agents/${e.target.value}`)}>
              {ids!.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </p>
        <div className="topbar-actions">
          {drift.alarmed && <button className="btn btn-ink" disabled={!!busy} onClick={() => store.ownerReset(row.id)}>Owner reset: clear drift alarm</button>}
        </div>
      </header>

      <section className="canvas" aria-label={row.id}>
        <div className="page">
          <div className="agent-head">
            <h1 className="agent-h mono">{row.id}</h1>
            <BandChip band={STATE_BAND[row.state]} label={STATE_LABEL[row.state]} />
            <p className="muted">{row.displayName} · role <span className="mono">{row.role}</span> · owner <span className="mono">{row.owner}</span> · {row.calls} calls since the sandbox started, {row.alerts} alerts</p>
          </div>

          <Frame className="card card-wide">
            <h2 className="card-h">Every call, scored <span className="muted">dashed lines are the band edges, hairlines split sessions</span></h2>
            <ScoreTimeline decisions={v.timeline} />
          </Frame>

          <Frame className="card card-wide">
            <h2 className="card-h">Drift accumulator <span className="muted">one point per session, measured against snapshot <span className="mono">{drift.snapshot.id}</span> frozen {fmtDateTime(drift.snapshot.frozenAt)}</span></h2>
            <AccumulatorChart history={drift.history} H={drift.H} />
            <p className="small muted card-foot">
              {drift.alarmed ? 'Alarm latched: every call adds the drift factor until the owner resets it.' : `Current level ${drift.S.toFixed(2)} of ${drift.H}.`}
            </p>
          </Frame>

          <div className="cards-3">
            <Frame className="card">
              <h2 className="card-h">Charter v{charter.version} <span className="muted mono">sig {charter.sig.slice(0, 10)}…</span></h2>
              <p className="small">{charter.purpose}</p>
              <ul className="chips">{charter.tools.map(t => <li key={t} className="mono">{t}</li>)}</ul>
              <dl className="dc-facts">
                <div><dt>Data</dt><dd className="mono">{charter.dataClasses.join(', ')}</dd></div>
                <div><dt>Egress</dt><dd className="mono">{charter.egressAllow.join(', ') || 'none'}</dd></div>
                <div><dt>Max calls</dt><dd className="mono">{charter.maxCallsPerSession} per session</dd></div>
                <div><dt>Delegates</dt><dd className="mono">{charter.delegatesTo.join(', ') || 'none'}</dd></div>
              </dl>
              {v.charterHistory.length > 0 && (
                <ul className="history">
                  {v.charterHistory.map(h => <li key={h.seq} className="small">v{h.from} → v{h.to}: <span className="mono">+ {h.added.join(', ')}</span> <span className="muted">(ledger #{h.seq}, {h.decision})</span></li>)}
                </ul>
              )}
            </Frame>

            <Frame className="card">
              <h2 className="card-h">Token v{row.tokenVer} <span className="muted">{row.scopes.length} scopes held</span></h2>
              <ul className="scopes">
                {v.scopes.map(s => (
                  <li key={s.name} className={s.removedIn !== undefined ? 'is-gone' : ''}>
                    <span className="mono">{s.name}</span>
                    {s.removedIn !== undefined ? <span className="small muted">removed in v{s.removedIn}</span>
                      : s.inCharter ? <span className="small muted">in charter</span>
                      : <mark className="mark small">beyond charter</mark>}
                  </li>
                ))}
              </ul>
            </Frame>

            <Frame className="card">
              <h2 className="card-h">Baseline</h2>
              <p className="conf"><span className="conf-num num">{pct(baseline.confidence)}</span> <span className="small muted">confidence, n / (n + {CONFIDENCE_K}) with n = {baseline.n} learned transitions</span></p>
              <Bar value={baseline.confidence} max={1} />
              <dl className="dc-facts">
                <div><dt>Surprise p95</dt><dd className="mono">{baseline.tau.toFixed(2)} bits ({baseline.source === 'own' ? 'own' : baseline.source === 'peer' ? `from ${baseline.peer}` : 'default'})</dd></div>
                <div><dt>Volume</dt><dd className="mono">{v.volume[0]?.source === 'own' ? 'own bands' : v.volume[0]?.source === 'peer' ? `peer bands (${baseline.peer})` : 'not scored yet'}</dd></div>
                <div><dt>Snapshot</dt><dd className="mono">{drift.snapshot.id}</dd></div>
              </dl>
            </Frame>
          </div>

          <div className="cards-2">
            <Frame className="card">
              <h2 className="card-h">Top transitions <span className="muted">count · P(next | previous)</span></h2>
              {v.transitions.length ? (
                <table className="mini">
                  <tbody>
                    {v.transitions.map(t => (
                      <tr key={`${t.from}>${t.to}`}>
                        <td className="mono">{t.from === 'START' ? 'session start' : t.from}</td>
                        <td className="muted" aria-hidden>→</td>
                        <td className="mono">{t.to}</td>
                        <td className="num r">{t.count}</td>
                        <td className="num r">{t.p.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="small muted">No transitions learned yet: this agent is scored with its charter{baseline.peer ? ` and ${baseline.peer}'s` : ''} prior.</p>}
            </Frame>

            <Frame className="card">
              <h2 className="card-h">Volume bands <span className="muted">calls per session, mean ± 1 sd</span></h2>
              {v.volume[0]?.source === 'none' ? <p className="small muted">Not scored until this agent has 5 sessions of its own.</p> : (
                <ul className="vol">
                  {v.volume.map(b => (
                    <li key={b.tool}>
                      <span className="mono small">{b.tool}</span>
                      <span className="vol-track" aria-hidden>
                        <span className="vol-band" style={{ left: `${(Math.max(0, b.mu - b.sd) / maxVol) * 100}%`, width: `${((Math.min(maxVol, b.mu + b.sd) - Math.max(0, b.mu - b.sd)) / maxVol) * 100}%` }} />
                        <span className="vol-mu" style={{ left: `${(b.mu / maxVol) * 100}%` }} />
                      </span>
                      <span className="num small">{b.mu.toFixed(1)} ± {b.sd.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Frame>
          </div>
        </div>
      </section>
    </div>
  );
}
