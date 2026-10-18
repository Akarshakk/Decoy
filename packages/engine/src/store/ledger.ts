// Trust Ledger (build_execution.md §5.4): append-only SHA-256 hash chain.
// hash = sha256(prevHash + canonicalJSON({seq, ts, type, payload})); genesis prevHash = 64 zeros.
// IBANs and email addresses are masked before an entry is hashed or stored.
import { canonicalJSON, sha256Hex } from '../crypto';

export const GENESIS = '0'.repeat(64);

export type LedgerType = 'decision' | 'hold_resolved' | 'role_change' | 'token_reissue' | 'fp_review'
  | 'compromise_confirmed' | 'drift_alarm' | 'owner_reset'
  | 'runtime_registered' | 'tool_changed' | 'tool_approved' | 'batch_window';

export interface LedgerRecord { seq: number; ts: number; type: LedgerType; payload: Record<string, unknown>; prevHash: string; hash: string }

const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
const EMAIL_RE = /([\w.+-])[\w.+-]*@([\w-]+(?:\.[\w-]+)+)/g;

const maskText = (s: string) => s
  .replace(IBAN_RE, m => { const v = m.replace(/ /g, ''); return `${v.slice(0, 4)}…${v.slice(-4)}`; })
  .replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}***@${domain}`);

export function maskSensitive<T>(v: T): T {
  if (typeof v === 'string') return maskText(v) as T;
  if (Array.isArray(v)) return v.map(maskSensitive) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskSensitive(x)])) as T;
  return v;
}

const hashOf = (prevHash: string, r: Pick<LedgerRecord, 'seq' | 'ts' | 'type' | 'payload'>) =>
  sha256Hex(prevHash + canonicalJSON({ seq: r.seq, ts: r.ts, type: r.type, payload: r.payload }));

export class Ledger {
  private recs: LedgerRecord[] = [];
  private tail: Promise<unknown> = Promise.resolve();

  // Appends are serialised so concurrent callers can't fork the chain.
  append(type: LedgerType, payload: Record<string, unknown>, ts: number): Promise<LedgerRecord> {
    const next = this.tail.then(async () => {
      const seq = this.recs.length;
      const prevHash = seq ? this.recs[seq - 1]!.hash : GENESIS;
      const masked = maskSensitive(payload);
      const rec: LedgerRecord = { seq, ts, type, payload: masked, prevHash, hash: await hashOf(prevHash, { seq, ts, type, payload: masked }) };
      this.recs.push(rec);
      return rec;
    });
    this.tail = next;
    return next;
  }

  records(): readonly LedgerRecord[] { return this.recs; }
  head(): string { return this.recs.at(-1)?.hash ?? GENESIS; }
}

// Returns the seq position of the first row that breaks the chain, or null when it is intact.
export async function verifyChain(recs: readonly LedgerRecord[]): Promise<number | null> {
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!;
    const prev = i ? recs[i - 1]!.hash : GENESIS;
    if (r.seq !== i || r.prevHash !== prev || r.hash !== (await hashOf(prev, r))) return i;
  }
  return null;
}
