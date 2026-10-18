import { describe, expect, it } from 'vitest';
import { createSandbox, historyFor } from '../src/sandbox';
import { AGENT_PROFILES } from '../src/agents';

describe('sandbox', () => {
  it('trains procurement-01 on exactly the sim’s 308 calls', async () => {
    const { engine } = await createSandbox();
    expect(engine.baselineOf('procurement-01').n).toBe(308);
    expect(engine.baselineOf('procurement-02').n).toBe(0);
    expect(engine.baselineOf('procurement-02').peer).toBe(engine.baselineOf('procurement-01'));
  });

  it('learns each agent’s runtime and usual hours from its history', async () => {
    const { engine } = await createSandbox();
    const p = engine.profileOf('procurement-01');
    expect(p.knownRuntimes).toEqual(['rt-proc-01']);
    expect(p.knownAsns).toEqual(['AS64500']);
    expect(p.activeHours[0]).toBeGreaterThanOrEqual(7);
    expect(p.activeHours[1]).toBeLessThanOrEqual(19);
    const hours = historyFor(AGENT_PROFILES[0]!).flatMap(h => h.ts.map(t => new Date(t).getUTCHours()));
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(7);
  });

  it('signs every charter and mints a verifiable v1 token per agent', async () => {
    const { engine } = await createSandbox();
    for (const id of engine.agentIds()) {
      expect(engine.charterOf(id).sig).toMatch(/^[0-9a-f]{64}$/);
      expect(engine.agent(id).tokenVer).toBe(1);
    }
  });

  it('can disable the peer prior (D4 at 59)', async () => {
    const { engine } = await createSandbox({ peers: false });
    expect(engine.baselineOf('procurement-02').peer).toBeNull();
  });
});
