import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LADDER, scenarioById } from '../data/fixtures';
import { HeroArt } from '../components/HeroArt';
import { Spine } from '../components/Spine';
import { BandChip, Frame, Kbd } from '../components/ui';

const REPO = 'https://github.com/Akarshakk/Decoy';
const PLAN = `${REPO}/blob/main/plan.md`;
const D2 = scenarioById('d2')!;
const D3 = scenarioById('d3')!;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plays the D2 session once, the first time the replay scrolls into view.
function useReplay(total: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => (reducedMotion() ? total : 0));
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setStarted(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!started || visible >= total) return;
    const t = setTimeout(() => setVisible(v => v + 1), visible === 0 ? 200 : 520);
    return () => clearTimeout(t);
  }, [started, visible, total]);
  return { ref, visible };
}

export function Landing() {
  const navigate = useNavigate();
  const replay = useReplay(D2.steps.length);
  const [selected, setSelected] = useState(3);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key.toLowerCase() === 'd') navigate('/app/investigate/d2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

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
            <a href="#problem">The problem</a>
            <a href="#verdict">How a verdict works</a>
            <Link to="/app/investigate/d2">Console</Link>
            <a href={REPO}>GitHub</a>
          </nav>
          <div className="lp-head-actions">
            <a href={PLAN} className="pill pill-line">Read the plan</a>
            <Link to="/app/investigate/d2" className="pill pill-ink">Open console</Link>
          </div>
        </div>
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
              <a href="#verdict" className="lp-textlink">See how scoring works</a>
            </div>
          </div>
          <div className="lp-hero-art"><HeroArt /></div>
        </div>
      </section>

      <section id="problem" className="lp-sec">
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

      <section id="verdict" className="lp-sec lp-sec-alt">
        <div className="lp-wrap">
          <Frame className="lp-card">
            <div className="lp-card-text">
              <h2 className="lp-h2">Watch a hijack get stopped mid-session.</h2>
              <p>
                The poisoned PDF is read and marked untrusted. The salary read scores 69 and the token loses its HR
                scopes. The upload scores 72, a second strike, and the agent is cut to in-role reads. The next price
                lookup still works.
              </p>
              <Link to="/app/investigate/d2" className="pill pill-ink pill-lg">Open the investigation</Link>
              <p className="lp-fine">Every score explains itself: each factor shows how far the score drops without it. No LLM decides anything.</p>
            </div>
            <div className="lp-card-demo" ref={replay.ref}>
              <Spine scenario={D2} visible={replay.visible} selected={selected} onSelect={setSelected} compact />
            </div>
          </Frame>

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

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span><b>Swaroop</b> · identity drift detection for AI agents</span>
          <span className="lp-foot-links">
            <a href={REPO}>GitHub</a><a href={PLAN}>Plan</a><Link to="/app/evals">Evaluations</Link>
          </span>
        </div>
        <p className="lp-wrap lp-limits">Known limits: traffic that bypasses the gateway, and an attacker who behaves exactly like the agent’s normal pattern.</p>
      </footer>
    </div>
  );
}
