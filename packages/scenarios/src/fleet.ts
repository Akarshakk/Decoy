// The console's live sandbox: one long-lived fleet. Benign workdays keep it busy; incidents are the §6 scripts
// played on the same Run, so their numbers come from the same engine state the console shows.
import { AGENT_PROFILES, argsFor, DAY, DEMO_START, hrSession, mailerSession, MINUTE, procSession, quarterEndSession, rng, type AgentProfile, type Rand } from '@swaroop/world';
import { Run } from './runner';
import { D12, D14Hold, D2, D4, D5Hold, D6, D7, D8 } from './scenarios';

const GENERATORS: Record<AgentProfile['role'], (r: Rand) => string[]> = { procurement: procSession, hr_assistant: hrSession, mailer: mailerSession };
const PAUSED = new Set(['quarantined', 'revoked']);

/** One benign session per agent during working hours, then the clock moves to the next morning. */
export async function workday(run: Run) {
  const hour = new Date(run.t).getUTCHours();
  if (hour >= 17) run.nextDay();
  else if (hour < 10) run.at(Date.UTC(new Date(run.t).getUTCFullYear(), new Date(run.t).getUTCMonth(), new Date(run.t).getUTCDate(), 10));
  const day = Math.floor((run.t - DEMO_START) / DAY);
  const skipped: string[] = [];
  let sessions = 0;
  for (const [i, p] of AGENT_PROFILES.entries()) {
    if (PAUSED.has(run.engine.agent(p.id).state)) { skipped.push(p.id); continue; }
    const content = rng(9000 + day * 10 + i), args = rng(19000 + day * 10 + i);
    const s = await run.session(p.id);
    for (const t of GENERATORS[p.role](content).slice(1)) await s.call(t, argsFor(t, args));
    await s.end();
    sessions++;
    run.t += 5 * MINUTE;
  }
  run.nextDay();
  return { sessions, skipped };
}

export interface Incident {
  id: string;
  code: string;
  title: string;
  agent: string;
  summary: string;
  play: (run: Run) => Promise<unknown>;
}

export const INCIDENTS: Incident[] = [
  { id: 'd2', code: 'D2', title: 'Poisoned supplier PDF', agent: 'procurement-01', play: D2,
    summary: 'A supplier invoice hides an instruction to read salaries and post them to an outside host.' },
  { id: 'd4', code: 'D4', title: 'New agent, same invoice', agent: 'procurement-02', play: D4,
    summary: 'The poisoned invoice reaches an agent with no history of its own.' },
  { id: 'd5', code: 'D5', title: 'Role change request', agent: 'procurement-01', play: D5Hold,
    summary: 'The agent starts onboarding suppliers, a tool outside its charter. Its owner decides.' },
  { id: 'd6', code: 'D6', title: 'Slow drift on a stolen token', agent: 'procurement-01', play: D6,
    summary: 'Bulk exports grow a little each day. No single call looks wrong.' },
  { id: 'd7', code: 'D7', title: 'Delegated mailer', agent: 'mailer-01', play: D7,
    summary: 'A tainted procurement session asks the mailer to write to an outside address.' },
  { id: 'd8', code: 'D8', title: 'Decoy file opened', agent: 'hr-assist-01', play: D8,
    summary: 'The HR assistant opens a salary file that no real job ever touches.' },
  { id: 'd12', code: 'D12', title: 'Stolen token at night', agent: 'procurement-01', play: D12,
    summary: 'A copy of the token is used from a new network at 03:00, then replayed.' },
  { id: 'd14', code: 'D14', title: 'Poisoned tool', agent: 'procurement-01', play: D14Hold,
    summary: 'The ERP tool server re-lists erp.get_vendor with a hidden instruction in its description and its results.' },
];

/** Legitimate but unusual work, to show what the engine does NOT flag. */
export const LEGIT: Incident[] = [
  { id: 'batch', code: 'QE', title: 'Quarter-end batch day', agent: 'procurement-01', play: batchDay,
    summary: 'One 45-call session of vendor batches, about five times the usual. Announce a batch window on the agent page first to cover several days.' },
];

/** One quarter-end batch session for procurement-01 during working hours. */
export async function batchDay(run: Run) {
  const hour = new Date(run.t).getUTCHours();
  if (hour >= 17 || hour < 9) run.nextDay(10);
  const s = await run.session('procurement-01');
  const r = rng(5);
  for (const t of quarterEndSession().slice(1)) await s.call(t, argsFor(t, r));
  await s.end();
  return s.decisions;
}
