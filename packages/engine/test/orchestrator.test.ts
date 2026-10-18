import { describe, expect, it } from 'vitest';
import { AGENT_PROFILES, CHARTERS_V1, TOOL_SPECS } from '@swaroop/world';
import { respond, type RespondInput } from '../src/respond/orchestrator';
import type { Charter, ToolDef } from '../src/types';

const catalog = TOOL_SPECS.map(t => ({ ...t, defHash: '' })) as ToolDef[];
const proc: Charter = { ...CHARTERS_V1.procurement, sig: '' };
const procScopes = AGENT_PROFILES.find(a => a.id === 'procurement-01')!.scopes;

const input = (over: Partial<RespondInput>): RespondInput => ({
  score: 0, action: 'read', sensitivity: 1, mode: 'enforce', agentState: 'active',
  session: { downScopedAt: null }, delegated: false, charter: proc, scopes: procScopes, tokenVer: 1, catalog, children: [],
  ...over,
});

describe('response orchestrator', () => {
  it('ALLOW runs and changes nothing', () => {
    const r = respond(input({ score: 5 }));
    expect(r).toMatchObject({ band: 'ALLOW', runs: true, escalated: false, token: { kind: 'none' }, agentStateAfter: 'active' });
  });

  it('D2a: 69 down-scopes the token to in-charter, non-sink scopes', () => {
    const r = respond(input({ score: 69, sensitivity: 3 }));
    expect(r.band).toBe('DOWN_SCOPE');
    expect(r.runs).toBe(false);
    expect(r.token).toMatchObject({ kind: 'reissue', target: 'agent', verAfter: 2 });
    expect(r.token.removed!.sort()).toEqual(['hr.list_employees', 'hr.read_salary', 'http.post', 'payments.pay_invoice']);
    expect(r.token.scopesAfter!.sort()).toEqual([...proc.tools].sort());
    expect(r.agentStateAfter).toBe('scoped_down');
  });

  it('D2b: 72 after a down-scope in the same session escalates to QUARANTINE, in-charter reads only', () => {
    const v2 = proc.tools;
    const r = respond(input({ score: 72, action: 'send_external', session: { downScopedAt: 'd2_0004' }, scopes: v2, tokenVer: 2 }));
    expect(r).toMatchObject({ band: 'QUARANTINE', escalated: true, runs: false, agentStateAfter: 'quarantined' });
    expect(r.escalationReason).toBe('second ≥55 call in session after DOWN_SCOPE at d2_0004');
    expect(r.token.verAfter).toBe(3);
    expect(r.token.scopesAfter!.sort()).toEqual(['docs.read_attachment', 'erp.export_report', 'erp.get_price_list', 'erp.get_vendor', 'erp.search_invoices']);
  });

  it('does not escalate a first offence or a sub-55 repeat', () => {
    expect(respond(input({ score: 60 }))).toMatchObject({ band: 'DOWN_SCOPE', escalated: false });
    expect(respond(input({ score: 40, session: { downScopedAt: 'x' } }))).toMatchObject({ band: 'HOLD', escalated: false });
  });

  it('escalation tops out at REVOKE', () => {
    expect(respond(input({ score: 89, session: { downScopedAt: 'x' } })).band).toBe('REVOKE');
    expect(respond(input({ score: 95, session: { downScopedAt: 'x' } }))).toMatchObject({ band: 'REVOKE', escalated: false });
  });

  it('HOLD parks the call for the owner without touching the token', () => {
    const r = respond(input({ score: 37 }));
    expect(r).toMatchObject({ band: 'HOLD', runs: false, held: true, token: { kind: 'none' }, agentStateAfter: 'active' });
  });

  it('watch invariant: a sensitive call by a watched agent is held even at a low score', () => {
    expect(respond(input({ score: 20, sensitivity: 2, agentState: 'watch' }))).toMatchObject({ band: 'HOLD', held: true });
    expect(respond(input({ score: 20, sensitivity: 1, agentState: 'watch' }))).toMatchObject({ band: 'ALLOW', runs: true });
  });

  it('high-impact invariant: no external send, payment or delete with score ≥30 ever runs', () => {
    for (const action of ['send_external', 'payment', 'delete'] as const)
      for (let score = 30; score <= 100; score++) expect(respond(input({ score, action })).runs).toBe(false);
  });

  it('watch invariant also covers high-impact calls', () => {
    expect(respond(input({ score: 5, action: 'payment', agentState: 'watch' })).band).toBe('HOLD');
  });

  it('D7: a delegated QUARANTINE restricts the delegated session and leaves the callee agent active', () => {
    const mailer: Charter = { ...CHARTERS_V1.mailer, sig: '' };
    const r = respond(input({ score: 78, action: 'send_external', delegated: true, charter: mailer, scopes: ['mail.send'] }));
    expect(r).toMatchObject({ band: 'QUARANTINE', agentStateAfter: 'active', token: { kind: 'reissue', target: 'delegated_session' } });
  });

  it('REVOKE empties the token and cascades to delegated child tokens', () => {
    const r = respond(input({ score: 100, sensitivity: 3, children: ['mailer-01:sess-9'] }));
    expect(r).toMatchObject({ band: 'REVOKE', agentStateAfter: 'revoked', token: { kind: 'revoke', scopesAfter: [], cascade: ['mailer-01:sess-9'] } });
  });

  it('a revoked agent cannot act, whatever the score', () => {
    expect(respond(input({ score: 0, agentState: 'revoked' }))).toMatchObject({ runs: false, band: 'REVOKE' });
  });

  it('shadow mode logs the band but runs the call and changes nothing', () => {
    const r = respond(input({ score: 69, sensitivity: 3, mode: 'shadow' }));
    expect(r).toMatchObject({ band: 'DOWN_SCOPE', enforced: false, runs: true, held: false, token: { kind: 'none' }, agentStateAfter: 'active' });
  });
});
