// Drift accumulator (Phase II-C): CUSUM on per-session excess vs a FROZEN snapshot.
// Input x = min(H, mean excess surprise bits per call + Σ ordinary-tool volume z-excess above 2σ) + Σ sensitive-tool excess.
// The cap: one unusual day of ordinary in-role work (a quarter-end batch) can't alarm alone; sensitive volume can.
import { PROC_V1, SENSITIVE, Baseline, VolumeBands, procSession, train, rng } from './model.mjs';
const r = rng(42);
const vb = new VolumeBands(); const frozen = new Baseline(PROC_V1); train(frozen, r, 40, vb);   // procurement-01 snapshot
const tau = frozen.tau();
const seqX = s => { let e = 0; for (let j = 1; j < s.length; j++) e += Math.max(0, frozen.surprise(s[j-1], s[j]) - tau); return e / (s.length - 1); };
const K = 0.5, H = 5;
function run(label, mk, n, seed, useVol) {
  const a = rng(seed); let S = 0, first = null, alarms = 0;
  for (let i = 1; i <= n; i++) { const s = mk(a, i); const v = useVol ? vb.excessSplit(s, SENSITIVE) : { low: 0, high: 0 };
    S = Math.max(0, S + Math.min(H, seqX(s) + v.low) + v.high - K);
    if (S > H) { alarms++; first ??= i; S = 0; } }
  return { first, alarms };
}
const benign = (a) => procSession(a);
const d6 = (a, i) => { const s = procSession(a); for (let k = 0; k < Math.floor(i / 3); k++) s.push('erp.export_report'); if (i > 6) s.push('mail.send'); return s; };
const d9 = (a) => { const s = procSession(a); s.push('erp.export_report', 'mail.send'); return s; };
const inRate = (a) => procSession(a);   // true mimicry: identical distribution (attacker stages data internally)
for (const useVol of [false, true]) {
  console.log(useVol ? '--- seq + volume' : '--- seq only');
  for (const seed of [7, 99, 1006]) {
    const b = run('benign', benign, 300, seed, useVol), x6 = run('d6', d6, 30, seed, useVol), x9 = run('d9', d9, 40, seed, useVol);
    console.log(`seed ${seed}: benign 300 sessions alarms=${b.alarms} | D6 escalating first=${x6.first} | D9 constant-rate first=${x9.first}`);
  }
}
// per-call ceiling during D6: S2 alone is capped by its weight (0.30), so no single call can reach HOLD on sens<=2 data
import('./fusion_sim.mjs').then(({ fuse }) => {
  const a = rng(7); let mx = 0;
  for (let i = 1; i <= 30; i++) { const s = d6(a, i); const c = new Map();
    for (let j = 1; j < s.length; j++) { c.set(s[j], (c.get(s[j]) ?? 0) + 1);
      mx = Math.max(mx, fuse({ S2: Math.max(frozen.seq(s[j-1], s[j]), vb.vol(s[j], c.get(s[j]))) }, s[j] === 'erp.export_report' ? 2 : 1).score); } }
  console.log(`D6 per-call max score over 30 sessions: ${mx} (must stay < 30)`);
});
const m = run('mimic', inRate, 40, 3, true); console.log(`true in-rate mimicry: first=${m.first} (expected miss)`);
// One-day bursts: a 45-call quarter-end batch (ordinary tools) vs 12 exports in one session (sensitive).
const d11 = ['START']; const z = rng(5);
while (d11.length < 46) { d11.push('erp.get_vendor', 'erp.get_price_list'); for (let k = 0; k < 2; k++) d11.push(z() < 0.5 ? 'erp.search_invoices' : 'erp.get_price_list'); d11.push('erp.create_purchase_request'); }
const one = s => { const v = vb.excessSplit(s, SENSITIVE); return Math.max(0, Math.min(H, seqX(s) + v.low) + v.high - K); };
console.log(`quarter-end batch alone: S = ${one(d11).toFixed(2)} (alarm only above ${H})`);
console.log(`12 exports in one session: S = ${one(['START', ...Array(12).fill('erp.export_report')]).toFixed(2)}`);
