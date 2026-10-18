// Alert text (build_execution.md §5.5). The console alert card and the CLI print this same string.
import type { Band, Factor } from '../types';
import type { TokenAction } from '../respond/orchestrator';

export const FACTOR_LABEL: Record<Factor, string> = {
  S1: 'role', S2: 'behaviour', S3: 'flow', S4: 'injection', S5: 'credential', S6: 'delegation', DA: 'drift',
};

export interface ExplainFactor { factor: Factor; weighted: number; drop: number; reason: string }

export interface ExplainInput {
  id: string;
  band: Band;
  escalated: boolean;
  escalationReason?: string;
  tool: string;
  agentId: string;
  role: string;
  charterVersion: number;
  score: number;
  enforced: boolean;
  factors: ExplainFactor[];
  rootCause: Factor | 'TRIPWIRE' | null;
  rootCauseDetail?: string;
  credentials: { ok: boolean; reason?: string };
  firstBlockedPassedCredentials?: boolean;
  action: string;
}

const PAST: Record<Band, string> = { ALLOW: 'allowed', HOLD: 'held', DOWN_SCOPE: 'down-scoped', QUARANTINE: 'quarantined', REVOKE: 'revoked' };

export function actionSummary(r: { band: Band; token: TokenAction; tokenVerBefore: number; owner: string; enforced: boolean }) {
  if (!r.enforced) return r.band === 'ALLOW' ? 'none (shadow mode).' : `none (shadow mode, would have ${PAST[r.band]}).`;
  const who = r.token.target === 'delegated_session' ? 'delegated session token' : 'token';
  const from = `v${r.tokenVerBefore}`, to = `v${r.token.verAfter}`;
  let what: string;
  switch (r.band) {
    case 'ALLOW': return 'none.';
    case 'HOLD': what = `parked for ${r.owner} to approve`; break;
    case 'DOWN_SCOPE': what = `${who} ${from} → ${to} without ${(r.token.removed ?? []).join(', ') || 'no scopes'}`; break;
    case 'QUARANTINE': what = `${who} ${from} → ${to} = in-charter reads`; break;
    case 'REVOKE': {
      const n = r.token.cascade?.length ?? 0;
      what = `${who} ${from} revoked${n ? `, ${n} delegated token${n === 1 ? '' : 's'} revoked with it` : ''}`;
      break;
    }
  }
  if (r.token.target === 'delegated_session' && r.band !== 'HOLD') what += '; the agent itself stays active';
  return `${what}. Owner ${r.owner} notified.`;
}

export function explain(d: ExplainInput): string {
  const head = `${d.band}${d.escalated ? ' (escalated)' : ''}${d.enforced ? '' : ' (shadow, not enforced)'} ${d.tool} · ${d.agentId} (${d.role}@v${d.charterVersion}) · ${d.id} · score ${d.score}`;
  const sorted = [...d.factors].sort((a, b) => b.drop - a.drop || b.weighted - a.weighted);
  const factorLines = sorted.length
    ? ['Factors (weighted strength · drop if removed)',
      ...sorted.map(f => `  ${`${f.factor} ${FACTOR_LABEL[f.factor]}`.padEnd(16)}${f.weighted.toFixed(2)} · ${`−${f.drop}`.padEnd(4)} ${f.reason}`)]
    : ['Factors: none fired.'];
  const root = d.rootCause === null ? 'none'
    : d.rootCause === 'TRIPWIRE' ? `tripwire${d.rootCauseDetail ? ` (${d.rootCauseDetail})` : ''}`
    : `${d.rootCause} ${FACTOR_LABEL[d.rootCause]}`;
  const rootLine = `Root cause: ${root}.${d.escalated && d.escalationReason ? ` Escalated: ${d.escalationReason}.` : ''}`;
  const cred = d.credentials.ok ? 'Credentials: OK.'
    : `Credentials: FAILED (${d.credentials.reason}).${d.firstBlockedPassedCredentials ? ' The first blocked call passed credentials.' : ''}`;
  return [head, ...factorLines, rootLine, cred, `Action: ${d.action} No LLM was used in this decision.`].join('\n');
}
