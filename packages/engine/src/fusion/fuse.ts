// Phase II-C fusion: R = 100 · (1 − Π(1 − wᵢ·sᵢ)) · m(sensitivity), capped at 100; honeytoken → 100.
// Constants are research/sim/fusion_sim.mjs; a change here must change the sim and plan.md §8/§10 too.
import type { Band, Factor } from '../types';

export const WEIGHTS: Record<Factor, number> = { S1: 0.40, S2: 0.30, S3: 0.40, S4: 0.25, S5: 0.50, S6: 0.60, DA: 0.40 };
export const MULTIPLIER = { 0: 0.70, 1: 0.85, 2: 0.95, 3: 1.00 } as const;
export const BANDS: [number, Band][] = [[90, 'REVOKE'], [75, 'QUARANTINE'], [55, 'DOWN_SCOPE'], [30, 'HOLD'], [0, 'ALLOW']];

export const nor = (xs: number[]) => 1 - xs.reduce((p, x) => p * (1 - x), 1);
export const bandOf = (score: number): Band => BANDS.find(([t]) => score >= t)![1];

export interface FuseOptions { sensitivity: 0 | 1 | 2 | 3; egress?: boolean; honeytoken?: boolean }

export interface Fused {
  score: number;
  band: Band;
  multiplier: number;
  weighted: Partial<Record<Factor, number>>;
  loo: Partial<Record<Factor, number>>;     // score − score without that factor
  rootCause: Factor | 'TRIPWIRE' | null;
}

export function fuse(strengths: Partial<Record<Factor, number>>, opts: FuseOptions): Fused {
  const multiplier = opts.egress ? 1 : MULTIPLIER[opts.sensitivity];
  if (opts.honeytoken) return { score: 100, band: 'REVOKE', multiplier, weighted: {}, loo: {}, rootCause: 'TRIPWIRE' };

  const weighted = Object.fromEntries(
    (Object.entries(strengths) as [Factor, number][]).filter(([, s]) => s > 0).map(([f, s]) => [f, WEIGHTS[f] * s]),
  ) as Partial<Record<Factor, number>>;
  const scoreOf = (parts: number[]) => Math.min(100, Math.round(100 * nor(parts) * multiplier));
  const all = Object.values(weighted);
  const score = scoreOf(all);

  const loo = Object.fromEntries(
    Object.keys(weighted).map(f => [f, score - scoreOf(Object.entries(weighted).filter(([g]) => g !== f).map(([, v]) => v))]),
  ) as Partial<Record<Factor, number>>;

  // Root cause = largest leave-one-out drop; ties go to the larger weighted strength.
  const rootCause = score === 0 ? null : (Object.keys(loo) as Factor[])
    .sort((a, b) => loo[b]! - loo[a]! || weighted[b]! - weighted[a]!)[0] ?? null;

  return { score, band: bandOf(score), multiplier, weighted, loo, rootCause };
}
