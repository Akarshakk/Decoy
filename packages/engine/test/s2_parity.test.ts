// Parity: the engine's S2 baseline and volume bands must equal research/sim/model.mjs exactly.
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs reference implementation, no types
import * as sim from '../../../research/sim/model.mjs';
import { CHARTER_PROCUREMENT_V2, CHARTERS_V1, procSession, rng } from '@swaroop/world';
import { Baseline, VolumeBands } from '../src/learned/s2_baseline';

const CATALOG: string[] = sim.CATALOG;
const PROC = CHARTERS_V1.procurement.tools;

function trainBoth(seed: number, sessions: number) {
  const mine = new Baseline(PROC, CATALOG), theirs = new sim.Baseline(sim.PROC_V1);
  const mv = new VolumeBands(), tv = new sim.VolumeBands();
  const a = rng(seed), b = sim.rng(seed);
  for (let i = 0; i < sessions; i++) {
    const s = procSession(a), t = sim.procSession(b);
    mv.observeSession(s); tv.observeSession(t);
    for (let j = 1; j < s.length; j++) { mine.observe(s[j - 1]!, s[j]!); theirs.observe(t[j - 1], t[j]); }
  }
  return { mine, theirs, mv, tv };
}

describe('S2 parity with the sim', () => {
  const { mine, theirs, mv, tv } = trainBoth(42, 40);

  it('has the same 308 observations and τ', () => {
    expect(mine.n).toBe(308);
    expect(mine.tau()).toBe(theirs.tau());
    expect(mine.tau()).toBeCloseTo(3.6, 1);
  });

  it('gives identical surprise and sequence strength for every transition', () => {
    for (const prev of ['START', ...CATALOG]) for (const t of CATALOG) {
      expect(mine.surprise(prev, t)).toBe(theirs.surprise(prev, t));
      expect(mine.seq(prev, t)).toBe(theirs.seq(prev, t));
    }
    expect(+mine.surprise('docs.read_attachment', 'hr.read_salary').toFixed(1)).toBe(14.4);
  });

  it('cold start with and without a peer prior matches (D4: 0.16 vs 0.06 weighted)', () => {
    const coldMine = new Baseline(PROC, CATALOG, mine), coldSim = new sim.Baseline(sim.PROC_V1, theirs);
    const bareMine = new Baseline(PROC, CATALOG), bareSim = new sim.Baseline(sim.PROC_V1);
    for (const prev of ['START', ...CATALOG]) for (const t of CATALOG) {
      expect(coldMine.seq(prev, t)).toBe(coldSim.seq(prev, t));
      expect(bareMine.seq(prev, t)).toBe(bareSim.seq(prev, t));
    }
    expect(+(0.3 * coldMine.seq('docs.read_attachment', 'hr.read_salary')).toFixed(2)).toBe(0.16);
    expect(+(0.3 * bareMine.seq('docs.read_attachment', 'hr.read_salary')).toFixed(2)).toBe(0.06);
  });

  it('a charter change moves the prior exactly as the sim does (D5)', () => {
    const { mine: m, theirs: t } = trainBoth(42, 40);
    m.setCharter(CHARTER_PROCUREMENT_V2.tools);
    t.charter = new Set(sim.PROC_V2);
    expect(m.seq('erp.create_purchase_request', 'erp.onboard_supplier')).toBe(t.seq('erp.create_purchase_request', 'erp.onboard_supplier'));
  });

  it('volume bands give identical strengths and per-session excess', () => {
    for (const t of CATALOG) for (let k = 0; k <= 12; k++) expect(mv.vol(t, k)).toBe(tv.vol(t, k));
    const r = rng(1006);
    for (let i = 0; i < 100; i++) { const s = procSession(r); expect(mv.excess(s)).toBe(tv.excess(s)); }
  });

  it('a snapshot is frozen: training the live baseline does not move it', () => {
    const { mine: live } = trainBoth(42, 40);
    const snap = live.clone();
    const before = snap.surprise('erp.get_vendor', 'erp.export_report');
    for (let i = 0; i < 20; i++) live.observe('erp.get_vendor', 'erp.export_report');
    expect(snap.surprise('erp.get_vendor', 'erp.export_report')).toBe(before);
    expect(live.surprise('erp.get_vendor', 'erp.export_report')).toBeLessThan(before);
  });

  it('τ and volume stats stay in step with the sim as both keep learning (no stale cache)', () => {
    const { mine: m, theirs: t, mv: v, tv: w } = trainBoth(42, 40);
    const a = rng(77), b = sim.rng(77);
    for (let i = 0; i < 30; i++) {
      expect(m.tau()).toBe(t.tau());
      expect(v.vol('erp.get_price_list', 4)).toBe(w.vol('erp.get_price_list', 4));
      const s = procSession(a), u = sim.procSession(b);
      v.observeSession(s); w.observeSession(u);
      for (let j = 1; j < s.length; j++) { m.observe(s[j - 1]!, s[j]!); t.observe(u[j - 1], u[j]); }
      expect(m.clone().tau()).toBe(t.tau());
      const { mu, sd } = v.clone().stats('mail.send');
      expect({ mu, sd }).toEqual(w.stats('mail.send'));
    }
  });

  it('reports confidence n/(n+20)', () => {
    expect(mine.confidence()).toBeCloseTo(308 / 328, 12);
    expect(new Baseline(PROC, CATALOG).confidence()).toBe(0);
  });
});
