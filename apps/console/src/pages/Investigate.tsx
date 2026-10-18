import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { DRIFT_H } from '@swaroop/engine';
import { ModeCompareChart } from '../components/charts';
import { DecisionCard } from '../components/DecisionCard';
import { DriftChart } from '../components/DriftChart';
import { Spine } from '../components/Spine';
import { BandChip, Frame, ScoreRing } from '../components/ui';
import { useLive } from '../live/react';
import { runScenario, SCENARIO_LIST, type ScenarioView } from '../live/scenarios';

const STEP_MS = 1300;

/** Both modes of one scenario, each played on its own fresh sandbox (cached after the first run). */
function useScenario(id: string | undefined) {
  const [state, setState] = useState<{ id: string; enforce: ScenarioView; shadow: ScenarioView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !SCENARIO_LIST.some(s => s.id === id)) return;
    let live = true;
    Promise.all([runScenario(id, 'enforce'), runScenario(id, 'shadow')])
      .then(([enforce, shadow]) => live && setState({ id, enforce, shadow }))
      .catch(e => live && setError(String(e)));
    return () => { live = false; };
  }, [id]);
  return { data: state?.id === id ? state : null, error };
}

export function Investigate() {
  const { scenario: id } = useParams();
  const navigate = useNavigate();
  const { mode, store } = useLive();
  const shadow = mode === 'shadow';
  const { data, error } = useScenario(id);
  const view = data ? (shadow ? data.shadow : data.enforce) : null;
  const total = view?.steps.length ?? 0;
  const [cursor, setCursor] = useState(1);       // number of calls played so far
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setCursor(1); setSelected(0); setPlaying(false); }, [id]);

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

  if (!SCENARIO_LIST.some(s => s.id === id)) return <Navigate to="/app/investigate/d2" replace />;
  const meta = SCENARIO_LIST.find(s => s.id === id)!;

  const header = (
    <header className="topbar">
      <p className="crumb">
        <span className="muted">Investigate /</span>
        <label className="select">
          <span className="sr-only">Scenario</span>
          <select value={meta.id} onChange={e => navigate(`/app/investigate/${e.target.value}`)}>
            {SCENARIO_LIST.map(s => <option key={s.id} value={s.id}>{s.code} · {s.title}</option>)}
          </select>
        </label>
      </p>
      <div className="topbar-actions">
        <div className="seg" role="group" aria-label="Mode">
          <button className={!shadow ? 'is-on' : ''} aria-pressed={!shadow} onClick={() => store.setMode('enforce')}>Enforce</button>
          <button className={shadow ? 'is-on' : ''} aria-pressed={shadow} onClick={() => store.setMode('shadow')}>Shadow</button>
        </div>
      </div>
    </header>
  );

  if (!view || !data) {
    return <div className="main-col">{header}<div className="empty"><p>{error ?? `Playing ${meta.code} on a fresh sandbox…`}</p></div></div>;
  }

  const step = view.steps[Math.min(selected, total - 1)]!;
  const twin = view.twin;
  const blocked = view.steps.filter(s => !s.decision.executed).length;

  return (
    <div className="main-col">
      {header}
      <div className="workspace">
        <section className="canvas" aria-label="Session">
          <div className="canvas-head">
            <p><span className="mono">{view.agent}</span> <span className="muted">({view.role})</span></p>
            <p className="muted">{view.summary}</p>
            <p className="inv-facts small">
              Played live on a fresh sandbox: {total} calls shown, {blocked} not run
              {view.egress.length ? <>, <mark className="mark">left the building: {view.egress.join(', ')}</mark></> : ', nothing sent outside'}.
            </p>
          </div>

          <div className="inv-charts">
            {view.drift && (
              <Frame className="card">
                <DriftChart data={view.drift.slice(0, view.drift.findIndex(d => d.alarm) + 1 || undefined)} h={DRIFT_H} agent={view.agent} />
              </Frame>
            )}
            <Frame className="card">
              <h2 className="card-h">Score per step <span className="muted">{view.drift ? 'the session after the alarm' : 'this session'}, enforced and in shadow mode</span></h2>
              <ModeCompareChart enforce={data.enforce.steps.map(s => s.decision)} shadow={data.shadow.steps.map(s => s.decision)} cursor={selected} visible={cursor} onPick={i => goTo(i + 1)} />
            </Frame>
          </div>

          <div className="canvas-body">
            {twin && <p className="twin-label mono">{twin.agent} <span className="muted">({twin.role})</span></p>}
            <Spine
              steps={view.steps}
              mainAgent={view.agent}
              taint={view.taint}
              visible={cursor}
              selected={selected}
              onSelect={setSelected}
              shadow={shadow}
              renderAside={twin ? i => (i === twin.atStep && i < cursor ? (
                <div className="twin">
                  <span className="twin-cap">{twin.caption}</span>
                  <div className="twin-card">
                    <span className="call-tool">{twin.decision.call.tool}</span>
                    <ScoreRing score={twin.decision.score} band={twin.decision.band} size={30} />
                    <BandChip band={twin.decision.band} />
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
              {view.steps.map((s, i) => (
                <li key={s.decision.id}>
                  <button className={`${i < cursor ? 'is-done' : ''} ${i === cursor - 1 ? 'is-now' : ''}`} onClick={() => goTo(i + 1)} aria-label={`Go to step ${i + 1}`}>{i + 1}</button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="panel" aria-label="Decision">
          <DecisionCard key={`${view.mode}:${step.decision.id}`} decision={step.decision} engine={view.engine} readOnly />
          <p className="small muted inv-act">This replay runs on its own sandbox. To approve, deny or revoke, run the incident on the <Link to="/app/fleet">fleet</Link>.</p>
        </aside>
      </div>
    </div>
  );
}
