import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import type { LedgerEntry } from '../data/ledger';
import { fmtDateTime } from '../live/labels';
import { LiveProvider, useLive } from '../live/react';
import type { Mode } from '../live/store';

export type { Mode };

// Investigate still replays the reference-sim fixtures and keeps their own action log (step 4 moves it onto the engine).
interface ConsoleState {
  mode: Mode;
  setMode: (m: Mode) => void;
  log: LedgerEntry[];
  append: (type: string, payload: Record<string, unknown>) => void;
  reset: () => void;
  resetKey: number;
}

const Ctx = createContext<ConsoleState | null>(null);
export const useConsole = () => useContext(Ctx)!;

const NAV: { to: string; label: string; match: string; icon: ReactNode }[] = [
  { to: '/app/fleet', label: 'Fleet', match: '/app/fleet', icon: <path d="M2.5 7.5 8 3l5.5 4.5V13h-11z M6.5 13V9.5h3V13" /> },
  { to: '/app/investigate/d2', label: 'Investigate', match: '/app/investigate', icon: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></> },
  { to: '/app/agents', label: 'Agents', match: '/app/agents', icon: <><rect x="3" y="5" width="10" height="8" /><path d="M8 2.5V5 M6 9h.01 M10 9h.01" /></> },
  { to: '/app/alerts', label: 'Alerts', match: '/app/alerts', icon: <><path d="M8 2.5 14 13H2z" /><path d="M8 7v2.5 M8 11.2h.01" /></> },
  { to: '/app/ledger', label: 'Ledger', match: '/app/ledger', icon: <><rect x="2.5" y="3" width="11" height="10" /><path d="M5 6h6 M5 8.5h6 M5 11h3" /></> },
  { to: '/app/evals', label: 'Evaluations', match: '/app/evals', icon: <path d="M6 2.5h4 M7 2.5V7l-3.5 6.5h9L9 7V2.5" /> },
];

export function ConsoleShell() {
  return <LiveProvider><Shell /></LiveProvider>;
}

function Shell() {
  const live = useLive();
  const [log, setLog] = useState<LedgerEntry[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const { pathname } = useLocation();

  const state = useMemo<ConsoleState>(() => ({
    mode: live.mode, setMode: m => live.store.setMode(m), log, resetKey,
    append: (type, payload) => setLog(l => [...l, { seq: l.length, type, payload }]),
    reset: () => { live.store.reset(); setLog([]); setResetKey(k => k + 1); },
  }), [live.mode, live.store, log, resetKey]);

  const { ledger } = live;
  const pending = live.engine ? [...live.engine.holds.values()].filter(h => h.status === 'pending').length : 0;

  return (
    <Ctx.Provider value={state}>
      <div className="console">
        <aside className="side">
          <Link to="/" className="brand side-brand"><span className="brand-name">Swaroop</span></Link>
          <nav className="side-nav" aria-label="Console">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} className={() => (pathname.startsWith(n.match) ? 'is-active' : '')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>{n.icon}</svg>
                {n.label}
                {n.label === 'Alerts' && pending > 0 && <span className="side-count" aria-label={`${pending} waiting for an owner`}>{pending}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="side-status" aria-live="polite">
            <p><span className="muted">Mode</span> <b>{live.mode === 'enforce' ? 'Enforce' : 'Shadow'}</b></p>
            <hr className="rule" />
            <p>
              <span className="muted">Ledger</span>
              <Link to="/app/ledger">{ledger.ok === null ? 'verifying…' : ledger.ok ? '✓ verified' : `✕ breaks at #${ledger.brokenAt}`}</Link>
            </p>
            {ledger.count > 0 && <p className="mono small muted">{ledger.count} records · head {ledger.head!.slice(0, 6)}</p>}
            <hr className="rule" />
            <p className="small side-clock"><span className="muted">Sandbox clock</span> <span>{live.run ? fmtDateTime(live.run.t) : '…'}</span></p>
            {live.busy && <p className="small side-busy">{live.busy}…</p>}
            {live.error && <p className="small side-err">{live.error}</p>}
          </div>
        </aside>
        <Outlet />
      </div>
    </Ctx.Provider>
  );
}

export function Planned({ page }: { page: string }) {
  const PLANNED: Record<string, string> = {
    evals: 'Ablations, benign disruption, time to detect, latency and expected misses from the eval harness.',
  };
  return (
    <div className="main-col">
      <header className="topbar"><p className="crumb"><b>{NAV.find(n => n.to.endsWith(page))?.label ?? page}</b></p></header>
      <div className="empty">
        <p className="empty-h">Not built yet.</p>
        <p>{PLANNED[page]}</p>
        <p><Link to="/app/fleet" className="btn btn-ink">Open the fleet</Link></p>
      </div>
    </div>
  );
}

/** Enforce/Shadow switch, workday and reset: the sandbox controls shared by the live pages. */
export function SandboxControls() {
  const { store, mode, busy } = useLive();
  return (
    <div className="topbar-actions">
      <div className="seg" role="group" aria-label="Mode">
        <button className={mode === 'enforce' ? 'is-on' : ''} aria-pressed={mode === 'enforce'} onClick={() => store.setMode('enforce')}>Enforce</button>
        <button className={mode === 'shadow' ? 'is-on' : ''} aria-pressed={mode === 'shadow'} onClick={() => store.setMode('shadow')}>Shadow</button>
      </div>
      <button className="btn btn-line" disabled={!!busy} onClick={() => store.workday()}>Run a workday</button>
      <button className="btn btn-line" disabled={!!busy} onClick={() => store.reset()}>Reset sandbox</button>
    </div>
  );
}
