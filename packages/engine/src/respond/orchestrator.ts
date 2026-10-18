// Phase III response orchestrator (build_execution.md §5.3): the smallest restriction that removes the risk.
import { BANDS, bandOf } from '../fusion/fuse';
import type { ActionClass, AgentState, Band, Charter, TokenAction, ToolDef } from '../types';

const LADDER: Band[] = ['ALLOW', 'HOLD', 'DOWN_SCOPE', 'QUARANTINE', 'REVOKE'];
const HIGH_IMPACT: ActionClass[] = ['send_external', 'payment', 'delete'];
const atLeast = (b: Band, floor: Band) => (LADDER.indexOf(b) >= LADDER.indexOf(floor) ? b : floor);
const oneUp = (b: Band) => LADDER[Math.min(LADDER.length - 1, LADDER.indexOf(b) + 1)]!;
const SEVERITY: AgentState[] = ['active', 'watch', 'scoped_down', 'quarantined', 'revoked'];
const harsher = (a: AgentState, b: AgentState) => (SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b);

export interface RespondInput {
  score: number;
  action: ActionClass;                 // effective action of this call
  sensitivity: number;
  mode: 'enforce' | 'shadow';
  agentState: AgentState;
  session: { downScopedAt: string | null };   // decision id of an earlier DOWN_SCOPE in this session
  delegated: boolean;                  // the call runs on a delegated session token
  charter: Charter;
  scopes: string[];                    // scopes of the token that made the call
  tokenVer: number;
  catalog: ToolDef[];
  children: string[];                  // delegated child tokens (agent:session) to revoke on REVOKE
}

export type { TokenAction };

export interface Response {
  band: Band;
  escalated: boolean;
  escalationReason?: string;
  invariant?: string;
  enforced: boolean;
  runs: boolean;
  held: boolean;
  token: TokenAction;
  agentStateAfter: AgentState;
}

export function respond(i: RespondInput): Response {
  if (i.agentState === 'revoked') {
    return { band: 'REVOKE', escalated: false, invariant: 'agent already revoked', enforced: i.mode === 'enforce',
      runs: i.mode === 'shadow', held: false, token: { kind: 'none' }, agentStateAfter: 'revoked' };
  }

  let band = bandOf(i.score);
  let invariant: string | undefined;
  const highImpact = HIGH_IMPACT.includes(i.action);
  // High-impact invariant (send_external/payment/delete with score ≥30 never auto-runs) holds by construction:
  // the ladder already maps every score ≥30 to HOLD or above. The test suite pins that.
  if (i.agentState === 'watch' && (highImpact || i.sensitivity >= 2) && band === 'ALLOW') {
    band = atLeast(band, 'HOLD');
    invariant = 'agent is on watch after a drift alarm';
  }

  let escalated = false, escalationReason: string | undefined;
  if (i.score >= BANDS.find(([, b]) => b === 'DOWN_SCOPE')![0] && i.session.downScopedAt && band !== 'REVOKE') {
    band = oneUp(band);
    escalated = true;
    escalationReason = `second ≥55 call in session after DOWN_SCOPE at ${i.session.downScopedAt}`;
  }

  const base = { band, escalated, escalationReason, invariant };
  if (i.mode === 'shadow') return { ...base, enforced: false, runs: true, held: false, token: { kind: 'none' }, agentStateAfter: i.agentState };

  const target = i.delegated ? 'delegated_session' : 'agent';
  const actionOfTool = (name: string) => i.catalog.find(t => t.name === name)?.action;
  // A response only ever narrows: the new token is a subset of the old one, no re-issue when nothing would be removed,
  // and the agent's state only moves towards revoked (a DOWN_SCOPE never softens a quarantine).
  const reissue = (wanted: string[], state: AgentState): Response => {
    const scopesAfter = wanted.filter(s => i.scopes.includes(s));
    const removed = i.scopes.filter(s => !scopesAfter.includes(s));
    return {
      ...base, enforced: true, runs: false, held: false,
      token: removed.length ? { kind: 'reissue', target, verAfter: i.tokenVer + 1, scopesAfter, removed } : { kind: 'none' },
      agentStateAfter: i.delegated ? i.agentState : harsher(i.agentState, state),
    };
  };

  switch (band) {
    case 'ALLOW':
      return { ...base, enforced: true, runs: true, held: false, token: { kind: 'none' }, agentStateAfter: i.agentState };
    case 'HOLD':
      return { ...base, enforced: true, runs: false, held: true, token: { kind: 'none' }, agentStateAfter: i.agentState };
    case 'DOWN_SCOPE':
      // Keep in-charter scopes, minus anything that can move data out, pay or delete.
      return reissue(i.scopes.filter(s => i.charter.tools.includes(s) && !HIGH_IMPACT.includes(actionOfTool(s)!)), 'scoped_down');
    case 'QUARANTINE':
      return reissue(i.charter.tools.filter(s => actionOfTool(s) === 'read'), 'quarantined');
    case 'REVOKE':
      return { ...base, enforced: true, runs: false, held: false,
        token: { kind: 'revoke', target, verAfter: i.tokenVer + 1, scopesAfter: [], removed: [...i.scopes], cascade: [...i.children] },
        agentStateAfter: i.delegated ? i.agentState : 'revoked' };
  }
}
