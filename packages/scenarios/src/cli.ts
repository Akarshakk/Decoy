// npm run scenario -- D2 [--shadow]   prints every decision's explanation (the same text the console shows)
import * as S from './scenarios';
import type { Decision } from '@swaroop/engine';

const [id = 'D2', ...flags] = process.argv.slice(2);
const opts = { mode: flags.includes('--shadow') ? 'shadow' as const : 'enforce' as const };
const run: Record<string, () => Promise<unknown>> = {
  D1: () => S.D1(), D2: () => S.D2(opts), D3: () => S.D3(), D4: () => S.D4(), D5: () => S.D5(), D6: () => S.D6(), D7: () => S.D7(), D8: () => S.D8(), D9: () => S.D9(), D11: () => S.D11(), D12: () => S.D12(), D13: () => S.D13(),
};
const fn = run[id.toUpperCase()];
if (!fn) { console.error(`unknown scenario ${id}; try one of ${Object.keys(run).join(', ')}`); process.exit(1); }

const out = await fn() as Record<string, unknown>;
const decisions: Decision[] = Array.isArray(out.decisions) ? out.decisions as Decision[]
  : Object.values(out).filter((v): v is Decision => !!v && typeof v === 'object' && 'explanation' in (v as object));
for (const d of decisions) console.log(`${d.explanation}\n  latency ${d.latencyUs} µs (inline checks ${d.inlineLatencyUs} µs) · executed: ${d.executed} · ledger ${d.ledgerHash.slice(0, 12)}\n`);
const rest = Object.fromEntries(Object.entries(out).filter(([k, v]) => k !== 'decisions' && !(v && typeof v === 'object' && 'explanation' in (v as object)) && k !== 'engine' && k !== 'backends' && k !== 'ledgerTypes'));
if (Object.keys(rest).length) console.log(rest);
