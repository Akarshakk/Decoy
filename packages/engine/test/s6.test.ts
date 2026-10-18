import { describe, expect, it } from 'vitest';
import { CHARTERS_V1, TOOL_SPECS } from '@swaroop/world';
import { s6Delegation } from '../src/learned/s6_delegation';
import type { Charter, ToolDef } from '../src/types';

const tool = (n: string) => ({ ...TOOL_SPECS.find(t => t.name === n)!, defHash: '' }) as ToolDef;
const proc: Charter = { ...CHARTERS_V1.procurement, sig: '' };
const mailer: Charter = { ...CHARTERS_V1.mailer, sig: '' };
const base = { tool: tool('mail.send'), chain: [proc, mailer], edgeSeen: true, callerFanOut: 1, parentLastScore: 0 };

describe('S6 delegation graph', () => {
  it('D7: mail to a host neither charter allows, on a first-ever edge → nor(1, .3) = 1', () => {
    const r = s6Delegation({ ...base, args: { to: 'finance@acme-verify.co' }, edgeSeen: false });
    expect(r.strength).toBe(1);
    expect(r.subs.map(s => s.code)).toEqual(['widens_act_chain', 'new_edge']);
    expect(r.subs[0]!.reason).toBe('host acme-verify.co is outside what procurement ∩ mailer allow ([acme.com])');
  });

  it('a delegated send inside the chain’s intersection on a known edge is 0', () => {
    expect(s6Delegation({ ...base, args: { to: 'buyer@acme.com' } }).strength).toBe(0);
  });

  it('the mailer’s own allow list does not widen the caller: acme-supplies.example is outside procurement', () => {
    expect(s6Delegation({ ...base, args: { to: 'orders@acme-supplies.example' } }).subs[0]!.code).toBe('widens_act_chain');
  });

  it('flags a tool the caller’s charter does not have', () => {
    const r = s6Delegation({ ...base, tool: tool('hr.read_salary'), args: {}, chain: [proc, { ...CHARTERS_V1.hr_assistant, sig: '' }] });
    expect(r.subs[0]!.reason).toBe('hr.read_salary is outside what procurement ∩ hr_assistant allow');
  });

  it('adds .3 for a new edge, .4 for fan-out above 3, and .8 × the parent’s last score', () => {
    const v = (o: object) => +s6Delegation({ ...base, args: { to: 'buyer@acme.com' }, ...o }).strength.toFixed(10);
    expect(v({ edgeSeen: false })).toBe(0.3);
    expect(v({ callerFanOut: 3 })).toBe(0);
    expect(v({ callerFanOut: 4 })).toBe(0.4);
    expect(v({ parentLastScore: 69 })).toBe(0.552);
  });

  it('is 0 for a call that was not delegated', () => {
    expect(s6Delegation({ ...base, chain: [mailer], args: { to: 'finance@acme-verify.co' } }).strength).toBe(0);
  });
});
