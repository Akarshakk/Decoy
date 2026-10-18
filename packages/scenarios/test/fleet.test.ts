// The console's live sandbox: one long-lived fleet that runs benign workdays and takes injected incidents.
// Incidents reuse the §6 scenario scripts, so on a fresh fleet they must print exactly the §6 numbers.
import { describe, expect, it } from 'vitest';
import { verifyChain } from '@swaroop/engine';
import { DAY } from '@swaroop/world';
import { INCIDENTS, LEGIT, Run, workday } from '../src';

const incident = (id: string) => INCIDENTS.find(i => i.id === id)!;
const scores = (run: Run) => run.engine.decisions.map(d => d.score);

describe('workday', () => {
  it('runs one benign session per active agent, holds nothing and moves the clock a day', async () => {
    const run = await Run.create();
    const t0 = run.t;
    const r = await workday(run);
    expect(r.sessions).toBe(4);
    expect(new Set(run.engine.decisions.map(d => d.call.agentId))).toEqual(new Set(['procurement-01', 'procurement-02', 'hr-assist-01', 'mailer-01']));
    expect(Math.max(...scores(run))).toBeLessThan(30);
    expect(Object.values(run.engine.agentStates()).every(s => s === 'active')).toBe(true);
    expect(run.t - t0).toBeGreaterThanOrEqual(DAY - 60 * 60_000);
    expect(await verifyChain(run.engine.ledgerRecords())).toBeNull();
  });

  it('two working weeks: nothing at or above 30, no drift alarm, and the new agent leaves cold start', async () => {
    const run = await Run.create();
    for (let i = 0; i < 10; i++) await workday(run);
    expect(scores(run).filter(s => s >= 30)).toEqual([]);
    expect(run.engine.ledgerRecords().some(r => r.type === 'drift_alarm')).toBe(false);
    expect(run.engine.baselineOf('procurement-02').n).toBeGreaterThan(0);
  });

  it('is deterministic: same fleet, same days, same ledger head', async () => {
    const head = async () => { const run = await Run.create(); await workday(run); await workday(run); return run.engine.ledgerRecords().at(-1)!.hash; };
    expect(await head()).toBe(await head());
  });

  it('skips agents that are quarantined or revoked: their owner has to act first', async () => {
    const run = await Run.create();
    await incident('d8').play(run);                       // hr-assist-01 revoked
    const before = run.engine.decisions.length;
    const r = await workday(run);
    expect(r.skipped).toEqual(['hr-assist-01']);
    expect(run.engine.decisions.slice(before).some(d => d.call.agentId === 'hr-assist-01')).toBe(false);
  });
});

describe('incidents on a fresh fleet print the §6 numbers', () => {
  it('D2 poisoned PDF: 69 DOWN_SCOPE then 72 QUARANTINE escalated', async () => {
    const run = await Run.create();
    await incident('d2').play(run);
    expect(scores(run)).toEqual([0, 5, 0, 69, 72, 0]);
  });

  it('D4 new agent: 63 then 69 escalated', async () => {
    const run = await Run.create();
    await incident('d4').play(run);
    expect(scores(run)).toEqual([0, expect.any(Number), 63, 69]);
  });

  it('D5 leaves the 37 HOLD pending for the owner instead of approving it', async () => {
    const run = await Run.create();
    await incident('d5').play(run);
    const held = [...run.engine.holds.values()];
    expect(held.map(h => [h.decision.score, h.status])).toEqual([[37, 'pending']]);
    expect(run.engine.charterOf('procurement-01').version).toBe(1);
  });

  it('D6 slow drift alarms at session 7 and holds the next export', async () => {
    const run = await Run.create();
    const r = await incident('d6').play(run) as { alarmAt: number };
    expect(r.alarmAt).toBe(7);
    expect(run.engine.agent('procurement-01').state).toBe('watch');
  });

  it('D7 delegated mailer: 78 on the delegated session only', async () => {
    const run = await Run.create();
    await incident('d7').play(run);
    expect(scores(run)).toEqual([expect.any(Number), 78, 0]);
    expect(run.engine.agent('mailer-01').state).toBe('active');
  });

  it('D8 decoy file: 100 REVOKE', async () => {
    const run = await Run.create();
    await incident('d8').play(run);
    expect(scores(run)).toEqual([100]);
  });

  it('D12 stolen token: 37 then 43, at night, and the clock never runs backwards', async () => {
    const run = await Run.create();
    const t0 = run.t;
    await incident('d12').play(run);
    expect(scores(run)).toEqual([13, 37, 43]);               // as on a fresh sandbox: the real agent at 02:58 is itself unusual-hour (13, ALLOW)
    expect(run.engine.decisions.every(d => d.call.ts >= t0)).toBe(true);
    expect(new Date(run.engine.decisions[1]!.call.ts).getUTCHours()).toBe(3);
  });
});

describe('incidents after a working week keep their verdicts', () => {
  const after = async (id: string) => {
    const run = await Run.create();
    for (let i = 0; i < 5; i++) await workday(run);
    const from = run.engine.decisions.length;
    const out = await incident(id).play(run);
    return { run, ds: run.engine.decisions.slice(from), out };
  };

  it('D2: the salary read is still blocked with valid credentials and nothing is posted', async () => {
    const { run, ds } = await after('d2');
    const read = ds.find(d => d.call.tool === 'hr.read_salary')!;
    expect(read.credentials.ok).toBe(true);
    expect(read.band).toBe('DOWN_SCOPE');
    expect(ds.find(d => d.call.tool === 'http.post')!.band).toBe('QUARANTINE');
    expect(run.backends.count('http.post')).toBe(0);
  });

  it('D6 still alarms inside the 2–8 session window', async () => {
    const { out } = await after('d6');
    const at = (out as { alarmAt: number }).alarmAt;
    expect(at).toBeGreaterThanOrEqual(2);
    expect(at).toBeLessThanOrEqual(8);
  });

  it('D8 still revokes and D12 still holds', async () => {
    expect((await after('d8')).ds[0]!.band).toBe('REVOKE');
    const d12 = (await after('d12')).ds;
    expect(d12.slice(1).map(d => d.band)).toEqual(['HOLD', 'HOLD']);
  });
});

describe('new incidents and legitimate change on the fleet', () => {
  it('D14 poisoned tool waits in the hold queue for the owner, with the tool change in the ledger', async () => {
    const run = await Run.create();
    await workday(run);
    await incident('d14').play(run);
    const pending = [...run.engine.holds.values()].filter(h => h.status === 'pending');
    expect(pending.map(h => h.decision.call.tool)).toEqual(['erp.get_vendor']);
    expect(run.engine.unvetted.has('erp.get_vendor')).toBe(true);
    expect(run.engine.ledgerRecords().map(r => r.type)).toContain('tool_changed');
  });

  it('a quarter-end batch day runs every call, raises no alert and no drift alarm', async () => {
    const run = await Run.create();
    await workday(run);
    const ds = await LEGIT.find(l => l.id === 'batch')!.play(run) as { band: string; executed: boolean }[];
    expect(ds.length).toBe(45);
    expect(ds.every(d => d.band === 'ALLOW' && d.executed)).toBe(true);
    expect(run.engine.agent('procurement-01').state).toBe('active');
    expect(run.engine.ledgerRecords().some(r => r.type === 'drift_alarm')).toBe(false);
  });
});
