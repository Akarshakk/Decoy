// Drift accumulator (Phase II-C): CUSUM on per-session excess against a FROZEN snapshot (research/sim/drift_acc_sim.mjs).
// x = min(H, mean over calls of max(0, surprise − τ) + Σ_ordinary tools max(0, z − 2)) + Σ_sensitive tools max(0, z − 2)
// S = max(0, S + x − k);  S > H → alarm, S = 0.
// The cap means one unusual day of ordinary, in-role work (a quarter-end batch) can't alarm on its own: drift is sustained
// change. Excess volume of sensitive or outbound tools is not capped, so a single bulk export still alarms.
// The DA factor is latched: 0 until an alarm, then 1 until the owner resets it. (Applying min(1, S/H) on every call
// would lift D6's calls over 30 before the alarm, contradicting the D6 assertion the sim establishes.)
import type { Baseline, VolumeBands } from './s2_baseline';

export const DRIFT_K = 0.5;
export const DRIFT_H = 5;

export interface Snapshot { baseline: Baseline; volume: VolumeBands }
/** What one session is measured against: a frozen snapshot, or (cold agent) a snapshot with no volume bands of its own. */
export interface DriftReference { baseline: Baseline; volume: VolumeBands | null }

export class DriftAccumulator {
  S = 0;
  alarmed = false;
  history: { S: number; x: number; alarm: boolean }[] = [];

  /** `ordinaryVolume: false` inside an owner-announced batch window: only sequence and sensitive volume count. */
  endSession(tools: string[], snap: DriftReference, sensitive: (tool: string) => boolean, ordinaryVolume = true) {
    const tau = snap.baseline.tau();
    let seq = 0;
    for (let j = 1; j < tools.length; j++) seq += Math.max(0, snap.baseline.surprise(tools[j - 1]!, tools[j]!) - tau);
    const vol = snap.volume ? snap.volume.excessSplit(tools, sensitive) : { low: 0, high: 0 };
    const x = Math.min(DRIFT_H, (tools.length > 1 ? seq / (tools.length - 1) : 0) + (ordinaryVolume ? vol.low : 0)) + vol.high;
    this.S = Math.max(0, this.S + x - DRIFT_K);
    const S = this.S, alarm = S > DRIFT_H;
    if (alarm) { this.alarmed = true; this.S = 0; }
    this.history.push({ S, x, alarm });
    return { S, x, alarm };
  }

  strength() { return this.alarmed ? 1 : 0; }
  reset() { this.alarmed = false; this.S = 0; }
}
