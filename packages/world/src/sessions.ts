// Seeded session generators. `rng` and `procSession` are ported line for line from research/sim/model.mjs
// so the engine's baseline trains on exactly the data the reference numbers came from.

export function rng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32; }

export type Rand = () => number;

export function procSession(r: Rand): string[] {
  const s = ['START', 'erp.get_vendor', 'erp.get_price_list'];
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) s.push(r() < 0.5 ? 'erp.search_invoices' : 'erp.get_price_list');
  if (r() < 0.6) s.push('docs.read_attachment');
  s.push('erp.create_purchase_request');
  if (r() < 0.4) s.push('mail.send');
  if (r() < 0.07) s.push('erp.export_report');
  return s;
}

// Not in the sim: HR answers payroll questions; the mailer only sends.
export function hrSession(r: Rand): string[] {
  const s = ['START', 'hr.list_employees'];
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) s.push('hr.read_salary');
  if (r() < 0.4) s.push('docs.read_attachment');
  if (r() < 0.5) s.push('mail.send');
  return s;
}

export function mailerSession(r: Rand): string[] {
  const s = ['START'];
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) s.push('mail.send');
  return s;
}

// Stolen-token drift scripts, ported from research/sim/drift_acc_sim.mjs.
// D6: escalating bulk exports, ⌊i/3⌋ extra exports and, from session 7, an internal mail.
export function driftD6Session(r: Rand, i: number): string[] {
  const s = procSession(r);
  for (let k = 0; k < Math.floor(i / 3); k++) s.push('erp.export_report');
  if (i > 6) s.push('mail.send');
  return s;
}
// D9: constant-rate mimicry, one export and one mail every session.
export function driftD9Session(r: Rand): string[] {
  const s = procSession(r);
  s.push('erp.export_report', 'mail.send');
  return s;
}

// D11 quarter-end: one 45-call session of vendor batches, ported from research/sim/fusion_sim.mjs (rng(5)).
export function quarterEndSession(): string[] {
  const s = ['START']; const z = rng(5);
  while (s.length < 46) {
    s.push('erp.get_vendor', 'erp.get_price_list');
    for (let k = 0; k < 2; k++) s.push(z() < 0.5 ? 'erp.search_invoices' : 'erp.get_price_list');
    s.push('erp.create_purchase_request');
  }
  return s;
}
