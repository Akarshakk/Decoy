import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BANDS, DRIFT_H, verifyChain, type Band, type Decision } from '@swaroop/engine';
import { DriftChart } from '../components/DriftChart';
import { HeroArt } from '../components/HeroArt';
import { BandChip, Kbd } from '../components/ui';
import { runScenario, SCENARIO_LIST, type ScenarioView } from '../live/scenarios';

const REPO = 'https://github.com/Akarshakk/Decoy';
const PLAN = `${REPO}/blob/main/plan.md`;
const SPEC = `${REPO}/blob/main/build_execution.md`;

const EFFECT: Record<Band, string> = {
  ALLOW: 'Runs normally',
  HOLD: 'Parked until the owner approves, with the evidence attached',
  DOWN_SCOPE: 'Blocked; token re-issued without the risky scopes',
  QUARANTINE: 'Blocked; token cut to in-role reads only',
  REVOKE: 'Token revoked, delegated child tokens revoked with it',
};
// The ladder straight from the engine's BANDS table.
const LADDER = [...BANDS].reverse().map(([from, band], i, all) => ({ from, to: all[i + 1] ? all[i + 1]![0] - 1 : 100, band }));

interface LandingData {
  d2: ScenarioView;
  read: Decision;          // hr.read_salary by procurement (D2)
  post: Decision;          // http.post to the PDF's host (D2)
  after: Decision;         // the in-role call after the quarantine (D2)
  hrRead: Decision;        // hr.read_salary by the HR assistant (D3)
  drift: ScenarioView['drift'] & object;
  alarmAt: number | null;
  ledger: { count: number; head: string; ok: boolean; kinds: string };
}

const KIND: Record<string, [string, string]> = { decision: ['decision', 'decisions'], token_reissue: ['token re-issue', 'token re-issues'], drift_alarm: ['drift alarm', 'drift alarms'] };
const kinds = (types: string[]) => [...new Set(types)].map(t => { const n = types.filter(x => x === t).length; const [one, many] = KIND[t] ?? [t, t]; return `${n} ${n === 1 ? one : many}`; }).join(', ');

// The landing page plays D2, D3 and D6 on fresh sandboxes in the browser; every number below comes from those runs.
function useLandingData() {
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [d2, d3, d6] = await Promise.all([runScenario('d2'), runScenario('d3'), runScenario('d6')]);
      const tool = (v: ScenarioView, t: string) => v.steps.find(s => s.tool === t)!.decision;
      const recs = d2.engine.ledgerRecords();
      const alarm = d6.drift!.findIndex(x => x.alarm);
      const next: LandingData = {
        d2, read: tool(d2, 'hr.read_salary'), post: tool(d2, 'http.post'), after: d2.steps.at(-1)!.decision, hrRead: tool(d3, 'hr.read_salary'),
        drift: alarm >= 0 ? d6.drift!.slice(0, alarm + 1) : d6.drift!, alarmAt: alarm >= 0 ? alarm + 1 : null,
        ledger: { count: recs.length, head: recs.at(-1)!.hash, ok: (await verifyChain(recs)) === null, kinds: kinds(recs.map(r => r.type)) },
      };
      if (live) setData(next);
    })();
    return () => { live = false; };
  }, []);
  return data;
}

// Each chapter owns a tint: its folder tab in the hero and its segment in the header strip.
const chapters = (d: LandingData | null) => [
  { id: 'why', label: 'Why Swaroop', hint: d ? `${d.read.score} vs ${d.hrRead.score}, same call` : 'same call, two roles', tint: 'var(--t-paper)' },
  { id: 'drift', label: 'Slow drift', hint: d?.alarmAt ? `alarm at session ${d.alarmAt}` : 'drift across sessions', tint: 'var(--t-yellow)' },
  { id: 'response', label: 'Response', hint: 'five bands, 0 to 100', tint: 'var(--t-peach)' },
  { id: 'evidence', label: 'Evidence', hint: 'hash-chained ledger', tint: 'var(--t-sage)' },
  { id: 'try', label: 'Try it', hint: 'replay D2 live', tint: 'var(--t-mist)' },
];
const CHAPTER_IDS = chapters(null).map(c => c.id);

function useActiveChapter() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    CHAPTER_IDS.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return active;
}

