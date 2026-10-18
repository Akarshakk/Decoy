// Agent Token Service: HS256 JWTs via Web Crypto. The key is a per-sandbox demo key (the UI labels it so).
// Down-scope / quarantine re-issue the token with ver+1; any older ver is rejected.
import { b64urlDecode, b64urlDecodeText, b64urlEncode, b64urlEncodeText, hmacSha256 } from './crypto';
import type { TokenClaims } from './types';

export const TOKEN_TTL_S = 15 * 60;

export async function mintToken(claims: Omit<TokenClaims, 'iat' | 'exp'>, key: string, nowS: number) {
  const header = b64urlEncodeText(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncodeText(JSON.stringify({ ...claims, iat: nowS, exp: nowS + TOKEN_TTL_S }));
  return `${header}.${payload}.${b64urlEncode(await hmacSha256(key, `${header}.${payload}`))}`;
}

export interface VerifyResult { ok: boolean; reason?: string; claims?: TokenClaims }

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyToken(jwt: string, key: string, opts: { now: number; expectedVer: number; tool: string }): Promise<VerifyResult> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string }, claims: TokenClaims;
  try {
    header = JSON.parse(b64urlDecodeText(h));
    claims = JSON.parse(b64urlDecodeText(p));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'HS256') return { ok: false, reason: 'unsupported alg' };
  if (!timingSafeEqual(b64urlDecode(s), await hmacSha256(key, `${h}.${p}`))) return { ok: false, reason: 'bad signature' };
  if (opts.now > claims.exp) return { ok: false, reason: 'expired', claims };
  if (claims.ver !== opts.expectedVer) return { ok: false, reason: `token v${claims.ver} superseded by v${opts.expectedVer}`, claims };
  if (!claims.scope.includes(opts.tool)) return { ok: false, reason: `${opts.tool} not in token scope`, claims };
  return { ok: true, claims };
}
