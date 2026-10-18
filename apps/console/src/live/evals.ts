// The Evaluations page reads public/eval/results.json (written by `npm run eval`) and derives everything else here.
// The spot check replays a few test seeds through the engine in this browser and compares them with the file.
import { useEffect, useState } from 'react';
import { breakdown, CONFIGS, FAMILIES, runFamily, wilson, type AttackResult, type Results } from '@swaroop/eval';

export interface RunMeta { generatedAt: string; commit: string | null; dirty: boolean; node: string; seconds: number; command: string }
export type EvalFile = Results & { run: RunMeta };

let cache: Promise<EvalFile> | null = null;
const load = () => (cache ??= fetch(`${import.meta.env.BASE_URL}eval/results.json`).then(r => {
  if (!r.ok) throw new Error(`results.json: HTTP ${r.status}. Run npm run eval.`);
  return r.json() as Promise<EvalFile>;
}).catch(e => { cache = null; throw e; }));

export function useEvalResults() {
  const [state, setState] = useState<{ data: EvalFile | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    load().then(data => live && setState({ data, error: null }), e => live && setState({ data: null, error: String(e.message ?? e) }));
    return () => { live = false; };
  }, []);
  return state;
}

const count = (bits: string) => [...bits].filter(b => b === '1').length;

/** Pooled over the families the engine is meant to catch (expected misses are reported on their own). */
export function headline(r: Results) {
  const fams = r.attacks.filter(a => !a.expectedMiss);
  const pooled = (cfg: string) => {
    const k = fams.reduce((s, a) => s + a.byConfig[cfg]!.k, 0), n = fams.reduce((s, a) => s + a.byConfig[cfg]!.n, 0);
    return { k, n, rate: n ? k / n : 0, ci: wilson(k, n) };
  };
  const everyday = r.benign.filter(b => !b.shifted);
  const flagged = everyday.reduce((s, b) => s + b.byConfig.full!.flagged, 0), sessions = everyday.reduce((s, b) => s + b.byConfig.full!.sessions, 0);
  return { families: fams.length, full: pooled('full'), credentials: pooled('credentials'), everyday: { flagged, sessions, cohorts: everyday.length } };
}

/** Where each caught trial was stopped (attack call or session number), plus the trials that got through. */
export function stopProfile(a: AttackResult, cfg = 'full') {
  const x = a.byConfig[cfg]!;
  const at = new Map<number, number>();
  for (const d of x.detectAt) if (d !== null) at.set(d, (at.get(d) ?? 0) + 1);
  return { stops: [...at].sort((p, q) => p[0] - q[0]).map(([step, n]) => ({ step, n })), missed: x.n - x.k, n: x.n };
}

export interface Weakness { id: string; kind: 'attack' | 'benign' | 'expected'; title: string; detail: string }

/** Everything the full engine got wrong on this run, worst first, stated with the run's own numbers. */
export function weaknesses(r: Results): Weakness[] {
  const out: Weakness[] = [];
  const pct = (x: number) => `${+(100 * x).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
  const val = (v: string) => (v === 'true' ? 'yes' : v === 'false' ? 'no' : v);
  for (const b of [...r.benign].sort((p, q) => q.byConfig.full!.flaggedRate.rate - p.byConfig.full!.flaggedRate.rate)) {
    const x = b.byConfig.full!;
    if (!x.flagged) continue;
    const parts = [`${x.flagged} of ${x.sessions} sessions flagged`];
    if (x.alarms) parts.push(`${x.alarms} drift alarm${x.alarms === 1 ? '' : 's'}`);
    parts.push(x.blocked ? `${x.blocked} of ${x.calls} calls held or blocked` : 'no call held during these sessions');
    out.push({ id: `benign:${b.id}`, kind: 'benign', title: `${b.label}: ${pct(x.flaggedRate.rate)} of benign sessions flagged`, detail: parts.join(', ') + '.' });
  }
  for (const a of r.attacks) {
    const x = a.byConfig.full!;
    if (a.expectedMiss) {
      out.push({ id: `expected:${a.id}`, kind: 'expected', title: `${a.label}: ${pct(x.rate)} caught (expected miss)`, detail: a.summary });
      continue;
    }
    if (x.k === x.n) continue;
    const weak = breakdown(a.variants, x.caught).filter(v => v.n >= 10 && v.caught < v.n).sort((p, q) => p.caught / p.n - q.caught / q.n).slice(0, 3);
    out.push({ id: `attack:${a.id}`, kind: 'attack', title: `${a.label}: ${x.n - x.k} of ${x.n} got through`,
      detail: weak.length ? `Weakest: ${weak.map(v => `${v.field}: ${val(v.value)} (${v.caught} of ${v.n} caught)`).join('; ')}.` : a.summary });
  }
  return out;
}

export interface SpotCheck { family: string; config: string; seeds: number[]; expected: string; got: string; match: boolean }

/** Replays the first `n` test seeds of every family under two configs in this browser and compares with the file. */
export async function spotCheck(r: Results, n: number, configs = ['credentials', 'full'], onStep?: (done: number, total: number) => void): Promise<SpotCheck[]> {
  const seeds = Array.from({ length: n }, (_, i) => r.meta.seeds[0] + i);
  const jobs = r.attacks.flatMap(a => configs.map(c => ({ a, c })));
  const out: SpotCheck[] = [];
  for (const [i, { a, c }] of jobs.entries()) {
    const fam = FAMILIES.find(f => f.id === a.id), cfg = CONFIGS.find(x => x.id === c);
    const expected = a.byConfig[c]!.caught.slice(0, n);
    const got = fam && cfg ? (await runFamily(fam, cfg, seeds)).caught : '';
    out.push({ family: a.id, config: c, seeds, expected, got, match: got === expected });
    onStep?.(i + 1, jobs.length);
    await new Promise(res => setTimeout(res, 0));     // let the page paint between families
  }
  return out;
}

export { count };
