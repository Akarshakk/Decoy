import { describe, expect, it } from 'vitest';
import { actionSummary, explain } from '../src/fusion/explain';

// The exact text from build_execution.md §5.5.
const SPEC = `QUARANTINE (escalated) http.post · procurement-01 (procurement@v1) · dec_0007 · score 72
Factors (weighted strength · drop if removed)
  S1 role         0.33 · −14  http.post off-charter; host acme-verify.co not in [acme.com]
  S3 flow         0.28 · −11  host acme-verify.co first seen in untrusted content (inv-204511.pdf, step 3)
  S2 behaviour    0.25 · −9   hr.read_salary→http.post 12.0 bits vs own p95 3.6 (snapshot bs_1, 308 calls)
  S4 injection    0.23 · −8   culprit: inv-204511.pdf (hidden instruction, foreign URL), behaviour shifted after ingest
Root cause: S1 role. Escalated: second ≥55 call in session after DOWN_SCOPE at dec_0006.
Credentials: FAILED (http.post removed in token v2 at dec_0006). The first blocked call passed credentials.
Action: token v2 → v3 = in-charter reads. Owner finance-platform notified. No LLM was used in this decision.`;

describe('explain', () => {
  it('reproduces the §5.5 alert text exactly', () => {
    const text = explain({
      id: 'dec_0007', band: 'QUARANTINE', escalated: true, escalationReason: 'second ≥55 call in session after DOWN_SCOPE at dec_0006',
      tool: 'http.post', agentId: 'procurement-01', role: 'procurement', charterVersion: 1, score: 72, enforced: true,
      factors: [
        { factor: 'S3', weighted: 0.28, drop: 11, reason: 'host acme-verify.co first seen in untrusted content (inv-204511.pdf, step 3)' },
        { factor: 'S1', weighted: 0.332, drop: 14, reason: 'http.post off-charter; host acme-verify.co not in [acme.com]' },
        { factor: 'S4', weighted: 0.225, drop: 8, reason: 'culprit: inv-204511.pdf (hidden instruction, foreign URL), behaviour shifted after ingest' },
        { factor: 'S2', weighted: 0.25, drop: 9, reason: 'hr.read_salary→http.post 12.0 bits vs own p95 3.6 (snapshot bs_1, 308 calls)' },
      ],
      rootCause: 'S1',
      credentials: { ok: false, reason: 'http.post removed in token v2 at dec_0006' },
      firstBlockedPassedCredentials: true,
      action: actionSummary({ band: 'QUARANTINE', token: { kind: 'reissue', target: 'agent', verAfter: 3, removed: ['http.post'] }, tokenVerBefore: 2, owner: 'finance-platform', enforced: true }),
    });
    expect(text).toBe(SPEC);
  });

  it('says plainly when nothing fired', () => {
    const text = explain({
      id: 'd3_0002', band: 'ALLOW', escalated: false, tool: 'hr.read_salary', agentId: 'hr-assist-01', role: 'hr_assistant',
      charterVersion: 1, score: 0, enforced: true, factors: [], rootCause: null, credentials: { ok: true },
      action: actionSummary({ band: 'ALLOW', token: { kind: 'none' }, tokenVerBefore: 1, owner: 'people-ops', enforced: true }),
    });
    expect(text).toBe(`ALLOW hr.read_salary · hr-assist-01 (hr_assistant@v1) · d3_0002 · score 0
Factors: none fired.
Root cause: none.
Credentials: OK.
Action: none. No LLM was used in this decision.`);
  });

  it('describes each kind of response', () => {
    const s = (over: Partial<Parameters<typeof actionSummary>[0]>) =>
      actionSummary({ band: 'ALLOW', token: { kind: 'none' }, tokenVerBefore: 1, owner: 'finance-platform', enforced: true, ...over });
    expect(s({ band: 'HOLD' })).toBe('parked for finance-platform to approve. Owner finance-platform notified.');
    expect(s({ band: 'DOWN_SCOPE', token: { kind: 'reissue', target: 'agent', verAfter: 2, removed: ['hr.read_salary', 'http.post'] } }))
      .toBe('token v1 → v2 without hr.read_salary, http.post. Owner finance-platform notified.');
    expect(s({ band: 'QUARANTINE', token: { kind: 'reissue', target: 'delegated_session', verAfter: 2, removed: [] } }))
      .toBe('delegated session token v1 → v2 = in-charter reads; the agent itself stays active. Owner finance-platform notified.');
    expect(s({ band: 'REVOKE', token: { kind: 'revoke', target: 'agent', verAfter: 2, cascade: ['mailer-01:s9'] } }))
      .toBe('token v1 revoked, 1 delegated token revoked with it. Owner finance-platform notified.');
    expect(s({ band: 'DOWN_SCOPE', enforced: false })).toBe('none (shadow mode, would have down-scoped).');
  });
});
