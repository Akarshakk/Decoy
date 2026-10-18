// S3 flow / taint (Phase II-A, inline, deterministic). Weight 0.40.
// s = nor(.5·[sensitive read ≤3 steps after untrusted ingest],
//         1.0·[external send while a completed sensitive read is held],
//         .7·[sink argument first seen in untrusted content and never in trusted content])
// Steps are 0-based internally and printed 1-based.
import { fingerprint } from '../crypto';
import { nor } from '../fusion/fuse';
import { egressHost } from '../tools';
import type { ActionClass, SubSignal, ToolDef } from '../types';

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

// Hosts, emails, URLs and IBANs, in order of first appearance.
export function extractValues(text: string): string[] {
  const out: string[] = [];
  const add = (v: string) => { if (v && !out.includes(v)) out.push(v); };
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    add(url);
    try { add(new URL(url).hostname.toLowerCase()); } catch { /* not a URL after all */ }
  }
  for (const m of text.matchAll(EMAIL_RE)) { add(m[0].toLowerCase()); add(m[0].split('@')[1]!.toLowerCase()); }
  for (const m of text.matchAll(IBAN_RE)) add(m[0].replace(/ /g, ''));
  return out;
}

export interface FlowState {
  untrustedIngests: { step: number; docId: string }[];
  held: { step: number; dataClass: string; sensitivity: number }[];   // completed reads with sensitivity ≥ 2
  untrusted: Map<string, { docId: string; step: number }>;            // fp → first untrusted sighting
  trusted: Set<string>;                                               // fps seen in trusted content
}

export const newFlowState = (): FlowState => ({ untrustedIngests: [], held: [], untrusted: new Map(), trusted: new Set() });

export async function recordIngest(flow: FlowState, e: { step: number; docId: string; trusted: boolean; values: string[] }) {
  if (!e.trusted) flow.untrustedIngests.push({ step: e.step, docId: e.docId });
  for (const v of e.values) {
    const fp = await fingerprint(v.toLowerCase());
    if (e.trusted) flow.trusted.add(fp);
    else if (!flow.untrusted.has(fp)) flow.untrusted.set(fp, { docId: e.docId, step: e.step });
  }
}

export function recordDataRead(flow: FlowState, e: { step: number; dataClass: string; sensitivity: number }) {
  if (e.sensitivity >= 2) flow.held.push(e);
}

export interface Sink { value: string; fp: string }

// The values a sink call would send data to: the raw argument and its host.
export async function sinkValues(tool: ToolDef, args: Record<string, string | number>): Promise<Sink[]> {
  if (!tool.egressArg) return [];
  const raw = String(args[tool.egressArg] ?? '').trim().toLowerCase();
  const host = egressHost(tool, args);
  const values = [...new Set([raw, host].filter((v): v is string => !!v))];
  return Promise.all(values.map(async value => ({ value, fp: await fingerprint(value) })));
}

export function s3Flow({ tool, action, step, flow, sinks }: { tool: ToolDef; action: ActionClass; step: number; flow: FlowState; sinks: Sink[] }) {
  const subs: SubSignal[] = [];

  if (action === 'read' && tool.sensitivity >= 2) {
    const ingest = [...flow.untrustedIngests].reverse().find(i => step > i.step && step - i.step <= 3);
    if (ingest) {
      const gap = step - ingest.step;
      subs.push({ code: 'untrusted_then_sensitive', value: 0.5,
        reason: `sensitive read ${gap} step${gap === 1 ? '' : 's'} after untrusted content (${ingest.docId}, step ${ingest.step + 1})`,
        evidence: [ingest.docId] });
    }
  }

  if (action === 'send_external' && flow.held.length) {
    const h = flow.held[flow.held.length - 1]!;
    subs.push({ code: 'sensitive_held_egress', value: 1,
      reason: `external send while ${h.dataClass} data read at step ${h.step + 1} is held`, evidence: [h.dataClass] });
  }

  const tainted = sinks.find(s => flow.untrusted.has(s.fp) && !flow.trusted.has(s.fp));
  if (tainted) {
    const src = flow.untrusted.get(tainted.fp)!;
    const kind = tainted.value.includes('@') ? 'address' : tainted.value.includes('/') ? 'URL' : 'host';
    subs.push({ code: 'untrusted_sink_arg', value: 0.7,
      reason: `${kind} ${tainted.value} first seen in untrusted content (${src.docId}, step ${src.step + 1})`, evidence: [src.docId, tainted.fp] });
  }

  return { strength: nor(subs.map(s => s.value)), subs };
}
