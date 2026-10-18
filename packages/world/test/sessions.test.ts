import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs reference implementation, no types
import { procSession as simProc, rng as simRng } from '../../../research/sim/model.mjs';
import { hrSession, mailerSession, procSession, rng } from '../src/sessions';

describe('session generators', () => {
  it('rng is the sim’s LCG, value for value', () => {
    const a = rng(42), b = simRng(42);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('procurement-01 history: 40 sessions from rng(42) equal the sim’s and total 308 calls', () => {
    const a = rng(42), b = simRng(42);
    let calls = 0;
    for (let i = 0; i < 40; i++) {
      const s = procSession(a);
      expect(s).toEqual(simProc(b));
      calls += s.length - 1;
    }
    expect(calls).toBe(308);
  });

  it('HR and mailer sessions stay inside their charters and start with START', () => {
    const hr = new Set(['hr.read_salary', 'hr.list_employees', 'docs.read_attachment', 'mail.send']);
    const r = rng(43), m = rng(44);
    for (let i = 0; i < 200; i++) {
      const h = hrSession(r), ms = mailerSession(m);
      expect(h[0]).toBe('START');
      expect(h.slice(1).every(t => hr.has(t))).toBe(true);
      expect(h).toContain('hr.read_salary');
      expect(ms.slice(1).every(t => t === 'mail.send')).toBe(true);
      expect(ms.length).toBeGreaterThan(1);
    }
  });
});
