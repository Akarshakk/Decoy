// Runs every family and cohort under every config and returns the report as plain JSON. No file system, no clock in
// the outcomes: the same seeds give the same results anywhere, including in the browser (only latency differs).
import { Run } from '@swaroop/scenarios';
import { argsFor, procSession, rng } from '@swaroop/world';
import { COHORTS, type Cohort, type CohortTally } from './benign';
import { CONFIGS, type Config } from './configs';
import { FAMILIES, type Family, type Variant } from './families';
import { percentile, wilson } from './stats';

// dev: free to look at while building. seen: the first report's test split (2000–2199); its results shaped the fixes in
// build_execution.md §8, so it is no longer held out. test: never looked at before the final report.
export const SPLITS = { dev: [1000, 1099], seen: [2000, 2199], test: [3000, 3199] } as const;
export const seedsOf = ([a, b]: readonly [number, number]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export interface Rate { k: number; n: number; rate: number; ci: [number, number] }
const rate = (k: number, n: number): Rate => ({ k, n, rate: n ? k / n : 0, ci: wilson(k, n) });

export interface FamilyRun { caught: string; detectAt: (number | null)[] }   // caught: '1'/'0' per seed

export async function runFamily(f: Family, c: Config, seeds: number[]): Promise<FamilyRun> {
  let caught = '';
  const detectAt: (number | null)[] = [];
  for (const seed of seeds) {
    const o = await f.trial(seed).play(await Run.create({ detectors: c.detectors }));
    caught += o.damage ? '0' : '1';
    detectAt.push(o.damage ? null : o.detectAt);
  }
  return { caught, detectAt };
}

export interface AttackResult {
  id: string; label: string; summary: string; damage: string; unit: 'calls' | 'sessions'; horizon?: number; expectedMiss: boolean;
  variants: Variant[];
  byConfig: Record<string, Rate & FamilyRun>;
}

export interface CohortResult {
  id: string; label: string; summary: string; shifted: boolean;
  byConfig: Record<string, CohortTally & { flaggedRate: Rate; blockedRate: Rate }>;
}

export interface LatencyResult {
  config: string; calls: number; inlineUs: Pct; totalUs: Pct;
  histogram: { edgeUs: number; inline: number; total: number }[];
  byTool: { tool: string; calls: number; totalUs: Pct }[];
  firstInSession: Pct;      // the first call after a session ends pays for refitting the volume bands the agent just learned
  laterInSession: Pct;
}
export interface Pct { p50: number; p95: number; p99: number; max: number }

/** Share of trials caught for each value of each variant field (e.g. style = plain-business: 31 of 40). */
export function breakdown(variants: Variant[], caught: string) {
  const out: { field: string; value: string; caught: number; n: number }[] = [];
  const fields = [...new Set(variants.flatMap(v => Object.keys(v)))];
  for (const field of fields) {
    const values = [...new Set(variants.map(v => String(v[field])))].sort();
    for (const value of values) {
      const idx = variants.flatMap((v, i) => (String(v[field]) === value ? [i] : []));
      out.push({ field, value, n: idx.length, caught: idx.filter(i => caught[i] === '1').length });
    }
  }
  return out;
}

const HIST_EDGES = [25, 50, 100, 200, 300, 500, 1000, 2000, Infinity];

/**
 * Per-call latency over benign procurement traffic after a warm-up. `inline` is token verification plus S1, S3 and S5
 * (what must sit in the request path); `total` is the whole decision: it adds S2, S4, S6, drift, fusion, the
 * explanation, and (for calls that run) the simulated backend plus fingerprinting its result. The ledger write is not included.
 */
export async function measureLatency(c: Config, calls: number, warmup = 2000): Promise<LatencyResult> {
  const run = await Run.create({ detectors: c.detectors });
  const total: number[] = [], inline: number[] = [], tools: string[] = [], first: boolean[] = [];
  let seed = 0, seen = 0;
  while (total.length < calls) {
    const r = rng(500_000 + seed++);
    const s = await run.session('procurement-01');
    for (const [j, t] of procSession(r).slice(1).entries()) {
      const d = await s.call(t, argsFor(t, r));
      if (++seen > warmup && total.length < calls) { total.push(d.latencyUs); inline.push(d.inlineLatencyUs); tools.push(t); first.push(j === 0); }
    }
    await s.end();
    run.nextDay();
  }
  const pct = (xs: number[]): Pct => ({ p50: percentile(xs, 0.5), p95: percentile(xs, 0.95), p99: percentile(xs, 0.99), max: Math.max(...xs) });
  const bucket = (xs: number[], lo: number, hi: number) => xs.filter(x => x >= lo && x < hi).length;
  const histogram = HIST_EDGES.map((edgeUs, i) => {
    const lo = i ? HIST_EDGES[i - 1]! : 0;
    return { edgeUs, inline: bucket(inline, lo, edgeUs), total: bucket(total, lo, edgeUs) };
  });
  const byTool = [...new Set(tools)].map(tool => {
    const xs = total.filter((_, i) => tools[i] === tool);
    return { tool, calls: xs.length, totalUs: pct(xs) };
  }).sort((a, b) => b.totalUs.p50 - a.totalUs.p50);
  return { config: c.id, calls: total.length, inlineUs: pct(inline), totalUs: pct(total), histogram, byTool,
    firstInSession: pct(total.filter((_, i) => first[i])), laterInSession: pct(total.filter((_, i) => !first[i])) };
}

export interface EvalOptions {
  split?: keyof typeof SPLITS;
  seeds?: number[];                 // overrides split (tests, the in-browser spot check)
  families?: Family[];
  cohorts?: Cohort[];
  configs?: Config[];
  latencyCalls?: number;            // 0 skips latency
  onProgress?: (msg: string) => void;
}

export interface Results {
  meta: { split: string; seeds: [number, number]; trialsPerFamily: number; sessionsPerCohort: number; synthetic: true };
  configs: { id: string; label: string; note: string; factors: string[]; tripwire: boolean }[];
  attacks: AttackResult[];
  benign: CohortResult[];
  latency: LatencyResult | null;
}

export async function evaluate(opts: EvalOptions = {}): Promise<Results> {
  const split = opts.split ?? 'test';
  const seeds = opts.seeds ?? seedsOf(SPLITS[split]);
  const configs = opts.configs ?? CONFIGS, families = opts.families ?? FAMILIES, cohorts = opts.cohorts ?? COHORTS;
  const log = opts.onProgress ?? (() => {});

  const attacks: AttackResult[] = [];
  for (const f of families) {
    const byConfig: AttackResult['byConfig'] = {};
    for (const c of configs) {
      log(`${f.id} · ${c.id}`);
      const r = await runFamily(f, c, seeds);
      byConfig[c.id] = { ...rate([...r.caught].filter(x => x === '1').length, seeds.length), ...r };
    }
    attacks.push({ id: f.id, label: f.label, summary: f.summary, damage: f.damage, unit: f.unit, horizon: f.horizon, expectedMiss: !!f.expectedMiss,
      variants: seeds.map(s => f.trial(s).variant), byConfig });
  }

  const benign: CohortResult[] = [];
  for (const co of cohorts) {
    const byConfig: CohortResult['byConfig'] = {};
    for (const c of configs) {
      log(`${co.id} · ${c.id}`);
      const t = await co.run(seeds, { detectors: c.detectors });
      byConfig[c.id] = { ...t, flaggedRate: rate(t.flagged, t.sessions), blockedRate: rate(t.blocked, t.calls) };
    }
    benign.push({ id: co.id, label: co.label, summary: co.summary, shifted: co.shifted, byConfig });
  }

  const latencyCalls = opts.latencyCalls ?? 10_000;
  const full = configs.find(c => c.id === 'full');
  if (latencyCalls > 0 && full) log('latency · full');
  const latency = latencyCalls > 0 && full ? await measureLatency(full, latencyCalls) : null;

  return {
    meta: { split: opts.seeds ? 'custom' : split, seeds: [Math.min(...seeds), Math.max(...seeds)], trialsPerFamily: seeds.length, sessionsPerCohort: seeds.length, synthetic: true },
    configs: configs.map(c => ({ id: c.id, label: c.label, note: c.note, factors: c.detectors.factors, tripwire: c.detectors.tripwire })),
    attacks, benign, latency,
  };
}
