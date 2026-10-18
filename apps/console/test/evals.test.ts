// The Evaluations page reads the committed results.json. These tests check the derived numbers against the raw ones,
// and that the file still matches what the engine does today (a stale file fails here, not on stage).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIGS, FAMILIES, COHORTS } from '@swaroop/eval';
import { headline, spotCheck, stopProfile, weaknesses, type EvalFile } from '../src/live/evals';

const file = JSON.parse(readFileSync(resolve(__dirname, '../public/eval/results.json'), 'utf8')) as EvalFile;

describe('committed results.json', () => {
  it('is the full test split: every family and cohort under every config', () => {
    expect(file.meta).toMatchObject({ split: 'test', seeds: [2000, 2199], trialsPerFamily: 200, synthetic: true });
    expect(file.attacks.map(a => a.id)).toEqual(FAMILIES.map(f => f.id));
    expect(file.benign.map(b => b.id)).toEqual(COHORTS.map(c => c.id));
    for (const a of file.attacks) expect(Object.keys(a.byConfig)).toEqual(CONFIGS.map(c => c.id));
    expect(file.latency!.calls).toBeGreaterThanOrEqual(10_000);
  });

  it('matches the engine: the first 3 test seeds of every family replay to the same outcome', async () => {
    const checks = await spotCheck(file, 3);
    expect(checks.filter(c => !c.match)).toEqual([]);
    expect(checks).toHaveLength(FAMILIES.length * 2);
  }, 30_000);
});

describe('derived views', () => {
  it('headline pools the families the engine is meant to catch', () => {
    const h = headline(file);
    const fams = file.attacks.filter(a => !a.expectedMiss);
    expect(h.families).toBe(fams.length);
    expect(h.full.k).toBe(fams.reduce((s, a) => s + a.byConfig.full!.k, 0));
    expect(h.full.n).toBe(fams.length * 200);
    expect(h.credentials.k).toBe(fams.reduce((s, a) => s + a.byConfig.credentials!.k, 0));
    expect(h.everyday.sessions).toBe(file.benign.filter(b => !b.shifted).length * 200);
  });

  it('stop profile adds up to the trials', () => {
    for (const a of file.attacks) {
      const p = stopProfile(a);
      expect(p.stops.reduce((s, x) => s + x.n, 0) + p.missed).toBe(p.n);
      expect(p.missed).toBe(a.byConfig.full!.n - a.byConfig.full!.k);
    }
  });

  it('weaknesses list every benign cohort the full engine flagged and every family it let through', () => {
    const w = weaknesses(file);
    for (const b of file.benign) expect(w.some(x => x.id === `benign:${b.id}`)).toBe(b.byConfig.full!.flagged > 0);
    for (const a of file.attacks) {
      const listed = w.some(x => x.id === `attack:${a.id}` || x.id === `expected:${a.id}`);
      expect(listed).toBe(a.expectedMiss || a.byConfig.full!.k < a.byConfig.full!.n);
    }
  });
});
