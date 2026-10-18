import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, canonicalJSON, fingerprint, hmacSha256, sha256Hex } from '../src/crypto';

describe('sha256Hex', () => {
  it('matches the FIPS 180-2 "abc" vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('hmacSha256', () => {
  it('matches RFC 4231 test case 2', async () => {
    const mac = await hmacSha256('Jefe', 'what do ya want for nothing?');
    expect(Buffer.from(mac).toString('hex')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('base64url', () => {
  it('round-trips bytes and uses the URL-safe alphabet without padding', () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 1]);
    const enc = b64urlEncode(bytes);
    expect(enc).not.toMatch(/[+/=]/);
    expect([...b64urlDecode(enc)]).toEqual([...bytes]);
  });
});

describe('canonicalJSON', () => {
  it('sorts keys at every depth so equal objects hash equally', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(canonicalJSON({ x: 1, y: 2 })).toBe(canonicalJSON({ y: 2, x: 1 }));
  });
});

describe('fingerprint', () => {
  it('is the first 12 hex chars of sha256', async () => {
    expect(await fingerprint('abc')).toBe('ba7816bf8f01');
  });
});
