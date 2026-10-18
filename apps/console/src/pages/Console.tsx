import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { shortHash, useLedger, type LedgerEntry } from '../data/ledger';

export type Mode = 'enforce' | 'shadow';

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

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/app/fleet', label: 'Fleet', icon: <path d="M2.5 7.5 8 3l5.5 4.5V13h-11z M6.5 13V9.5h3V13" /> },
  { to: '/app/investigate/d2', label: 'Investigate', icon: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></> },
  { to: '/app/agents', label: 'Agents', icon: <><rect x="3" y="5" width="10" height="8" /><path d="M8 2.5V5 M6 9h.01 M10 9h.01" /></> },
  { to: '/app/alerts', label: 'Alerts', icon: <><path d="M8 2.5 14 13H2z" /><path d="M8 7v2.5 M8 11.2h.01" /></> },
  { to: '/app/ledger', label: 'Ledger', icon: <><rect x="2.5" y="3" width="11" height="10" /><path d="M5 6h6 M5 8.5h6 M5 11h3" /></> },
  { to: '/app/evals', label: 'Evaluations', icon: <path d="M6 2.5h4 M7 2.5V7l-3.5 6.5h9L9 7V2.5" /> },
];

export function ConsoleShell() {
  const [mode, setMode] = useState<Mode>('enforce');
  const [log, setLog] = useState<LedgerEntry[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const ledger = useLedger(log);
  const { pathname } = useLocation();

  const state = useMemo<ConsoleState>(() => ({
    mode, setMode, log, resetKey,
    append: (type, payload) => setLog(l => [...l, { seq: l.length, type, payload }]),
    reset: () => { setMode('enforce'); setLog([]); setResetKey(k => k + 1); },
  }), [mode, log, resetKey]);

  return (
    <Ctx.Provider value={state}>
      <div className="console">
        <aside className="side">
          <Link to="/" className="brand side-brand"><span className="brand-name">Swaroop</span></Link>
          <nav className="side-nav" aria-label="Console">
            {NAV.map(n => (
              <NavLink
                key={n.to} to={n.to}
                className={({ isActive }) => (isActive || (n.label === 'Investigate' && pathname.startsWith('/app/investigate')) ? 'is-active' : '')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>{n.icon}</svg>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-status">
            <p><span className="muted">Mode</span> <b>{mode === 'enforce' ? 'Enforce' : 'Shadow'}</b></p>
            <hr className="rule" />
            <p><span className="muted">Ledger</span> {log.length ? (ledger.verified ? '✓ verified' : 'verifying…') : 'empty'}</p>
            {log.length > 0 && <p className="mono small muted">{ledger.count} {ledger.count === 1 ? 'entry' : 'entries'} · {shortHash(ledger.head)}</p>}
          </div>
        </aside>
        <Outlet />
      </div>
    </Ctx.Provider>
  );
}

const PLANNED: Record<string, string> = {
  fleet: 'Agent table with role, state, live score and sparkline, plus the hold queue.',
  agents: 'Charter, token scopes, baseline confidence and the drift accumulator per agent.',
  alerts: 'Every decision above Allow, grouped by root-cause factor.',
  ledger: 'The hash chain, with verify and a tamper demo.',
  evals: 'Ablations, benign disruption, time to detect, latency and expected misses from the eval harness.',
};

export function Planned({ page }: { page: keyof typeof PLANNED }) {
  return (
    <div className="main-col">
      <header className="topbar"><p className="crumb"><b>{NAV.find(n => n.to.endsWith(page))?.label ?? page}</b></p></header>
      <div className="empty">
        <p className="empty-h">Not built yet.</p>
        <p>{PLANNED[page]}</p>
        <p><Link to="/app/investigate/d2" className="btn btn-ink">Open the D2 investigation</Link></p>
      </div>
    </div>
  );
}
