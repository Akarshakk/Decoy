import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { SCENARIOS, decisionId, scenarioById } from '../data/fixtures';
import { AlertCard } from '../components/AlertCard';
import { Spine, verdictFor } from '../components/Spine';
import { BandChip, ScoreRing } from '../components/ui';
import { useConsole } from './Console';

const STEP_MS = 1300;

export function Investigate() {
  const { scenario: id } = useParams();
  const scenario = scenarioById(id);
  const navigate = useNavigate();
  const { mode, setMode, append, reset, resetKey, log } = useConsole();
  const shadow = mode === 'shadow';
  const total = scenario?.steps.length ?? 0;
  const [cursor, setCursor] = useState(1);       // number of calls played so far
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setCursor(1); setSelected(0); setPlaying(false); }, [id, resetKey]);

  const goTo = (n: number) => { setPlaying(false); setCursor(n); setSelected(n - 1); };

  useEffect(() => {
    if (!playing) return;
    if (cursor >= total) { setPlaying(false); return; }
    const t = setTimeout(() => { setCursor(c => c + 1); setSelected(cursor); }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, cursor, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, button')) return;
      if (e.key === 'ArrowRight') goTo(Math.min(total, cursor + 1));
      if (e.key === 'ArrowLeft') goTo(Math.max(1, cursor - 1));
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!scenario) return <Navigate to="/app/investigate/d2" replace />;

  const step = scenario.steps[selected]!;
  const v = verdictFor(step, shadow);
  const decId = decisionId(scenario, selected);
  const resolved = log.find(e => e.payload.decision === decId);
  const twin = scenario.twin;

  const act = (type: string, label: string) => append(type, { decision: decId, agent: step.agent, tool: step.tool, score: v.score, action: label });

  return (
    <div className="main-col">
      <header className="topbar">
        <p className="crumb">
          <span className="muted">Investigate /</span>
          <label className="select">
            <span className="sr-only">Scenario</span>
            <select value={scenario.id} onChange={e => navigate(`/app/investigate/${e.target.value}`)}>
              {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.code} · {s.title}</option>)}
            </select>
          </label>
        </p>
        <div className="topbar-actions">
          <div className="seg" role="group" aria-label="Mode">
            <button className={mode === 'enforce' ? 'is-on' : ''} aria-pressed={mode === 'enforce'} onClick={() => setMode('enforce')}>Enforce</button>
            <button className={mode === 'shadow' ? 'is-on' : ''} aria-pressed={mode === 'shadow'} onClick={() => setMode('shadow')}>Shadow</button>
          </div>
          <button className="btn btn-line" onClick={reset}>Reset sandbox</button>
        </div>
      </header>

      <div className="workspace">
        <section className="canvas" aria-label="Session">
          <div className="canvas-head">
            <p><span className="mono">{scenario.agent}</span> <span className="muted">({scenario.role})</span></p>
            <p className="muted">{scenario.summary}</p>
            {shadow && scenario.shadowNote && <p className="shadow-note"><mark className="mark">{scenario.shadowNote}</mark></p>}
          </div>

          <div className="canvas-body">
            {twin && <p className="twin-label mono">{twin.agent} <span className="muted">({twin.role})</span></p>}
            <Spine
              scenario={scenario}
              visible={cursor}
              selected={selected}
              onSelect={setSelected}
              shadow={shadow}
              renderAside={twin ? i => (i === twin.atStep && i < cursor ? (
                <div className="twin">
                  <span className="twin-cap">{twin.caption}</span>
                  <div className="twin-card">
                    <span className="call-tool">{twin.step.tool}{twin.step.arg && <span className="call-arg"> · {twin.step.arg}</span>}</span>
                    <ScoreRing score={twin.step.score} band={twin.step.band} size={30} />
                    <BandChip band={twin.step.band} />
                  </div>
                </div>
              ) : null) : undefined}
            />
          </div>

          <div className="scrubber" role="group" aria-label="Playback">
            <button className="icon-btn" onClick={() => (cursor >= total ? (goTo(1), setPlaying(true)) : setPlaying(p => !p))} aria-label={playing ? 'Pause' : 'Play'}>
              {playing
                ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="3" height="9" /><rect x="7" y="1.5" width="3" height="9" /></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 1.5v9l8-4.5z" /></svg>}
            </button>
            <span className="scrub-label">Step {cursor} of {total}</span>
            <ol className="scrub-steps">
              {scenario.steps.map((_, i) => (
                <li key={i}>
                  <button
                    className={`${i < cursor ? 'is-done' : ''} ${i === cursor - 1 ? 'is-now' : ''}`}
                    onClick={() => goTo(i + 1)}
                    aria-label={`Go to step ${i + 1}`}
                  >{i + 1}</button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="panel" aria-label="Decision">
          <AlertCard scenario={scenario} index={selected} shadow={shadow} />
          {v.band !== 'ALLOW' && !shadow && (
            <div className="actions">
              {resolved ? (
                <p className="resolved"><b>{String(resolved.payload.action)}</b> · ledger entry {resolved.seq + 1}</p>
              ) : (
                <>
                  <button className="btn btn-ink btn-block" onClick={() => act('confirm', 'Confirmed compromise')}>Confirm compromise</button>
                  <button className="btn btn-line btn-block" onClick={() => act('fp_review', 'Marked false positive')}>Mark false positive</button>
                  {v.band === 'HOLD' && <button className="btn btn-line btn-block" onClick={() => act('role_change', 'Approved as role change')}>Approve as role change</button>}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
