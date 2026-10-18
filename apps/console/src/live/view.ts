// What the console pages render, read straight off the Engine. No numbers are made up here: every value is a
// field of an engine object, a ledger record, or the world's provisioning (AGENT_PROFILES).
import { DRIFT_H, verifyChain, type AgentState, type Band, type Decision, type Engine, type Factor, type LedgerRecord } from '@swaroop/engine';
import { AGENT_PROFILES } from '@swaroop/world';

const RECENT = 24;

export interface FleetRow {
  id: string;
  displayName: string;
  role: string;
  owner: string;
  charterVersion: number;
  state: AgentState;
  tokenVer: number;
  scopes: string[];
  extraScopes: string[];                       // in the token but not in the charter: over-provisioned
  confidence: number;
  recent: { id: string; score: number; band: Band }[];
  last: Decision | null;
  drift: { S: number; alarmed: boolean };
  calls: number;
  alerts: number;
}

export function fleet(e: Engine): FleetRow[] {
  return e.agentIds().map(id => {
    const a = e.agent(id), charter = e.charterOf(id), scopes = e.scopesOf(id), drift = e.driftOf(id);
    const mine = e.decisions.filter(d => d.call.agentId === id);
    return {
      id, displayName: a.displayName, role: a.role, owner: a.owner, charterVersion: charter.version, state: a.state, tokenVer: a.tokenVer,
      scopes, extraScopes: scopes.filter(s => !charter.tools.includes(s)), confidence: e.baselineOf(id).confidence(),
      recent: mine.slice(-RECENT).map(d => ({ id: d.id, score: d.score, band: d.band })), last: mine.at(-1) ?? null,
      drift: { S: drift.S, alarmed: drift.alarmed }, calls: mine.length, alerts: mine.filter(isAlert).length,
    };
  });
}

export const isAlert = (d: Decision) => d.band !== 'ALLOW' || !d.credentials.ok;

export type AlertStatus = 'held' | 'approved' | 'denied' | 'role_change' | 'shadow' | 'blocked' | 'ran';
export type Cause = Factor | 'TRIPWIRE' | 'credentials';

export interface AlertRow { decision: Decision; status: AlertStatus; cause: Cause | null }

export function statusOf(e: Engine, d: Decision): AlertStatus {
  const h = e.holds.get(d.id);
  if (h) return h.status === 'pending' ? 'held' : h.status;
  if (!d.enforced && d.band !== 'ALLOW' && d.credentials.ok) return 'shadow';
  return d.executed ? 'ran' : 'blocked';
}

export const causeOf = (d: Decision): Cause | null => d.rootCause ?? (d.credentials.ok ? null : 'credentials');

/** Every decision above Allow or with failed credentials, newest first. */
export function alerts(e: Engine): AlertRow[] {
  return e.decisions.filter(isAlert).reverse().map(d => ({ decision: d, status: statusOf(e, d), cause: causeOf(d) }));
}

const CAUSE_ORDER: Cause[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'DA', 'TRIPWIRE', 'credentials'];

export function byRootCause(list: AlertRow[]): { cause: Cause; count: number }[] {
  const n = new Map<Cause, number>();
  for (const a of list) if (a.cause) n.set(a.cause, (n.get(a.cause) ?? 0) + 1);
  return CAUSE_ORDER.filter(c => n.has(c)).map(c => ({ cause: c, count: n.get(c)! }))
    .sort((a, b) => b.count - a.count || CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause));
}

export function pendingHolds(e: Engine) {
  return [...e.holds.values()].filter(h => h.status === 'pending').map(h => ({
    decision: h.decision,
    offCharter: !e.charterOf(h.decision.call.agentId).tools.includes(h.decision.call.tool),
  }));
}

export interface ScopeRow { name: string; inCharter: boolean; removedIn?: number }

export function agentView(e: Engine, id: string) {
  const row = fleet(e).find(r => r.id === id)!;
  const charter = e.charterOf(id), baseline = e.baselineOf(id), drift = e.driftOf(id), snap = e.snapshotOf(id);
  const recs = e.ledgerRecords().filter(r => r.payload.agent === id);

  const charterHistory = recs.filter(r => r.type === 'role_change').map(r => ({
    seq: r.seq, ts: r.ts, from: r.payload.from as number, to: r.payload.to as number, added: r.payload.added as string[], decision: r.payload.decision as string,
  }));

  // Scopes: what the agent was provisioned with plus anything a role change added; a scope that is gone shows the
  // token version whose re-issue removed it (revoked agents have no scopes left at all).
  const removed = new Map<string, number>();
  for (const r of recs) if (r.type === 'token_reissue' && r.payload.target === 'agent') {
    for (const s of (r.payload.removed as string[] | undefined) ?? []) if (!removed.has(s)) removed.set(s, r.payload.to as number);
  }
  const current = new Set(row.scopes);
  const provisioned = AGENT_PROFILES.find(p => p.id === id)?.scopes ?? [];
  const scopes: ScopeRow[] = [...new Set([...provisioned, ...row.scopes])].map(name => ({
    name, inCharter: charter.tools.includes(name),
    ...(current.has(name) ? {} : { removedIn: removed.get(name) ?? row.tokenVer }),
  }));

  const ownTau = baseline.surprises.length >= 30;
  const peer = e.peerOf(id);
  const transitions = [...baseline.bi].flatMap(([from, next]) => [...next].map(([to, count]) => ({ from, to, count, p: baseline.pBi(from, to) })))
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)).slice(0, 10);

  const vf = e.volumeFor(id);
  const volume = charter.tools.map(tool => ({ tool, source: vf.source, ...(vf.bands ? vf.bands.stats(tool) : { mu: 0, sd: 0 }) }));

  return {
    row, charter, charterHistory, scopes,
    baseline: { n: baseline.n, confidence: baseline.confidence(), tau: baseline.tau(), source: ownTau ? 'own' as const : peer ? 'peer' as const : 'default' as const, peer },
    transitions, volume,
    timeline: e.decisions.filter(d => d.call.agentId === id),
    drift: { history: drift.history, S: drift.S, alarmed: drift.alarmed, H: DRIFT_H, snapshot: { id: snap.id, frozenAt: snap.frozenAt } },
  };
}

export type AgentView = ReturnType<typeof agentView>;

export async function ledgerView(e: Engine): Promise<{ records: readonly LedgerRecord[]; brokenAt: number | null }> {
  const records = e.ledgerRecords();
  return { records, brokenAt: await verifyChain(records) };
}

/** Edit one record of a COPY of the chain and verify it: returns where verification breaks. The real ledger is untouched. */
export async function tamperCheck(e: Engine, seq: number): Promise<number | null> {
  const copy: LedgerRecord[] = structuredClone([...e.ledgerRecords()]);
  const r = copy[seq];
  if (!r) return null;
  r.payload = { ...r.payload, tampered: true };
  return verifyChain(copy);
}
