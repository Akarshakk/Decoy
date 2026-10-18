// Ablations (build_execution.md §8) switch detectors off inside the real engine. The credential gate always stays on:
// it is the IAM check every agent platform already has, and the baseline the other configs are measured against.
import { describe, expect, it } from 'vitest';
import { D2, D6, D8 } from '../src';

describe('detector configs', () => {
  it('credentials only: the PS attack goes through, every call scores 0 and the salaries are posted', async () => {
    const { decisions, backends } = await D2({ detectors: { factors: [], tripwire: false } });
    expect(decisions.map(d => d.score)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(decisions.every(d => d.executed && d.factors.length === 0)).toBe(true);
    expect([backends.count('hr.read_salary'), backends.count('http.post')]).toEqual([1, 1]);
  });

  it('S1 only: the salary read carries only the role factor', async () => {
    const { decisions } = await D2({ detectors: { factors: ['S1'], tripwire: false } });
    const read = decisions[3]!;
    expect(read.factors.map(f => f.factor)).toEqual(['S1']);
    expect(read.score).toBe(29);                   // 100 · .29 · m(3)=1.0: one point under HOLD
    expect(read.executed).toBe(true);
  });

  it('the tripwire can be switched off', async () => {
    const off = await D8({ detectors: { factors: [], tripwire: false } });
    expect([off.decision.score, off.decision.rootCause, off.decision.executed]).toEqual([0, null, true]);
    const on = await D8({ detectors: { factors: [], tripwire: true } });
    expect([on.decision.score, on.decision.rootCause]).toEqual([100, 'TRIPWIRE']);
  });

  it('without DA the drift accumulator never alarms and the agent stays active', async () => {
    const r = await D6({ detectors: { factors: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], tripwire: true } });
    expect(r.alarmAt).toBeNull();
    expect(r.stateAfterAlarm).toBe('active');
    expect(r.ledgerTypes).not.toContain('drift_alarm');
  });
});
