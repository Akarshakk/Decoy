import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs reference implementation, no types
import { CATALOG } from '../../../research/sim/model.mjs';
import { CHARTERS_V1, driftD6Session, driftD9Session, procSession, quarterEndSession, rng, TOOL_SPECS } from '@swaroop/world';
import { Baseline, VolumeBands } from '../src/learned/s2_baseline';
import { DriftAccumulator, DRIFT_H } from '../src/learned/drift';

// procurement-01's frozen snapshot: 40 sessions from rng(42), as in drift_acc_sim.mjs.
function snapshot() {
  const r = rng(42), b = new Baseline(CHARTERS_V1.procurement.tools, CATALOG), v = new VolumeBands();
  for (let i = 0; i < 40; i++) { const s = procSession(r); v.observeSession(s); for (let j = 1; j < s.length; j++) b.observe(s[j - 1]!, s[j]!); }
  return { baseline: b, volume: v };
}

// Sensitive (sensitivity ≥ 2) or outbound/paying/deleting tools: their excess volume is never capped.
const SENSITIVE = new Set(TOOL_SPECS.filter(t => t.sensitivity >= 2 || ['send_external', 'payment', 'delete'].includes(t.action)).map(t => t.name));
const sensitive = (t: string) => SENSITIVE.has(t);

function firstAlarm(make: (r: () => number, i: number) => string[], n: number, seed: number) {
  const snap = snapshot(), acc = new DriftAccumulator();
  const r = rng(seed);
  let first: number | null = null, alarms = 0;
  for (let i = 1; i <= n; i++) {
    if (acc.endSession(make(r, i), snap, sensitive).alarm) { alarms++; first ??= i; acc.reset(); }
  }
  return { first, alarms };
}

describe('drift accumulator (CUSUM, k = 0.5, H = 5) against drift_acc_sim.mjs', () => {
  it('uses H = 5', () => expect(DRIFT_H).toBe(5));

  it.each([7, 99, 1006])('raises 0 alarms over 300 benign sessions (seed %i)', seed => {
    expect(firstAlarm(r => procSession(r), 300, seed).alarms).toBe(0);
  });

  it.each([7, 99, 1006])('D6 escalating exports alarm at session 7 (seed %i)', seed => {
    expect(firstAlarm(driftD6Session, 30, seed).first).toBe(7);
  });

  it.each([[7, 5], [99, 2], [1006, 8]])('D9 constant-rate mimicry alarms at session %i → %i', (seed, at) => {
    expect(firstAlarm(r => driftD9Session(r), 40, seed).first).toBe(at);
  });

  it('misses in-distribution mimicry (D13, the documented expected miss)', () => {
    expect(firstAlarm(r => procSession(r), 40, 3).first).toBeNull();
  });

  it('reproduces the D6 per-session trace the landing chart shows', () => {
    const snap = snapshot(), acc = new DriftAccumulator(), r = rng(7);
    const trace = [1, 2, 3, 4, 5, 6, 7].map(i => +acc.endSession(driftD6Session(r, i), snap, sensitive).S.toFixed(2));
    expect(trace).toEqual([0, 0, 0.15, 0.49, 0.85, 4.32, 7.7]);
  });

  it('latches: strength 1 after the alarm until the owner resets it, 0 before', () => {
    const snap = snapshot(), acc = new DriftAccumulator(), r = rng(7);
    for (let i = 1; i <= 6; i++) { acc.endSession(driftD6Session(r, i), snap, sensitive); expect(acc.strength()).toBe(0); }
    expect(acc.endSession(driftD6Session(r, 7), snap, sensitive).alarm).toBe(true);
    expect([acc.strength(), acc.S]).toEqual([1, 0]);
    acc.endSession(procSession(r), snap, sensitive);
    expect(acc.strength()).toBe(1);
    acc.reset();
    expect(acc.strength()).toBe(0);
  });

  it('caps ordinary volume: one quarter-end batch adds at most H − k, so it cannot alarm alone', () => {
    const snap = snapshot(), acc = new DriftAccumulator();
    const r = acc.endSession(quarterEndSession(), snap, sensitive);
    expect(r.x).toBeLessThanOrEqual(DRIFT_H);
    expect(r.alarm).toBe(false);
  });

  it('does not cap sensitive volume: a single 12-export session alarms', () => {
    const snap = snapshot(), acc = new DriftAccumulator();
    expect(acc.endSession(['START', ...Array(12).fill('erp.export_report')], snap, sensitive).alarm).toBe(true);
  });
});
