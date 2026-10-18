import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/crypto';
import { GENESIS, Ledger, maskSensitive, verifyChain } from '../src/store/ledger';

async function sample() {
  const l = new Ledger();
  await l.append('decision', { id: 'd2_0004', tool: 'hr.read_salary', score: 69, band: 'DOWN_SCOPE' }, 1000);
  await l.append('token_reissue', { agent: 'procurement-01', from: 1, to: 2 }, 1001);
  await l.append('decision', { id: 'd2_0005', tool: 'http.post', score: 72, band: 'QUARANTINE' }, 1002);
  return l;
}

describe('ledger', () => {
  it('starts from 64 zeros and links every entry to the one before', async () => {
    const recs = (await sample()).records();
    expect(GENESIS).toBe('0'.repeat(64));
    expect(recs[0]!.prevHash).toBe(GENESIS);
    for (let i = 1; i < recs.length; i++) expect(recs[i]!.prevHash).toBe(recs[i - 1]!.hash);
    expect(recs.map(r => r.seq)).toEqual([0, 1, 2]);
  });

  it('hashes match an independent node:crypto computation', async () => {
    for (const r of (await sample()).records()) {
      const body = canonicalJSON({ seq: r.seq, ts: r.ts, type: r.type, payload: r.payload });
      expect(r.hash).toBe(createHash('sha256').update(r.prevHash + body).digest('hex'));
    }
  });

  it('verifies an intact chain', async () => {
    expect(await verifyChain((await sample()).records())).toBeNull();
  });

  it('names the first edited row', async () => {
    const recs = structuredClone((await sample()).records());
    (recs[1]!.payload as Record<string, unknown>).to = 9;
    expect(await verifyChain(recs)).toBe(1);
  });

  it('catches a deleted row and a reordered chain', async () => {
    const recs = (await sample()).records();
    expect(await verifyChain([recs[0]!, recs[2]!])).toBe(1);
    expect(await verifyChain([recs[1]!, recs[0]!, recs[2]!])).toBe(0);
  });

  it('catches a row whose hash was recomputed but whose successor was not', async () => {
    const recs = structuredClone((await sample()).records());
    recs[0]!.payload = { id: 'd2_0004', tool: 'hr.read_salary', score: 5, band: 'ALLOW' };
    recs[0]!.hash = createHash('sha256').update(GENESIS + canonicalJSON({ seq: 0, ts: 1000, type: 'decision', payload: recs[0]!.payload })).digest('hex');
    expect(await verifyChain(recs)).toBe(1);
  });

  it('masks IBANs and email addresses before hashing', async () => {
    expect(maskSensitive({ note: 'pay LT12 1000 0111 0100 1000 now', to: 'finance@acme-verify.co', list: ['ap@nordwind.example'] }))
      .toEqual({ note: 'pay LT12…1000 now', to: 'f***@acme-verify.co', list: ['a***@nordwind.example'] });
    const l = new Ledger();
    const r = await l.append('decision', { to: 'finance@acme-verify.co' }, 1);
    expect(r.payload).toEqual({ to: 'f***@acme-verify.co' });
  });
});
