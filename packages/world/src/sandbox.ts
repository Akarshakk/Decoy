// One fresh sandbox = one Engine with the demo world loaded. Every console tab and every scenario gets its own.
import { Engine, type Detectors } from '@swaroop/engine';
import { AGENT_PROFILES, type AgentProfile } from './agents';
import { Backends } from './backends';
import { buildCatalog, HONEYTOKEN, INTERNAL_DOMAINS } from './catalog';
import { CHARTERS_V1, REGISTRY_KEY } from './charters';
import { hrSession, mailerSession, procSession, rng, type Rand } from './sessions';

export const DEMO_START = Date.UTC(2026, 9, 19, 9, 0);   // Mon 19 Oct 2026 09:00 UTC: "today" in the sandbox
export const MINUTE = 60_000;
export const DAY = 86_400_000;
const TOKEN_KEY = 'swaroop-demo-sandbox-key';             // demo key; the console labels it as such

const GENERATORS: Record<AgentProfile['role'], (r: Rand) => string[]> = { procurement: procSession, hr_assistant: hrSession, mailer: mailerSession };

export interface SandboxOptions { mode?: 'enforce' | 'shadow'; peers?: boolean; detectors?: Detectors }

// History: n benign sessions on the n days before DEMO_START. Content from rng(seed) (identical to the sim);
// timing from a separate stream so it can't perturb the content.
export function historyFor(p: AgentProfile) {
  if (!p.historySessions) return [];
  const content = rng(p.historySeed!), timing = rng(p.historySeed! + 10_000);
  return Array.from({ length: p.historySessions }, (_, i) => {
    const tools = GENERATORS[p.role](content);
    const start = DEMO_START - (p.historySessions - i) * DAY + (Math.floor(timing() * 11) - 1) * 60 * MINUTE + Math.floor(timing() * 50) * MINUTE;
    return { tools, ts: tools.slice(1).map((_, j) => start + j * 2 * MINUTE), runtime: p.runtime };
  });
}

export async function createSandbox(opts: SandboxOptions = {}) {
  const backends = new Backends();
  const engine = new Engine({
    catalog: await buildCatalog(), internalDomains: INTERNAL_DOMAINS, honeytokens: [HONEYTOKEN],
    tokenKey: TOKEN_KEY, registryKey: REGISTRY_KEY, backend: backends, mode: opts.mode ?? 'enforce', detectors: opts.detectors,
  });
  const warm = (role: string) => AGENT_PROFILES.find(a => a.role === role && a.historySessions > 0);
  for (const p of AGENT_PROFILES) {
    const peer = !p.historySessions && opts.peers !== false ? warm(p.role)?.id : undefined;
    await engine.registerAgent({
      id: p.id, displayName: p.displayName, charter: CHARTERS_V1[p.role], scopes: p.scopes,
      createdAt: p.historySessions ? DEMO_START - (p.historySessions + 30) * DAY : DEMO_START, peerOf: peer, history: historyFor(p),
    }, DEMO_START);
    if (!p.historySessions) engine.provisionRuntime(p.id, p.runtime, p.activeHours);
  }
  return { engine, backends };
}
