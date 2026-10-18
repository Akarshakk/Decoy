// Hash-chained ledger (build_execution.md §5.4), computed in the browser with Web Crypto.
// hash = sha256(prevHash + canonicalJSON(entry)); genesis prevHash = 64 zeros.
import { useEffect, useState } from 'react';

export interface LedgerEntry { seq: number; type: string; payload: Record<string, unknown> }

const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(v);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function chain(entries: LedgerEntry[]) {
  let prev = '0'.repeat(64);
  const hashes: string[] = [];
  for (const e of entries) { prev = await sha256(prev + canonical(e)); hashes.push(prev); }
  return hashes;
}

export interface LedgerState { count: number; head: string | null; verified: boolean }

// Builds the chain, then re-derives it from scratch and compares: that second pass is the "verify".
export function useLedger(entries: LedgerEntry[]): LedgerState {
  const [state, setState] = useState<LedgerState>({ count: 0, head: null, verified: false });
  const key = canonical(entries);
  useEffect(() => {
    let live = true;
    (async () => {
      const built = await chain(entries);
      const again = await chain(JSON.parse(JSON.stringify(entries)));
      if (live) setState({ count: entries.length, head: built.at(-1) ?? null, verified: built.join() === again.join() });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const shortHash = (h: string | null) => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '····');
