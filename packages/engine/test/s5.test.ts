import { describe, expect, it } from 'vitest';
import { newCredentialState, recordPresentation, s5Credential, type CredentialProfile } from '../src/checks/s5_credential';

const profile: CredentialProfile = { knownRuntimes: ['rt-proc-01'], knownAsns: ['AS64500'], activeHours: [8, 19] };
const at = (h: number, m = 0) => Date.UTC(2026, 9, 19, h, m);   // ToolCall.ts is epoch milliseconds
const home = { id: 'rt-proc-01', asn: 'AS64500' };
const stolen = { id: 'rt-x', asn: 'AS13335' };

describe('S5 credential context', () => {
  it('is 0 for the agent’s own runtime during working hours', () => {
    const st = newCredentialState();
    expect(s5Credential({ agentId: 'procurement-01', sessionId: 's1', jti: 'j1', runtime: home, ts: at(10), profile, state: st }).strength).toBe(0);
  });

  it('D12: new runtime and ASN at 03:00 while the real agent is live → nor(.5,.3,.6) = .86', () => {
    const st = newCredentialState();
    recordPresentation(st, { agentId: 'procurement-01', sessionId: 'real', jti: 'j-real', runtime: home });
    const r = s5Credential({ agentId: 'procurement-01', sessionId: 'evil', jti: 'j-stolen', runtime: stolen, ts: at(3), profile, state: st });
    expect(r.strength).toBeCloseTo(0.86, 12);
    expect(r.subs.map(s => s.code)).toEqual(['new_runtime', 'unusual_hour', 'concurrent_use']);
    expect(r.subs[0]!.reason).toBe('runtime rt-x / AS13335 never seen for procurement-01');
  });

  it('D12b: the same jti presented from a second runtime is a replay → 1.0', () => {
    const st = newCredentialState();
    recordPresentation(st, { agentId: 'procurement-01', sessionId: 'real', jti: 'j1', runtime: home });
    const r = s5Credential({ agentId: 'procurement-01', sessionId: 'evil', jti: 'j1', runtime: stolen, ts: at(3), profile, state: st });
    expect(r.strength).toBe(1);
    expect(r.subs[0]).toMatchObject({ code: 'token_replay', reason: 'token j1 already used from rt-proc-01' });
  });

  it('reusing a token from the same runtime is not a replay', () => {
    const st = newCredentialState();
    recordPresentation(st, { agentId: 'procurement-01', sessionId: 's1', jti: 'j1', runtime: home });
    expect(s5Credential({ agentId: 'procurement-01', sessionId: 's1', jti: 'j1', runtime: home, ts: at(11), profile, state: st }).strength).toBe(0);
  });

  it('treats the p5–p95 hours as inclusive', () => {
    const st = newCredentialState();
    const h = (hour: number) => s5Credential({ agentId: 'procurement-01', sessionId: 's', jti: 'j', runtime: home, ts: at(hour, 30), profile, state: st }).strength;
    expect([h(7), h(8), h(19), h(20)].map(x => +x.toFixed(10))).toEqual([0.3, 0, 0, 0.3]);
  });

  it('a known runtime on a new ASN still counts as new', () => {
    const st = newCredentialState();
    const r = s5Credential({ agentId: 'procurement-01', sessionId: 's', jti: 'j', runtime: { id: 'rt-proc-01', asn: 'AS13335' }, ts: at(10), profile, state: st });
    expect(r.strength).toBe(0.5);
  });

  it('a second live session from the same runtime is not concurrent use', () => {
    const st = newCredentialState();
    recordPresentation(st, { agentId: 'procurement-01', sessionId: 'a', jti: 'j1', runtime: home });
    expect(s5Credential({ agentId: 'procurement-01', sessionId: 'b', jti: 'j2', runtime: home, ts: at(10), profile, state: st }).strength).toBe(0);
  });
});
