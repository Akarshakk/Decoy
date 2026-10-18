// Reference model for S2 (behaviour baseline) and volume bands (spec: build_execution.md §5). Shared by fusion_sim and drift_acc_sim.
const CATALOG = [
  'erp.get_vendor', 'erp.get_price_list', 'erp.search_invoices', 'erp.create_purchase_request',
  'erp.export_report', 'erp.onboard_supplier', 'docs.read_attachment', 'mail.send',
  'hr.read_salary', 'hr.list_employees', 'http.post', 'payments.pay_invoice',
];
const PROC_V1 = ['erp.get_vendor', 'erp.get_price_list', 'erp.search_invoices', 'erp.create_purchase_request',
  'erp.export_report', 'docs.read_attachment', 'mail.send'];
const PROC_V2 = [...PROC_V1, 'erp.onboard_supplier'];
const EPS = 0.02, ALPHA = 20, BETA = 5, MIN_OBS = 30, TAU_DEFAULT = 6;

function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32; }

class Baseline {
  constructor(charter, peer = null) {
    this.charter = new Set(charter); this.peer = peer; this.uni = new Map(); this.bi = new Map(); this.n = 0; this.surprises = [];
  }
  charterPrior(t) { const i = this.charter.size, o = CATALOG.length - i; return this.charter.has(t) ? (1 - EPS) / i : EPS / o; }
  prior(t) { // 50/50 charter + peer pooled frequency (peer smoothed by its own charter prior)
    if (!this.peer) return this.charterPrior(t);
    return 0.5 * this.charterPrior(t) + 0.5 * this.peer.pUni(t);
  }
  pUni(t) { return ((this.uni.get(t) ?? 0) + ALPHA * this.prior(t)) / (this.n + ALPHA); }
  pBi(prev, t) {
    const row = this.bi.get(prev) ?? new Map(); const rn = [...row.values()].reduce((a, b) => a + b, 0);
    return ((row.get(t) ?? 0) + BETA * this.pUni(t)) / (rn + BETA);
  }
  surprise(prev, t) { return -Math.log2(this.pBi(prev, t)); }
  observe(prev, t) {
    this.surprises.push(this.surprise(prev, t)); this.n++;
    this.uni.set(t, (this.uni.get(t) ?? 0) + 1);
    const row = this.bi.get(prev) ?? new Map(); row.set(t, (row.get(t) ?? 0) + 1); this.bi.set(prev, row);
  }
  tau() {
    if (this.surprises.length >= MIN_OBS) { const s = [...this.surprises].sort((a, b) => a - b); return s[Math.floor(0.95 * (s.length - 1))]; }
    return this.peer ? this.peer.tau() : TAU_DEFAULT;
  }
  // S2 sequence strength in [0,1]: 10 bits above tau saturates
  seq(prev, t) { return Math.max(0, Math.min(1, (this.surprise(prev, t) - this.tau()) / 10)); }
}

// EWMA volume bands: per-tool count per session. Fit = plain mean/std over training sessions (EWMA with long half-life ≈ mean).
class VolumeBands {
  constructor() { this.sessions = []; }
  observeSession(s) { const c = new Map(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1); this.sessions.push(c); }
  stats(t) {
    const xs = this.sessions.map(c => c.get(t) ?? 0), n = xs.length || 1;
    const mu = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
    return { mu, sd: Math.max(sd, 0.25) };              // floor so never-seen tools don't explode
  }
  // per-session excess z above 2 sigma, split into ordinary and sensitive tools (drift accumulator input; sensitive is uncapped)
  excessSplit(s, sensitive) { const c = new Map(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1);
    let low = 0, high = 0; for (const [t, k] of c) { const { mu, sd } = this.stats(t); const e = Math.max(0, (k - mu) / sd - 2); if (sensitive.has(t)) high += e; else low += e; } return { low, high }; }
  // per-session excess z above 2 sigma, summed over tools
  excess(s) { const c = new Map(); for (const t of s.slice(1)) c.set(t, (c.get(t) ?? 0) + 1);
    let e = 0; for (const [t, k] of c) { const { mu, sd } = this.stats(t); e += Math.max(0, (k - mu) / sd - 2); } return e; }
  // S2 volume strength in [0,1] for the running count of tool t in the current session
  vol(t, k) { const { mu, sd } = this.stats(t); return Math.max(0, Math.min(1, ((k - mu) / sd - 3) / 3)); }
}

function procSession(r) {
  const s = ['START', 'erp.get_vendor', 'erp.get_price_list'];
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) s.push(r() < 0.5 ? 'erp.search_invoices' : 'erp.get_price_list');
  if (r() < 0.6) s.push('docs.read_attachment');
  s.push('erp.create_purchase_request');
  if (r() < 0.4) s.push('mail.send');
  if (r() < 0.07) s.push('erp.export_report');
  return s;
}
const train = (b, r, sessions, vb = null) => { for (let i = 0; i < sessions; i++) { const s = procSession(r); vb?.observeSession(s); for (let j = 1; j < s.length; j++) b.observe(s[j - 1], s[j]); } };

// Sensitivity >= 2 or an action that sends outside, pays or deletes (build_execution.md §4.1): excess volume of these is never capped.
const SENSITIVE = new Set(['erp.export_report', 'hr.read_salary', 'hr.list_employees', 'http.post', 'payments.pay_invoice']);

export { CATALOG, PROC_V1, PROC_V2, SENSITIVE, Baseline, VolumeBands, procSession, train, rng };
