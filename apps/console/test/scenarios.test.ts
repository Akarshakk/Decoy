// The Investigate page and the landing page read these views; every value comes from a fresh engine run.
import { describe, expect, it } from 'vitest';
import { buildUp, runScenario, SCENARIO_LIST } from '../src/live/scenarios';

const scores = (v: { steps: { decision: { score: number } }[] }) => v.steps.map(s => s.decision.score);

describe('scenario views', () => {
  it('lists the scenarios the console can replay', () => {
    expect(SCENARIO_LIST.map(s => s.id)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd12', 'd14']);
  });

  it('D2: §6 scores, the untrusted PDF, the taint edges into the two blocked calls, and the in-role call that still works', async () => {
    const v = await runScenario('d2');
    expect(scores(v)).toEqual([0, 5, 0, 69, 72, 0]);
    expect(v.steps.map(s => s.tag ?? null)).toEqual([null, null, 'untrusted', null, null, 'still works']);
    expect(v.steps[2]!.arg).toBe('inv-204511.pdf');
    expect(v.steps[4]!.arg).toBe('acme-verify.co');
    expect(v.taint).toEqual({ from: 2, to: [3, 4] });
    expect(v.twin).toMatchObject({ atStep: 3, agent: 'hr-assist-01' });
    expect(v.twin!.decision.score).toBe(0);
    expect(v.egress).toEqual([]);                       // nothing left the building
  });

  it('D2 in shadow mode: the upload scores 77 and actually leaves', async () => {
    const v = await runScenario('d2', 'shadow');
    expect(scores(v)).toEqual([0, 5, 0, 69, 77, 0]);
    expect(v.egress).toEqual(['http.post → acme-verify.co']);
  });

  it('D3 twins with the procurement read from D2', async () => {
    const v = await runScenario('d3');
    expect(scores(v)).toEqual([0, 0]);
    expect(v.twin).toMatchObject({ atStep: 1, agent: 'procurement-01' });
    expect(v.twin!.decision.score).toBe(69);
  });

  it('D5: the owner approval and the next session are drawn as a divider before the 15', async () => {
    const v = await runScenario('d5');
    expect(scores(v)).toEqual([6, 37, 6, 15]);
    expect(v.steps[2]!.divider).toMatch(/role change · charter v1 → v2/);
    expect(v.steps[0]!.divider).toBeUndefined();
  });

  it('D6: the drift series alarms at session 7 with every earlier call under 30, and the spine is the held session', async () => {
    const v = await runScenario('d6');
    const d = v.drift!;
    expect(d.findIndex(s => s.alarm) + 1).toBe(7);
    expect(Math.max(...d.slice(0, 7).map(s => s.maxCall))).toBeLessThan(30);
    expect(d[0]!.exports).toBe(0);
    expect(v.steps.at(-1)!.decision.call.tool).toBe('erp.export_report');
    expect(v.steps.at(-1)!.decision.band).toBe('HOLD');
  });

  it('D7: the delegated send is tagged, and the mailer’s own send is its twin rather than a step', async () => {
    const v = await runScenario('d7');
    expect(v.steps.map(s => [s.agent, s.decision.score, s.tag ?? null])).toEqual([
      ['procurement-01', expect.any(Number), 'untrusted'], ['mailer-01', 78, 'delegated']]);
    expect(v.twin!.decision.score).toBe(0);
    expect(v.taint).toEqual({ from: 0, to: [1] });
  });

  it('D12: the thief’s calls are tagged as a new runtime', async () => {
    const v = await runScenario('d12');
    expect(v.steps.map(s => [s.decision.score, s.tag ?? null])).toEqual([[13, null], [37, 'new runtime'], [43, 'new runtime']]);
  });

  it('D14: the changed tool is tagged and held, and the taint thread runs from its output to the blocked salary read and upload', async () => {
    const v = await runScenario('d14');
    expect(v.steps[0]!.tag).toBe('changed tool');
    expect(v.steps[0]!.decision.band).toBe('HOLD');
    expect(v.taint).toEqual({ from: 0, to: [1, 2] });
    expect(v.steps.slice(1, 3).map(s => s.decision.executed)).toEqual([false, false]);
    expect(v.egress).toEqual([]);
  });

  it('caches runs: the same scenario and mode is played once', async () => {
    expect(await runScenario('d8')).toBe(await runScenario('d8'));
  });
});

describe('score build-up', () => {
  it('adds factors largest first and lands exactly on the engine score', async () => {
    for (const id of ['d2', 'd4', 'd5', 'd7', 'd12']) {
      for (const s of (await runScenario(id)).steps) {
        const b = buildUp(s.decision);
        if (!s.decision.factors.length) { expect(b).toEqual([]); continue; }
        expect(Math.round(b.at(-1)!.cumulative)).toBe(s.decision.score);
        expect(b.every((x, i) => i === 0 || x.cumulative >= b[i - 1]!.cumulative)).toBe(true);
      }
    }
  });

  it('D2 upload: S1 first, then S3, S2, S4, ending at 72', async () => {
    const b = buildUp((await runScenario('d2')).steps[4]!.decision);
    expect(b.map(x => x.factor)).toEqual(['S1', 'S3', 'S2', 'S4']);
    expect(Math.round(b[0]!.cumulative)).toBe(33);
  });

  it('the tripwire is a single bar at 100', async () => {
    expect(buildUp((await runScenario('d8')).steps[0]!.decision)).toEqual([{ factor: 'TRIPWIRE', weighted: 1, cumulative: 100 }]);
  });
});
