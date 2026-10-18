import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LADDER, SCENARIOS, scenarioById } from '../data/fixtures';
import { shortHash, useLedger } from '../data/ledger';
import { DriftChart } from '../components/DriftChart';
import { HeroArt } from '../components/HeroArt';
import { BandChip, Kbd } from '../components/ui';

const REPO = 'https://github.com/Akarshakk/Decoy';
const PLAN = `${REPO}/blob/main/plan.md`;
const SPEC = `${REPO}/blob/main/build_execution.md`;
const D2 = scenarioById('d2')!;
const D3 = scenarioById('d3')!;

// Each chapter owns a tint: its folder tab in the hero and its segment in the header strip.
const CHAPTERS = [
  { id: 'why', label: 'Why Swaroop', tint: 'var(--t-paper)' },
  { id: 'drift', label: 'Slow drift', tint: 'var(--t-yellow)' },
  { id: 'response', label: 'Response', tint: 'var(--t-peach)' },
  { id: 'evidence', label: 'Evidence', tint: 'var(--t-sage)' },
  { id: 'try', label: 'Try it', tint: 'var(--t-mist)' },
];

function useActiveChapter() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    CHAPTERS.forEach(c => { const el = document.getElementById(c.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return active;
}

export function Landing() {
  const navigate = useNavigate();
  const active = useActiveChapter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key.toLowerCase() === 'd') navigate('/app/investigate/d2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const ledgerEntries = useMemo(
    () => D2.steps.map((s, seq) => ({ seq, type: 'decision', payload: { agent: s.agent, tool: s.tool, score: s.score, band: s.band } })),
    [],
  );
  const ledger = useLedger(ledgerEntries);

  const salary = [
    { who: 'procurement-01', role: 'procurement agent', step: D2.steps[3]!, to: '/app/investigate/d2' },
    { who: 'hr-assist-01', role: 'HR assistant', step: D3.steps[1]!, to: '/app/investigate/d3' },
  ];

  return (
    <div className="lp">
      <div className="lp-banner">
        Preview build. Scores are the reference numbers from <a href={`${REPO}/tree/main/research/sim`}>research/sim</a> until the live engine lands.
      </div>

      <header className="lp-head">
        <div className="lp-wrap lp-head-in">
          <Link to="/" className="lp-logo"><span className="lp-logo-mark" aria-hidden /><span>Swaroop</span></Link>
          <nav className="lp-nav" aria-label="Primary">
            <a href="#why">Why Swaroop</a>
            <a href="#drift">Slow drift</a>
            <Link to="/app/investigate/d2">Console</Link>
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
          <div className="lp-hero-art"><HeroArt /></div>
        </div>
        <nav className="lp-wrap lp-tabs" aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <a key={c.id} href={`#${c.id}`} className="lp-tab" style={{ zIndex: CHAPTERS.length - i }}>
              <svg viewBox="0 0 232 64" preserveAspectRatio="none" aria-hidden>
                <path d="M0.5 64 V12 Q0.5 0.5 12 0.5 H200 L231.5 64" style={{ fill: c.tint }} vectorEffect="non-scaling-stroke" />
              </svg>
              <span>{c.label}</span>
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
                <span className="lp-stat-num">{s.step.score}</span>
                <span className="lp-stat-cap"><code>hr.read_salary</code> by the {s.role}</span>
                <span className="lp-meter" aria-hidden>
                  <span className={`lp-meter-fill fill-${s.step.band === 'ALLOW' ? 'allow' : 'down'}`} style={{ width: `${Math.max(s.step.score, 1.5)}%` }} />
                  {[30, 55, 75, 90].map(t => <i key={t} style={{ left: `${t}%` }} />)}
                </span>
                <span className="lp-stat-foot"><BandChip band={s.step.band} /><span className="mono">{s.who}</span></span>
              </Link>
            ))}
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
          <DriftChart />
        </div>
      </section>

      <section id="response" className="lp-sec lp-sec-tight">
        <div className="lp-wrap">
          <div className="lp-split">
            <h2 className="lp-h2 lp-h2-lg">The smallest restriction that removes the risk.</h2>
            <p>
              A score picks one of five responses. The down-scoped agent in D2 loses its HR and upload scopes and
              keeps working: its next price lookup goes through.
            </p>
          </div>
          <ol className="lp-ladder" aria-label="Response ladder">
            {LADDER.map(l => (
              <li key={l.band}>
                <span className="num">{l.band === 'REVOKE' ? '90+' : `${l.from}–${l.to}`}</span>
                <BandChip band={l.band} />
                <span className="lp-ladder-fx">{l.effect}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="evidence" className="lp-dark">
        <div className="lp-wrap lp-narrow">
          <ol className="lp-chain" aria-hidden>
            {ledgerEntries.map((_, i) => (
              <li key={i} className={i === ledgerEntries.length - 1 ? 'is-head' : ''}>
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
              This page just chained the {ledger.count} D2 decisions in your browser.
              Head <code>{shortHash(ledger.head)}</code>, {ledger.verified ? 'linkage verified.' : 'verifying…'}{' '}
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
              Replay D2: a supplier PDF hides an instruction, the salary read scores 69 and is down-scoped, the
              upload scores 72 and is quarantined, and the next price lookup still works.
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
              {SCENARIOS.slice(0, 5).map(s => <Link key={s.id} to={`/app/investigate/${s.id}`}>{s.code} {s.title}</Link>)}
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
