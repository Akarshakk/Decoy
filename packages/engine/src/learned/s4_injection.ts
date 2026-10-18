// S4 injection provenance (Phase II-B). Weight 0.25. No LLM: a heuristic content classifier plus a shift test.
// classifier = nor(.6·hidden content, .5·imperative addressed to the assistant, .3·tool/action words, .3·URL host ≠ sender domain)
// S4 = score of the most recent untrusted document in the session, only if ≥ .5 and this call is off-baseline (S2 seq > 0).
import { nor } from '../fusion/fuse';
import { hostMatches } from '../tools';
import type { SubSignal } from '../types';

export interface InjectionFinding { code: 'hidden_content' | 'imperative' | 'tool_words' | 'foreign_url'; value: number; evidence: string }
export interface InjectionResult { score: number; findings: InjectionFinding[] }

const HIDDEN = [/<!--[\s\S]*?-->/, /[​-‍⁠﻿]/, /color\s*:\s*(#fff(?:fff)?|white)\b/i];
const IMPERATIVE = [/\b(assistant|ai agent|agent)\s*:/i, /\bignore (all |any )?(previous|prior) instructions\b/i, /\byou must\b/i];
const TOOL_WORDS = /\b(POST|fetch|send|export)\b/i;
const URL_HOST = /https?:\/\/([^\s/<>"')]+)/gi;

export function classifyInjection(doc: { text: string; senderDomain: string }): InjectionResult {
  const findings: InjectionFinding[] = [];
  const first = (res: RegExp[]) => res.map(re => doc.text.match(re)?.[0]).find(Boolean);
  const hidden = first(HIDDEN);
  if (hidden) findings.push({ code: 'hidden_content', value: 0.6, evidence: hidden.slice(0, 80) });
  const imp = first(IMPERATIVE);
  if (imp) findings.push({ code: 'imperative', value: 0.5, evidence: imp });
  const tw = doc.text.match(TOOL_WORDS)?.[0];
  if (tw) findings.push({ code: 'tool_words', value: 0.3, evidence: tw });
  const foreign = [...doc.text.matchAll(URL_HOST)].map(m => m[1]!.toLowerCase()).find(h => !hostMatches(h, doc.senderDomain));
  if (foreign) findings.push({ code: 'foreign_url', value: 0.3, evidence: foreign });
  return { score: nor(findings.map(f => f.value)), findings };
}

const LABELS: [InjectionFinding['code'][], string][] = [
  [['hidden_content', 'imperative'], 'hidden instruction'],
  [['hidden_content'], 'hidden text'],
  [['imperative'], 'instruction to the assistant'],
  [['tool_words'], 'action words'],
  [['foreign_url'], 'foreign URL'],
];

function describeFindings(codes: Set<string>) {
  const out: string[] = [];
  for (const [need, label] of LABELS) if (need.every(c => codes.has(c))) { out.push(label); need.forEach(c => codes.delete(c)); }
  return out.join(', ');
}

export function s4Injection({ latest, seq }: { latest: ({ docId: string } & InjectionResult) | null; seq: number }) {
  if (!latest || latest.score < 0.5 || seq <= 0) return { strength: 0, subs: [] as SubSignal[], culpritDoc: undefined };
  const why = describeFindings(new Set(latest.findings.map(f => f.code)));
  return {
    strength: latest.score,
    culpritDoc: latest.docId,
    subs: [{ code: 'post_ingest_shift', value: latest.score, reason: `culprit: ${latest.docId} (${why}), behaviour shifted after ingest`,
      evidence: [latest.docId, ...latest.findings.map(f => f.evidence)] }] as SubSignal[],
  };
}
