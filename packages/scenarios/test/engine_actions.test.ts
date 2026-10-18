// Owner actions and gateway rules that the §6 scenarios don't exercise on their own.
import { describe, expect, it } from 'vitest';
import { verifyChain } from '@swaroop/engine';
import { HONEYTOKEN } from '@swaroop/world';
import { D2, Run } from '../src';

describe('engine actions', () => {
  it('a denied HOLD never runs, and its session (peak ≥ 30) is not learned', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    await s.call('erp.create_purchase_request', { item: 'A4-80', qty: 10 });
    const held = await s.call('erp.onboard_supplier', { supplier: 'X' });
    expect(held.band).toBe('HOLD');
    await run.engine.denyHold(held.id, run.t);
    const n = run.engine.baselineOf('procurement-01').n;
    const end = await s.end();
    expect(end?.absorbed).toBe(false);
    expect(run.engine.baselineOf('procurement-01').n).toBe(n);
    expect(run.backends.count('erp.onboard_supplier')).toBe(0);
  });

  it('a clean session is absorbed into the live baseline but not into the frozen snapshot', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    await s.call('erp.get_vendor', { id: 'V-118' });
    await s.call('erp.get_price_list', { sku: 'A4-80' });
    expect((await s.end())?.absorbed).toBe(true);
    expect(run.engine.baselineOf('procurement-01').n).toBe(310);
    expect(run.engine.snapshotOf('procurement-01').baseline.n).toBe(308);
  });

  it('a new agent measures drift against its peer\'s volume bands until its own snapshot has 5 sessions', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-02');
    for (const [t, a] of [['erp.get_vendor', { id: 'V-118' }], ['erp.get_price_list', { sku: 'A4-80' }], ['erp.get_price_list', { sku: 'TONER-K' }],
      ['erp.create_purchase_request', { item: 'A4-80', qty: 40 }]] as const) await s.call(t, a);
    const end = await s.end();
    expect(end?.alarm).toBe(false);
    expect(end?.x).toBeLessThan(1);           // an empty snapshot made this 10 + surprise and alarmed on day one
    expect(run.engine.agent('procurement-02').state).toBe('active');
  });

  it('with peers disabled, a new agent\'s drift has no volume term until it has its own bands', async () => {
    const run = await Run.create({ peers: false });
    const s = await run.session('procurement-02');
    for (const [t, a] of [['erp.get_vendor', { id: 'V-118' }], ['erp.get_price_list', { sku: 'A4-80' }], ['erp.get_price_list', { sku: 'TONER-K' }],
      ['erp.create_purchase_request', { item: 'A4-80', qty: 40 }]] as const) await s.call(t, a);
    const end = await s.end();
    expect(end?.alarm).toBe(false);
    expect(end?.x).toBe(0);                  // in-charter tools under the charter prior: no surprise, and no bands to exceed
  });

  it('the agent runtime refreshes its token before the 15-minute expiry; a stolen copy is never refreshed', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    for (let i = 0; i < 12; i++) await s.call('erp.get_price_list', { sku: 'A4-80' });   // 24 minutes
    expect(s.decisions.every(d => d.credentials.ok)).toBe(true);
    const thief = await run.session('procurement-01', { runtime: { id: 'rt-x', asn: 'AS13335' }, jwt: await run.engine.tokenFor('procurement-01', run.t) });
    for (let i = 0; i < 9; i++) await thief.call('erp.get_vendor', { id: 'V-118' });
    expect(thief.decisions.at(-1)!.credentials).toEqual({ ok: false, reason: 'expired' });
  });

  it('after D2 quarantines procurement-01, later calls outside its token are blocked, never held, and it stays quarantined', async () => {
    const run = await Run.create();
    await D2(run);
    const s = await run.session('procurement-01');
    const pr = await s.call('erp.create_purchase_request', { item: 'A4-80', qty: 400 });
    const onboard = await s.call('erp.onboard_supplier', { supplier: 'Nordwind Supplies GmbH' });
    for (const d of [pr, onboard]) expect([d.credentials.ok, d.held, d.executed]).toEqual([false, false, false]);
    expect(run.engine.holds.has(pr.id)).toBe(false);
    expect(run.engine.agent('procurement-01').state).toBe('quarantined');
    expect(run.engine.agent('procurement-01').tokenVer).toBe(3);
  });

  it('owner reset clears the drift latch and the watch state', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    for (let i = 0; i < 12; i++) await s.call('erp.export_report', { report: 'supplier_spend_q3' });
    expect((await s.end())?.alarm).toBe(true);           // a burst of sensitive exports crosses H on its own
    expect(run.engine.agent('procurement-01').state).toBe('watch');
    await run.engine.ownerReset('procurement-01', run.t);
    expect(run.engine.agent('procurement-01').state).toBe('active');
    expect(run.engine.driftOf('procurement-01').strength()).toBe(0);
  });

  it('confirming a compromise revokes the agent; its next call fails credentials', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    await s.call('docs.read_attachment', { file: 'inv-204511.pdf' });
    const d = await s.call('hr.read_salary', { employee: 'all' });
    await run.engine.confirmCompromise(d.id, run.t);
    const next = await s.call('erp.get_vendor', { id: 'V-118' });
    expect(next.credentials).toEqual({ ok: false, reason: 'token revoked' });
    expect(next.executed).toBe(false);
    expect(run.engine.ledgerRecords().some(r => r.type === 'compromise_confirmed')).toBe(true);
  });

  it('REVOKE cascades to the delegated child session', async () => {
    const run = await Run.create();
    const p = await run.session('procurement-01');
    await p.call('erp.get_vendor', { id: 'V-118' });
    const child = await run.delegate(p, 'mailer-01');
    const r = await p.call('docs.read_attachment', { file: HONEYTOKEN });
    expect([r.band, r.tokenAction.cascade]).toEqual(['REVOKE', [`mailer-01:${child.id}`]]);
    const after = await child.call('mail.send', { to: 'buyer@acme.com' });
    expect(after.credentials.reason).toBe('token revoked');
    expect(run.engine.agent('mailer-01').state).toBe('active');
  });

  it('marking a false positive proposes a charter edit and never changes the charter itself', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    await s.call('erp.create_purchase_request', { item: 'A4-80', qty: 10 });
    const held = await s.call('erp.onboard_supplier', { supplier: 'X' });
    const proposal = await run.engine.markFalsePositive(held.id, run.t);
    expect(proposal.proposedAddTool).toBe('erp.onboard_supplier');
    expect(run.engine.charterOf('procurement-01').version).toBe(1);
    expect(run.engine.ledgerRecords().at(-2)!.type).toBe('fp_review');
  });

  it('rejects the old token version after a re-issue', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    const v1 = s.jwt;
    await s.call('docs.read_attachment', { file: 'inv-204511.pdf' });
    await s.call('hr.read_salary', { employee: 'all' });        // 69 → token v2
    s.jwt = v1;
    const d = await s.call('erp.get_vendor', { id: 'V-118' });
    expect(d.credentials).toEqual({ ok: false, reason: 'token v1 superseded by v2' });
  });

  it('trips on the honeytoken in any argument of any tool', async () => {
    const run = await Run.create();
    const s = await run.session('procurement-01');
    const d = await s.call('mail.send', { to: 'buyer@acme.com', attachment: `share/${HONEYTOKEN}` });
    expect([d.score, d.band, d.rootCause]).toEqual([100, 'REVOKE', 'TRIPWIRE']);
  });

  it('is deterministic: the same scenario twice gives the same decisions and ledger head', async () => {
    const a = await D2(), b = await D2();
    expect(a.decisions.map(d => [d.score, d.band, d.ledgerHash])).toEqual(b.decisions.map(d => [d.score, d.band, d.ledgerHash]));
    expect(await verifyChain(a.engine.ledgerRecords())).toBeNull();
  });
});
