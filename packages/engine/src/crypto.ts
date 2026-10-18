// Web Crypto only, so the engine runs unchanged in the browser and in Node.
const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacSha256(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

export function b64urlEncode(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export const b64urlEncodeText = (text: string) => b64urlEncode(enc.encode(text));
export const b64urlDecodeText = (s: string) => new TextDecoder().decode(b64urlDecode(s));

export function canonicalJSON(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJSON(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// Value fingerprint used by the flow check: sha256(value)[:12].
export const fingerprint = async (value: string) => (await sha256Hex(value)).slice(0, 12);
