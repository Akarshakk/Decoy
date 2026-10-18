// The console's live store and the views its pages render. Everything here is read off a real Engine.
import { describe, expect, it } from 'vitest';
import { LiveStore } from '../src/live/store';
import { agentView, alerts, byRootCause, fleet, ledgerView, pendingHolds, tamperCheck } from '../src/live/view';

const booted = async () => { const s = new LiveStore(); await s.boot(); return s; };
const engineOf = (s: LiveStore) => s.getState().run!.engine;

describe('boot', () => {
  it('starts one sandbox with a real workday: four agents, all active, nothing held, ledger verified', async () => {
    const s = await booted();
    const st = s.getState();
    expect(st.busy).toBeNull();
    expect(st.ledger.ok).toBe(true);
    const rows = fleet(engineOf(s));
    expect(rows.map(r => r.id)).toEqual(['procurement-01', 'procurement-02', 'hr-assist-01', 'mailer-01']);
    expect(rows.every(r => r.state === 'active' && r.recent.length > 0 && r.recent.every(c => c.score < 30))).toBe(true);
    expect(alerts(engineOf(s))).toEqual([]);
  });

  it('boots once even if asked twice (React StrictMode mounts effects twice)', async () => {
    const s = new LiveStore();
    await Promise.all([s.boot(), s.boot()]);
    expect(new Set(engineOf(s).decisions.map(d => d.call.sessionId)).size).toBe(4);
  });

  it('flags tokens wider than the charter, as provisioned in the PS', async () => {
    const rows = fleet(engineOf(await booted()));
    const extra = Object.fromEntries(rows.map(r => [r.id, r.extraScopes]));
    expect(extra['procurement-01']).toEqual(['erp.onboard_supplier', 'hr.read_salary', 'hr.list_employees', 'http.post', 'payments.pay_invoice']);
    expect(extra['hr-assist-01']).toEqual(['http.post']);
    expect(extra['mailer-01']).toEqual([]);
  });
});

describe('incidents and alerts', () => {
  it('D2 lands as two blocked alerts on procurement-01, root causes from the engine, token cut to v3', async () => {
    const s = await booted();
    await s.inject('d2');
    const e = engineOf(s);
    const list = alerts(e);
    expect(list.map(a => [a.decision.call.tool, a.decision.score, a.decision.band, a.status])).toEqual([
      ['http.post', 72, 'QUARANTINE', 'blocked'], ['hr.read_salary', 69, 'DOWN_SCOPE', 'blocked']]);
    expect(byRootCause(list)).toEqual([{ cause: 'S2', count: 1 }, { cause: 'S1', count: 1 }].sort((a, b) => a.cause.localeCompare(b.cause)));
    const row = fleet(e).find(r => r.id === 'procurement-01')!;
    expect([row.state, row.tokenVer]).toEqual(['quarantined', 3]);
    const v = agentView(e, 'procurement-01');
    expect(v.scopes.find(x => x.name === 'http.post')!.removedIn).toBe(2);
    expect(v.scopes.find(x => x.name === 'erp.get_vendor')!.inCharter).toBe(true);
    expect(v.scopes.find(x => x.name === 'erp.get_vendor')!.removedIn).toBeUndefined();
  });

  it('shadow mode: the same incident is logged as "would have", nothing is cut', async () => {
    const s = await booted();
    s.setMode('shadow');
    await s.inject('d2');
    const list = alerts(engineOf(s));
    expect(list.every(a => a.status === 'shadow')).toBe(true);
    expect(list.map(a => a.decision.score)).toEqual([77, 69]);
    expect(fleet(engineOf(s)).find(r => r.id === 'procurement-01')!.tokenVer).toBe(1);
  });

  it('serialises actions: two incidents fired together both land, in order', async () => {
    const s = await booted();
    await Promise.all([s.inject('d8'), s.inject('d12')]);
    const tools = alerts(engineOf(s)).map(a => a.decision.call.agentId);
    expect(tools).toEqual(['procurement-01', 'procurement-01', 'hr-assist-01']);
  });
});

