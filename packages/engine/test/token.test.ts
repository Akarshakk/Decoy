import { describe, expect, it } from 'vitest';
import { b64urlDecodeText, b64urlEncodeText } from '../src/crypto';
import { mintToken, TOKEN_TTL_S, verifyToken } from '../src/token';

const KEY = 'demo-sandbox-key';
const T0 = 1_760_000_000;
const base = { sub: 'procurement-01', role: 'procurement', scope: ['erp.get_vendor', 'hr.read_salary'], ver: 1, jti: 'jti-1' };

describe('token service', () => {
  it('mints a token that verifies, with exp = iat + 15 min', async () => {
    const jwt = await mintToken(base, KEY, T0);
    const r = await verifyToken(jwt, KEY, { now: T0 + 60, expectedVer: 1, tool: 'erp.get_vendor' });
    expect(r.ok).toBe(true);
    expect(r.claims).toMatchObject({ ...base, iat: T0, exp: T0 + TOKEN_TTL_S });
    expect(TOKEN_TTL_S).toBe(900);
  });

  it('rejects a payload edited after signing', async () => {
    const [h, p, s] = (await mintToken(base, KEY, T0)).split('.');
    const forged = JSON.parse(b64urlDecodeText(p!));
    forged.scope.push('payments.pay_invoice');
    const r = await verifyToken(`${h}.${b64urlEncodeText(JSON.stringify(forged))}.${s}`, KEY, { now: T0, expectedVer: 1, tool: 'erp.get_vendor' });
    expect(r).toMatchObject({ ok: false, reason: 'bad signature' });
  });

  it('rejects a token signed with another key', async () => {
    const jwt = await mintToken(base, 'other-key', T0);
    expect(await verifyToken(jwt, KEY, { now: T0, expectedVer: 1, tool: 'erp.get_vendor' })).toMatchObject({ ok: false, reason: 'bad signature' });
  });

  it('rejects alg "none"', async () => {
    const [, p] = (await mintToken(base, KEY, T0)).split('.');
    const none = `${b64urlEncodeText(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${p}.`;
    expect(await verifyToken(none, KEY, { now: T0, expectedVer: 1, tool: 'erp.get_vendor' })).toMatchObject({ ok: false, reason: 'unsupported alg' });
  });

  it('rejects an expired token', async () => {
    const jwt = await mintToken(base, KEY, T0);
    expect(await verifyToken(jwt, KEY, { now: T0 + TOKEN_TTL_S + 1, expectedVer: 1, tool: 'erp.get_vendor' }))
      .toMatchObject({ ok: false, reason: 'expired' });
  });

  it('rejects an old version after a re-issue', async () => {
    const v1 = await mintToken(base, KEY, T0);
    expect(await verifyToken(v1, KEY, { now: T0, expectedVer: 2, tool: 'erp.get_vendor' }))
      .toMatchObject({ ok: false, reason: 'token v1 superseded by v2' });
  });

  it('rejects a tool outside the scope but still returns the claims as evidence', async () => {
    const jwt = await mintToken(base, KEY, T0);
    const r = await verifyToken(jwt, KEY, { now: T0, expectedVer: 1, tool: 'http.post' });
    expect(r).toMatchObject({ ok: false, reason: 'http.post not in token scope' });
    expect(r.claims?.sub).toBe('procurement-01');
  });

  it('carries the RFC 8693 act chain for delegation', async () => {
    const jwt = await mintToken({ ...base, sub: 'mailer-01', role: 'mailer', scope: ['mail.send'], act: { sub: 'procurement-01' } }, KEY, T0);
    const r = await verifyToken(jwt, KEY, { now: T0, expectedVer: 1, tool: 'mail.send' });
    expect(r.claims?.act).toEqual({ sub: 'procurement-01' });
  });

  it('rejects malformed input', async () => {
    expect(await verifyToken('not-a-jwt', KEY, { now: T0, expectedVer: 1, tool: 'x' })).toMatchObject({ ok: false, reason: 'malformed' });
  });
});
