// S2 behaviour baseline (Phase II-B). Ported line for line from research/sim/model.mjs; parity is tested.
// Markov tool-sequence model with Dirichlet back-off to a unigram whose prior is 50/50 charter + peer pooled frequency.
// S2 strength = max(seq, vol); weight 0.30, so behaviour alone can never block.

const EPS = 0.02, ALPHA = 20, BETA = 5, MIN_OBS = 30, TAU_DEFAULT = 6;
export const CONFIDENCE_K = 20;

export class Baseline {
  charter: Set<string>;
  n = 0;
  uni = new Map<string, number>();
  bi = new Map<string, Map<string, number>>();
  surprises: number[] = [];
  private sorted: number[] = [];            // the same surprises kept in order, so τ is a lookup, not a sort per session

  constructor(charterTools: string[], readonly catalog: string[], readonly peer: Baseline | null = null) {
    this.charter = new Set(charterTools);
  }

  setCharter(tools: string[]) { this.charter = new Set(tools); }

  charterPrior(t: string) { const i = this.charter.size, o = this.catalog.length - i; return this.charter.has(t) ? (1 - EPS) / i : EPS / o; }
  prior(t: string): number {
    if (!this.peer) return this.charterPrior(t);
    return 0.5 * this.charterPrior(t) + 0.5 * this.peer.pUni(t);
  }
  pUni(t: string): number { return ((this.uni.get(t) ?? 0) + ALPHA * this.prior(t)) / (this.n + ALPHA); }
  pBi(prev: string, t: string) {
    const row = this.bi.get(prev) ?? new Map<string, number>();
    const rn = [...row.values()].reduce((a, b) => a + b, 0);
    return ((row.get(t) ?? 0) + BETA * this.pUni(t)) / (rn + BETA);
  }
  surprise(prev: string, t: string) { return -Math.log2(this.pBi(prev, t)); }
  observe(prev: string, t: string) {
    const x = this.surprise(prev, t);
    this.surprises.push(x); this.n++;
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.sorted[mid]! <= x) lo = mid + 1; else hi = mid; }
    this.sorted.splice(lo, 0, x);
    this.uni.set(t, (this.uni.get(t) ?? 0) + 1);
    const row = this.bi.get(prev) ?? new Map<string, number>(); row.set(t, (row.get(t) ?? 0) + 1); this.bi.set(prev, row);
  }
  tau(): number {
    if (this.sorted.length >= MIN_OBS) return this.sorted[Math.floor(0.95 * (this.sorted.length - 1))]!;
    return this.peer ? this.peer.tau() : TAU_DEFAULT;
  }
  // S2 sequence strength in [0,1]: 10 bits above τ saturates.
  seq(prev: string, t: string) { return Math.max(0, Math.min(1, (this.surprise(prev, t) - this.tau()) / 10)); }

  confidence() { return this.n / (this.n + CONFIDENCE_K); }

  // A frozen copy for the drift accumulator; the peer stays shared (it is someone else's live baseline).
  clone(): Baseline {
    const b = new Baseline([...this.charter], this.catalog, this.peer);
    b.n = this.n;
    b.uni = new Map(this.uni);
    b.bi = new Map([...this.bi].map(([k, row]) => [k, new Map(row)]));
    b.surprises = [...this.surprises];
    b.sorted = [...this.sorted];
    return b;
  }
}

// Volume bands: per-tool count per session. Fit = plain mean/std over training sessions.
export const MIN_FRESH_SESSIONS = 5;   // a tool added by a role change has no volume band until it has this many sessions

export class VolumeBands {
  sessions: Map<string, number>[] = [];
  private since = new Map<string, number>();   // tool → first session that counts (set when a role change adds the tool)
  private cache = new Map<string, { mu: number; sd: number; known: boolean }>();   // per tool; cleared when a session is learned
  observeSession(s: string[]) { const c = new Map<string, number>(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1); this.sessions.push(c); this.cache.clear(); }
  /** The tool just joined the role: sessions before now say nothing about how often the role uses it. */
  restart(t: string) { this.since.set(t, this.sessions.length); this.cache.delete(t); }
  stats(t: string) {
    let hit = this.cache.get(t);
    if (!hit) { hit = this.fit(t); this.cache.set(t, hit); }
    return hit;
  }
  private fit(t: string) {
    const xs = this.sessions.slice(this.since.get(t) ?? 0).map(c => c.get(t) ?? 0), n = xs.length || 1;
    const mu = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
    // floor so never-seen tools don't explode; a restarted tool is unknown until it has MIN_FRESH_SESSIONS sessions
    return { mu, sd: Math.max(sd, 0.25), known: !this.since.has(t) || xs.length >= MIN_FRESH_SESSIONS };
  }
  // Per-session excess z above 2σ, split by whether the tool touches sensitive data or acts outside (input to the drift accumulator).
  excessSplit(s: string[], sensitive: (tool: string) => boolean) {
    const c = new Map<string, number>(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1);
    let low = 0, high = 0;
    for (const [t, k] of c) {
      const { mu, sd, known } = this.stats(t);
      const e = known ? Math.max(0, (k - mu) / sd - 2) : 0;
      if (sensitive(t)) high += e; else low += e;
    }
    return { low, high };
  }
  // Per-session excess z above 2σ, summed over tools.
  excess(s: string[]) {
    const c = new Map<string, number>(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1);
    let e = 0; for (const [t, k] of c) { const { mu, sd, known } = this.stats(t); if (known) e += Math.max(0, (k - mu) / sd - 2); } return e;
  }
  // S2 volume strength in [0,1] for the running count k of tool t in the current session.
  vol(t: string, k: number) { const { mu, sd, known } = this.stats(t); return known ? Math.max(0, Math.min(1, ((k - mu) / sd - 3) / 3)) : 0; }
  clone(): VolumeBands { const v = new VolumeBands(); v.sessions = this.sessions.map(c => new Map(c)); v.since = new Map(this.since); return v; }
}
