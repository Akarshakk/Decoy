import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { DecisionCard } from '../components/DecisionCard';
import { BandChip, ScoreRing } from '../components/ui';
import { CAUSE_LABEL, fmtDateTime, STATUS_LABEL } from '../live/labels';
import { useLive, useView } from '../live/react';
import { alerts, byRootCause, type Cause } from '../live/view';
import { SandboxControls } from './Console';

export function Alerts() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { engine } = useLive();
  const all = useView(alerts);
  const cause = params.get('cause') as Cause | null;
  const list = all?.filter(a => !cause || a.cause === cause) ?? [];
  const selected = all?.find(a => a.decision.id === id) ?? list[0] ?? null;
  const decision = selected?.decision ?? (id && engine ? engine.decisions.find(d => d.id === id) : undefined);

  return (
    <div className="main-col">
      <header className="topbar">
        <p className="crumb"><b>Alerts</b> <span className="muted">{all ? `${all.length} total` : ''}</span></p>
        <SandboxControls />
      </header>

      <div className="workspace">
        <section className="canvas" aria-label="Alert list">
          <div className="page">
            {all && all.length > 0 && (
              <div className="filters" role="group" aria-label="Filter by root cause">
                <button className={!cause ? 'is-on' : ''} aria-pressed={!cause} onClick={() => setParams({})}>All <span className="num">{all.length}</span></button>
                {byRootCause(all).map(c => (
                  <button key={c.cause} className={cause === c.cause ? 'is-on' : ''} aria-pressed={cause === c.cause} onClick={() => setParams({ cause: c.cause })}>
                    <span className="mono">{c.cause}</span> {CAUSE_LABEL[c.cause]} <span className="num">{c.count}</span>
                  </button>
                ))}
              </div>
            )}

            {!all ? <p className="muted">Loading the sandbox…</p> : all.length === 0 ? (
              <div className="empty empty-left">
                <p className="empty-h">No alerts yet.</p>
                <p>Every call so far scored under 30 with valid credentials. Run an incident from the fleet to see one.</p>
                <p><Link to="/app/fleet" className="btn btn-ink">Open the fleet</Link></p>
              </div>
            ) : (
              <ul className="alert-list">
                {list.map(a => {
                  const d = a.decision;
                  return (
                    <li key={d.id}>
                      <button
                        className={`alert-row ${selected?.decision.id === d.id ? 'is-selected' : ''}`}
                        aria-current={selected?.decision.id === d.id}
                        onClick={() => navigate(`/app/alerts/${d.id}${cause ? `?cause=${cause}` : ''}`)}
                      >
                        <ScoreRing score={d.score} band={d.band} size={34} />
                        <span className="ar-main">
                          <span className="mono"><b>{d.call.tool}</b> · {d.call.agentId}</span>
                          <span className="cell-sub">{a.cause ? <><span className="mono">{a.cause}</span> {CAUSE_LABEL[a.cause]}</> : 'no root cause'} · {fmtDateTime(d.call.ts)} · <span className="mono">{d.id}</span></span>
                        </span>
                        <span className="ar-side">
                          <BandChip band={d.band} prefix={a.status === 'shadow' ? 'Would ' : undefined} />
                          <span className={`tag ${a.status === 'held' ? 'tag-alarm' : ''}`}>{STATUS_LABEL[a.status]}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="panel" aria-label="Alert detail">
          {decision && engine ? <DecisionCard key={decision.id} decision={decision} engine={engine} /> : <p className="muted small">Select an alert to see why it fired.</p>}
        </aside>
      </div>
    </div>
  );
}
