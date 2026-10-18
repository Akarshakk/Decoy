import { describe, expect, it } from 'vitest';
import { percentile, wilson } from '../src/stats';

describe('wilson', () => {
  it('matches the textbook 95% interval for 5 of 10', () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 4);
    expect(hi).toBeCloseTo(0.7634, 4);
  });
  it('stays inside [0, 1] at the edges and is not degenerate', () => {
    expect(wilson(0, 200)[0]).toBe(0);
    expect(wilson(0, 200)[1]).toBeCloseTo(0.0188, 4);
    expect(wilson(200, 200)[1]).toBe(1);
    expect(wilson(200, 200)[0]).toBeCloseTo(0.9812, 4);
  });
  it('has no interval for no trials', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe('percentile', () => {
  it('uses the nearest-rank method', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect([percentile(xs, 0.5), percentile(xs, 0.95), percentile(xs, 1)]).toEqual([50, 95, 100]);
    expect(percentile([7], 0.95)).toBe(7);
  });
});
