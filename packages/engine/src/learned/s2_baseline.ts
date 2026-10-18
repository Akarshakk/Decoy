// S2 behaviour baseline (Phase II-B). Ported line for line from research/sim/model.mjs; parity is tested.
// Markov tool-sequence model with Dirichlet back-off to a unigram whose prior is 50/50 charter + peer pooled frequency.
// S2 strength = max(seq, vol); weight 0.30, so behaviour alone can never block.

const EPS = 0.02, ALPHA = 20, BETA = 5, MIN_OBS = 30, TAU_DEFAULT = 6, CONFIDENCE_K = 20;

export class Baseline {
  charter: Set<string>;
  n = 0;
  uni = new Map<string, number>();
  bi = new Map<string, Map<string, number>>();
  surprises: number[] = [];

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
    this.surprises.push(this.surprise(prev, t)); this.n++;
    this.uni.set(t, (this.uni.get(t) ?? 0) + 1);
    const row = this.bi.get(prev) ?? new Map<string, number>(); row.set(t, (row.get(t) ?? 0) + 1); this.bi.set(prev, row);
  }
  tau(): number {
    if (this.surprises.length >= MIN_OBS) { const s = [...this.surprises].sort((a, b) => a - b); return s[Math.floor(0.95 * (s.length - 1))]!; }
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
    return b;
  }
}

// Volume bands: per-tool count per session. Fit = plain mean/std over training sessions.
export class VolumeBands {
  sessions: Map<string, number>[] = [];
  observeSession(s: string[]) { const c = new Map<string, number>(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1); this.sessions.push(c); }
  stats(t: string) {
    const xs = this.sessions.map(c => c.get(t) ?? 0), n = xs.length || 1;
    const mu = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
    return { mu, sd: Math.max(sd, 0.25) };   // floor so never-seen tools don't explode
  }
  // Per-session excess z above 2σ, summed over tools (input to the drift accumulator).
  excess(s: string[]) {
    const c = new Map<string, number>(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1);
    let e = 0; for (const [t, k] of c) { const { mu, sd } = this.stats(t); e += Math.max(0, (k - mu) / sd - 2); } return e;
  }
  // S2 volume strength in [0,1] for the running count k of tool t in the current session.
  vol(t: string, k: number) { const { mu, sd } = this.stats(t); return Math.max(0, Math.min(1, ((k - mu) / sd - 3) / 3)); }
  clone(): VolumeBands { const v = new VolumeBands(); v.sessions = this.sessions.map(c => new Map(c)); return v; }
}