export function Landing() {
  const navigate = useNavigate();
  const active = useActiveChapter();
  const data = useLandingData();
  const CHAPTERS = chapters(data);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key.toLowerCase() === 'd') navigate('/app/investigate/d2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const salary = data ? [
    { who: 'procurement-01', role: 'procurement agent', d: data.read, to: '/app/investigate/d2' },
    { who: 'hr-assist-01', role: 'HR assistant', d: data.hrRead, to: '/app/investigate/d3' },
  ] : [];

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-wrap lp-head-in">
          <Link to="/" className="lp-logo"><span className="lp-logo-mark" aria-hidden /><span>Swaroop</span></Link>
          <nav className="lp-nav" aria-label="Primary">
            <a href="#why">Why Swaroop</a>
            <a href="#drift">Slow drift</a>
            <Link to="/app/fleet">Console</Link>
            <a href={REPO}>GitHub</a>
          </nav>
          <div className="lp-head-actions">
            <a href={PLAN} className="pill pill-line">Read the plan</a>
            <Link to="/app/investigate/d2" className="pill pill-ink">Open console</Link>
          </div>
        </div>
        <ol className="lp-strip" aria-hidden>
          {CHAPTERS.map(c => <li key={c.id} style={{ background: c.tint }} className={active === c.id ? 'is-on' : ''} />)}
        </ol>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <p className="lp-badge">
              <span className="lp-logo-mark" aria-hidden />
              <span><b>Swaroop</b> <span lang="hi" className="deva">स्वरूप</span><br />Identity drift detection for AI agents</span>
            </p>
            <h1 className="lp-h1">Valid token.<br /><span className="lp-mark">Wrong behaviour.</span></h1>
            <p className="lp-lede">
              Swaroop learns how each AI agent normally behaves, checks every tool call against the role it was
              created for, and steps in the moment it drifts.
            </p>
            <div className="lp-ctas">
              <Link to="/app/investigate/d2" className="pill pill-ink pill-lg">Run the live demo <Kbd>D</Kbd></Link>
              <a href="#why" className="lp-textlink">See why credentials aren’t enough</a>
            </div>
          </div>
          <div className="lp-hero-art"><HeroArt read={data?.read} post={data?.post} /></div>
        </div>
        <nav className="lp-wrap lp-tabs" aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <a key={c.id} href={`#${c.id}`} className="lp-tab" style={{ zIndex: CHAPTERS.length - i }}>
              <svg viewBox="0 0 232 64" preserveAspectRatio="none" aria-hidden>
                <path d="M0.5 64 V12 Q0.5 0.5 12 0.5 H200 L231.5 64" style={{ fill: c.tint }} vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="lp-tab-label"><span className="lp-tab-n">0{i + 1}</span>{c.label}</span>
              <span className="lp-tab-hint">{c.hint}</span>
            </a>
          ))}
        </nav>
      </section>

      <section id="why" className="lp-sec">
        <div className="lp-wrap">
          <p className="lp-statement">
            <span className="lp-soft">Credentials prove who an agent is.</span>{' '}
            They can’t tell you it has been turned. One hidden line in a supplier PDF, and a procurement agent
            is reading salaries with a perfectly valid token.
          </p>

          <div className="lp-contrast">
            <div className="lp-contrast-text">
              <h2 className="lp-h2">Same action. Same kind of token. Different verdict.</h2>
              <p>Both agents call <code>hr.read_salary</code>. Only one of them was created to. Swaroop scores the call against the role and the agent’s own history, so the verdicts split.</p>
            </div>
            {salary.map(s => (
              <Link key={s.who} to={s.to} className="lp-stat">
                <span className="lp-stat-num">{s.d.score}</span>
                <span className="lp-stat-cap"><code>hr.read_salary</code> by the {s.role}</span>
                <span className="lp-meter" aria-hidden>
                  <span className={`lp-meter-fill fill-${s.d.band === 'ALLOW' ? 'allow' : 'down'}`} style={{ width: `${Math.max(s.d.score, 1.5)}%` }} />
                  {LADDER.slice(1).map(l => <i key={l.from} style={{ left: `${l.from}%` }} />)}
                </span>
                <span className="lp-stat-foot"><BandChip band={s.d.band} /><span className="mono">{s.who}</span></span>
              </Link>
            ))}
            {!data && <p className="lp-loading muted">Playing D2 and D3 in your browser…</p>}
          </div>
        </div>
      </section>

      <section id="drift" className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-split">
            <h2 className="lp-h2 lp-h2-lg">No single call looks wrong. The pattern does.</h2>
            <p>
              A stolen token adds one report export at a time. Every call stays under the hold line, so a per-call
              check never fires. Swaroop keeps a running drift score across sessions against a frozen snapshot of
              normal, and it doesn’t reset when the session ends.
            </p>
          </div>
          {data ? <DriftChart data={data.drift} h={DRIFT_H} agent="procurement-01" /> : <p className="lp-loading muted">Playing D6 in your browser…</p>}
        </div>
      </section>

      <section id="response" className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <div className="lp-split">
            <h2 className="lp-h2 lp-h2-lg">The smallest restriction that removes the risk.</h2>
            <p>
              A score picks one of five responses.{data && <> In D2 the {data.read.score} down-scope removes {data.read.tokenAction.removed?.length ?? 0} scopes
              from the token and the agent keeps working: its next call, <code>{data.after.call.tool}</code>, scores {data.after.score} and runs.</>}
            </p>
          </div>
          <ol className="lp-ladder" aria-label="Response ladder">
            {LADDER.map(l => (
              <li key={l.band}>
                <span className="num">{l.to === 100 ? `${l.from}+` : `${l.from}–${l.to}`}</span>
                <BandChip band={l.band} />
                <span className="lp-ladder-fx">{EFFECT[l.band]}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="evidence" className="lp-dark">
        <div className="lp-wrap lp-narrow">
          <ol className="lp-chain" aria-hidden>
            {Array.from({ length: data?.ledger.count ?? 0 }, (_, i) => (
              <li key={i} className={i === (data?.ledger.count ?? 0) - 1 ? 'is-head' : ''}>
                <svg viewBox="0 0 60 36"><rect x=".75" y=".75" width="58.5" height="34.5" rx="6" /><path d="M9 11h30 M9 18h36 M9 25h20" /><circle cx="49" cy="11" r="3.5" /></svg>
              </li>
            ))}
          </ol>
          <h2 className="lp-dark-h">Every verdict stays on the record.</h2>
          <div className="lp-dark-cols">
            <p>
              Each decision is appended to a hash-chained ledger. Every entry’s hash covers the one before it, so
              editing any row breaks the chain. IBANs and email addresses are masked before they are hashed.
            </p>
            <p className="lp-dark-live">
              {data ? <>This page just played D2 in your browser: {data.ledger.count} ledger records ({data.ledger.kinds}),
              head <code>{data.ledger.head.slice(0, 4)}…{data.ledger.head.slice(-4)}</code>, {data.ledger.ok ? 'every hash re-derived and verified.' : 'verification FAILED.'}</> : 'Playing D2 in your browser…'}{' '}
              <a href={`${SPEC}#54-ledger`}>How the ledger works</a>
            </p>
          </div>
        </div>
      </section>

      <section id="try" className="lp-cta">
        <div className="lp-wrap lp-narrow lp-cta-in">
          <h2 className="lp-cta-h">Watch a hijack get stopped.</h2>
          <div className="lp-cta-row">
            <p>
              Replay D2: a supplier PDF hides an instruction{data ? <>, the salary read scores {data.read.score} and is
              down-scoped, the upload scores {data.post.score} and is quarantined, and the next price lookup still works</> : ''}.
            </p>
            <Link to="/app/investigate/d2" className="pill pill-ink pill-lg">Open the D2 investigation</Link>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-narrow">
          <div className="lp-foot-cols">
            <div>
              <h3>Console</h3>
              <Link to="/app/investigate/d2">Investigate</Link>
              <Link to="/app/fleet">Fleet</Link>
              <Link to="/app/agents">Agents</Link>
              <Link to="/app/evals">Evaluations</Link>
            </div>
            <div>
              <h3>Concepts</h3>
              <a href={PLAN}>Six detectors</a>
              <a href={`${SPEC}#53-orchestrator`}>Response ladder</a>
              <a href={`${SPEC}#54-ledger`}>Ledger</a>
              <a href={`${SPEC}#56-learning-and-change-management`}>Role changes</a>
            </div>
            <div>
              <h3>Scenarios</h3>
              {SCENARIO_LIST.slice(1, 6).map(s => <Link key={s.id} to={`/app/investigate/${s.id}`}>{s.code} {s.title}</Link>)}
            </div>
            <div>
              <h3>Project</h3>
              <a href={REPO}>GitHub repository</a>
              <a href={PLAN}>Plan</a>
              <a href={SPEC}>Build spec</a>
              <a href={`${REPO}/blob/main/ui_references.md`}>UI references</a>
            </div>
          </div>
          <div className="lp-foot-base">
            <span className="lp-logo"><span className="lp-logo-mark" aria-hidden /><span>Swaroop</span></span>
            <p>Known limits: traffic that bypasses the gateway, and an attacker who behaves exactly like the agent’s normal pattern.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
