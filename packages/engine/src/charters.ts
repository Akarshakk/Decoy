// Role Charter Registry: charters are signed with the registry key over their canonical JSON (sig excluded).
import { canonicalJSON, hmacSha256, toHex } from './crypto';
import type { Charter } from './types';

const body = ({ sig: _sig, ...rest }: Charter) => canonicalJSON(rest);

export async function signCharter(c: Omit<Charter, 'sig'> & { sig?: string }, key: string): Promise<Charter> {
  const unsigned = { ...c, sig: '' } as Charter;
  return { ...unsigned, sig: toHex(await hmacSha256(key, body(unsigned))) };
}

export async function verifyCharter(c: Charter, key: string) {
  return c.sig === toHex(await hmacSha256(key, body(c)));
}
