// S5 credential context (Phase II-A, inline, deterministic). Weight 0.50.
// s = nor(1.0·[jti already used from another runtime], .5·[runtime or ASN never seen for this agent],
//         .3·[hour outside the agent's p5–p95 active hours], .6·[another live session of this agent from a different runtime])
import { nor } from '../fusion/fuse';
import type { SubSignal } from '../types';

export interface CredentialProfile { knownRuntimes: string[]; knownAsns: string[]; activeHours: [number, number] }

export interface CredentialState {
  jtiRuntime: Map<string, string>;                       // jti → runtime that first presented it
  live: Map<string, Map<string, string>>;                // agentId → sessionId → runtime
}

export const newCredentialState = (): CredentialState => ({ jtiRuntime: new Map(), live: new Map() });

interface Presentation { agentId: string; sessionId: string; jti: string; runtime: { id: string; asn: string } }

export function recordPresentation(st: CredentialState, p: Presentation) {
  if (!st.jtiRuntime.has(p.jti)) st.jtiRuntime.set(p.jti, p.runtime.id);
  const sessions = st.live.get(p.agentId) ?? new Map<string, string>();
  sessions.set(p.sessionId, p.runtime.id);
  st.live.set(p.agentId, sessions);
}

export function endSession(st: CredentialState, agentId: string, sessionId: string) {
  st.live.get(agentId)?.delete(sessionId);
}

export function s5Credential(p: Presentation & { ts: number; profile: CredentialProfile; state: CredentialState }) {
  const subs: SubSignal[] = [];
  const first = p.state.jtiRuntime.get(p.jti);
  if (first !== undefined && first !== p.runtime.id) {
    subs.push({ code: 'token_replay', value: 1, reason: `token ${p.jti} already used from ${first}`, evidence: [p.jti] });
  }
  if (!p.profile.knownRuntimes.includes(p.runtime.id) || !p.profile.knownAsns.includes(p.runtime.asn)) {
    subs.push({ code: 'new_runtime', value: 0.5, reason: `runtime ${p.runtime.id} / ${p.runtime.asn} never seen for ${p.agentId}`,
      evidence: [p.runtime.id, p.runtime.asn] });
  }
  const hour = new Date(p.ts).getUTCHours();
  const [lo, hi] = p.profile.activeHours;
  if (hour < lo || hour > hi) {
    subs.push({ code: 'unusual_hour', value: 0.3,
      reason: `${String(hour).padStart(2, '0')}:00 UTC is outside ${p.agentId}'s usual ${String(lo).padStart(2, '0')}–${String(hi).padStart(2, '0')}h`, evidence: [] });
  }
  const other = [...(p.state.live.get(p.agentId) ?? [])].find(([sid, rt]) => sid !== p.sessionId && rt !== p.runtime.id);
  if (other) {
    subs.push({ code: 'concurrent_use', value: 0.6, reason: `${p.agentId} is live in session ${other[0]} on ${other[1]} at the same time`,
      evidence: [other[0]] });
  }
  return { strength: nor(subs.map(s => s.value)), subs };
}