describe('owner actions from the hold queue', () => {
  it('D5: the 37 HOLD waits in the queue; approving it as a role change signs charter v2', async () => {
    const s = await booted();
    await s.inject('d5');
    const q = pendingHolds(engineOf(s));
    expect(q.map(h => [h.decision.call.tool, h.decision.score, h.offCharter])).toEqual([['erp.onboard_supplier', 37, true]]);
    await s.approveAsRoleChange(q[0]!.decision.id);
    const e = engineOf(s);
    expect(pendingHolds(e)).toEqual([]);
    expect(alerts(e)[0]!.status).toBe('role_change');
    const v = agentView(e, 'procurement-01');
    expect(v.charter.version).toBe(2);
    expect(v.charterHistory).toEqual([expect.objectContaining({ from: 1, to: 2, added: ['erp.onboard_supplier'] })]);
    expect(s.getState().ledger.ok).toBe(true);
  });

  it('denying a hold never runs the call', async () => {
    const s = await booted();
    await s.inject('d5');
    const id = pendingHolds(engineOf(s))[0]!.decision.id;
    await s.denyHold(id);
    expect(alerts(engineOf(s))[0]!.status).toBe('denied');
    expect(s.getState().run!.backends.count('erp.onboard_supplier')).toBe(0);
  });

  it('D6: the accumulator history shows the alarm; owner reset clears the latch and the watch state', async () => {
    const s = await booted();
    await s.inject('d6');
    let v = agentView(engineOf(s), 'procurement-01');
    expect(v.drift.alarmed).toBe(true);
    expect(v.drift.history.filter(h => h.alarm)).toHaveLength(1);
    expect(v.row.state).toBe('watch');
    await s.ownerReset('procurement-01');
    v = agentView(engineOf(s), 'procurement-01');
    expect([v.drift.alarmed, v.row.state]).toEqual([false, 'active']);
  });

  it('reset gives a fresh sandbox in enforce mode', async () => {
    const s = await booted();
    s.setMode('shadow');
    await s.inject('d8');
    await s.reset();
    expect(s.getState().mode).toBe('enforce');
    expect(alerts(engineOf(s))).toEqual([]);
  });
});

describe('agent view', () => {
  it('baseline: confidence n/(n+20), own p95, and the top transition every procurement session starts with', async () => {
    const v = agentView(engineOf(await booted()), 'procurement-01');
    expect(v.baseline.confidence).toBeCloseTo(v.baseline.n / (v.baseline.n + 20), 10);
    expect(v.baseline.source).toBe('own');
    expect(v.transitions[0]).toMatchObject({ from: 'erp.get_price_list', to: 'erp.get_price_list' });
    expect(v.transitions.find(t => t.from === 'START')).toMatchObject({ to: 'erp.get_vendor', count: 41 });   // 40 history sessions + the boot workday
    expect(v.transitions.every((t, i, a) => i === 0 || a[i - 1]!.count >= t.count)).toBe(true);
    expect(v.transitions.every(t => t.p > 0 && t.p <= 1)).toBe(true);
  });

  it('a new agent borrows its peer: volume bands and p95 come from procurement-01', async () => {
    const v = agentView(engineOf(await booted()), 'procurement-02');
    expect(v.baseline.source).toBe('peer');
    expect(v.baseline.peer).toBe('procurement-01');
    expect(v.volume.every(b => b.source === 'peer')).toBe(true);
  });
});

describe('ledger', () => {
  it('lists every record and verifies the chain', async () => {
    const s = await booted();
    const lv = await ledgerView(engineOf(s));
    expect(lv.records.length).toBe(engineOf(s).ledgerRecords().length);
    expect(lv.brokenAt).toBeNull();
  });

  it('tampering with a copy breaks the chain at that record and leaves the real ledger intact', async () => {
    const s = await booted();
    const e = engineOf(s);
    expect(await tamperCheck(e, 3)).toBe(3);
    expect((await ledgerView(e)).brokenAt).toBeNull();
  });
});

describe('surviving a reload', () => {
  const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };

  it('replays the logged actions into the same sandbox: same decisions, same ledger head', async () => {
    const storage = memory();
    const a = new LiveStore(storage);
    await a.boot();
    await a.inject('d5');
    await a.approveAsRoleChange(pendingHolds(engineOf(a))[0]!.decision.id);
    a.setMode('shadow');
    await a.inject('d2');
    await a.workday();
    const b = new LiveStore(storage);
    await b.boot();
    expect(b.getState().mode).toBe('shadow');
    expect(b.getState().ledger.head).toBe(a.getState().ledger.head);
    expect(engineOf(b).decisions.map(d => d.id)).toEqual(engineOf(a).decisions.map(d => d.id));
  });

  it('reset clears the log; a broken or unreadable log falls back to a fresh sandbox', async () => {
    const storage = memory();
    const a = new LiveStore(storage);
    await a.boot();
    await a.inject('d8');
    await a.reset();
    const b = new LiveStore(storage);
    await b.boot();
    expect(alerts(engineOf(b))).toEqual([]);
    storage.setItem('swaroop.sandbox.v1', '{not json');
    const c = new LiveStore(storage);
    await c.boot();
    expect(c.getState().ledger.ok).toBe(true);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    const d = new LiveStore(throwing);
    await d.boot();
    await d.inject('d8');
    expect(alerts(engineOf(d))).toHaveLength(1);
  });
});

