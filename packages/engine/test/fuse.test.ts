import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs reference implementation, no types
import { fuse as simFuse } from '../../../research/sim/fusion_sim.mjs';
import { bandOf, fuse, nor, WEIGHTS } from '../src/fusion/fuse';
import type { Factor } from '../src/types';

type Strengths = Partial<Record<Factor, number>>;

// Weighted strengths printed by research/sim/fusion_sim.mjs, divided back by the weights.
const raw = (weighted: Strengths): Strengths =>
  Object.fromEntries(Object.entries(weighted).map(([k, v]) => [k, v! / WEIGHTS[k as Factor]]));

describe('nor', () => {
  it('is 1 − Π(1 − x)', () => {
    expect(nor([])).toBe(0);
    expect(nor([0.5])).toBe(0.5);
    expect(nor([0.5, 0.5])).toBeCloseTo(0.75, 12);
  });
});

describe('bandOf', () => {
  it('maps the ladder edges exactly', () => {
    const edges: [number, string][] = [[0, 'ALLOW'], [29, 'ALLOW'], [30, 'HOLD'], [54, 'HOLD'], [55, 'DOWN_SCOPE'],
      [74, 'DOWN_SCOPE'], [75, 'QUARANTINE'], [89, 'QUARANTINE'], [90, 'REVOKE'], [100, 'REVOKE']];
    for (const [score, band] of edges) expect(bandOf(score)).toBe(band);
  });
});

describe('fuse', () => {
  it('scores D2a at 69 with S2 as the largest leave-one-out drop', () => {
    const r = fuse({ S1: 0.725, S2: 1, S3: 0.5, S4: 0.9 }, { sensitivity: 3 });
    expect(r.score).toBe(69);
    expect(r.band).toBe('DOWN_SCOPE');
    expect(r.loo).toEqual({ S1: 12, S2: 13, S3: 8, S4: 9 });
    expect(r.rootCause).toBe('S2');
  });

  it('treats any external egress as full sensitivity', () => {
    const internal = fuse({ S1: 0.6 }, { sensitivity: 1 });
    const external = fuse({ S1: 0.6 }, { sensitivity: 1, egress: true });
    expect(internal.multiplier).toBe(0.85);
    expect(external.multiplier).toBe(1);
    expect(external.score).toBeGreaterThan(internal.score);
  });

  it('caps behaviour alone below HOLD at sensitivity ≤ 2 (S2 weight 0.30)', () => {
    for (const sensitivity of [0, 1, 2] as const) expect(fuse({ S2: 1 }, { sensitivity }).score).toBeLessThan(30);
  });

  it('sends a honeytoken straight to 100 REVOKE with root cause TRIPWIRE', () => {
    const r = fuse({}, { sensitivity: 3, honeytoken: true });
    expect(r).toMatchObject({ score: 100, band: 'REVOKE', rootCause: 'TRIPWIRE' });
  });

  it('gives 0 ALLOW and no root cause when nothing fires', () => {
    expect(fuse({}, { sensitivity: 3 })).toMatchObject({ score: 0, band: 'ALLOW', rootCause: null });
  });

  // Every scenario vector the sim prints, recomputed by the engine.
  const cases: [string, Strengths, number, boolean, number][] = [
    ['D2a', { S1: 0.29, S2: 0.30, S3: 0.20, S4: 0.225 }, 3, false, 69],
    ['D2b', { S1: 0.332, S2: 0.25, S3: 0.28, S4: 0.225 }, 1, true, 72],
    ['D4a', { S1: 0.29, S2: 0.16, S3: 0.20, S4: 0.225 }, 3, false, 63],
    ['D7', { S1: 0.24, S3: 0.28, S6: 0.6 }, 1, true, 78],
    ['D12', { S5: 0.43 }, 1, false, 37],
    ['D12b', { S5: 0.5 }, 1, false, 43],
  ];
  it.each(cases)('agrees with the sim on %s', (_id, weighted, sens, egress, expected) => {
    const strengths = raw(weighted);
    const mine = fuse(strengths, { sensitivity: sens as 0 | 1 | 2 | 3, egress });
    const sim = simFuse(strengths, sens, { egress });
    expect(mine.score).toBe(sim.score);
    expect(mine.band).toBe(sim.band);
    expect(mine.loo).toEqual(sim.loo);
    expect(Math.abs(mine.score - expected)).toBeLessThanOrEqual(1);
  });

  it('agrees with the sim on 2,000 random factor vectors', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
    const factors: Factor[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'DA'];
    for (let i = 0; i < 2000; i++) {
      const s: Strengths = {};
      for (const f of factors) if (rand() < 0.5) s[f] = rand();
      const sens = Math.floor(rand() * 4) as 0 | 1 | 2 | 3;
      const egress = rand() < 0.3;
      const mine = fuse(s, { sensitivity: sens, egress });
      const sim = simFuse(s, sens, { egress });
      expect([mine.score, mine.band, mine.loo]).toEqual([sim.score, sim.band, sim.loo ?? {}]);
    }
  });
});
