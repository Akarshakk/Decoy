// Scenario replays for the Investigate page and the landing page. Each one is a fresh sandbox driven by the §6 script;
// everything shown (scores, tags, taint edges, twins, dividers, drift) is read back off that run's engine.
import { actionOf, b64urlDecodeText, MULTIPLIER, WEIGHTS, type Decision, type Engine, type Factor } from '@swaroop/engine';
import { D1, D12, D14, D2, D3, D4, D5, D6, D7, D8, Run } from '@swaroop/scenarios';
import { AGENT_PROFILES, INTERNAL_DOMAINS } from '@swaroop/world';

export type Mode = 'enforce' | 'shadow';
export type Tag = 'untrusted' | 'still works' | 'delegated' | 'new runtime' | 'changed tool';

export interface StepView {
  decision: Decision;
  agent: string;
  tool: string;
  arg?: string;
  tag?: Tag;
  divider?: string;
}

export interface DriftSession { session: number; S: number; alarm: boolean; calls: number; exports: number; maxCall: number }

export interface ScenarioMeta { id: string; code: string; title: string; agent: string; summary: string }

export interface ScenarioView extends ScenarioMeta {
  mode: Mode;
  role: string;
  steps: StepView[];
  taint: { from: number; to: number[] } | null;
  twin: { atStep: number; caption: string; agent: string; role: string; decision: Decision } | null;
  drift: DriftSession[] | null;
  egress: string[];                       // what actually left the building, from the backend log
  engine: Engine;
}

type Play = (run: Run) => Promise<unknown>;

const SCENARIOS: (ScenarioMeta & { play: Play; twin?: { from: string; tool: string; caption: string } | 'own-call' })[] = [
  { id: 'd1', code: 'D1', title: 'Normal procurement day', agent: 'procurement-01', play: D1,
    summary: 'Vendors, prices, a clean supplier quote, a purchase request and an internal email. The baseline for everything else.' },
  { id: 'd2', code: 'D2', title: 'Poisoned supplier PDF', agent: 'procurement-01', play: D2,
    summary: 'A supplier invoice hides an instruction to read salaries and post them to an outside host.',
    twin: { from: 'd3', tool: 'hr.read_salary', caption: 'Same call, HR role (D3)' } },
  { id: 'd3', code: 'D3', title: 'Same read, HR role', agent: 'hr-assist-01', play: D3,
    summary: 'The HR assistant reads salaries as part of its job. Same tool, same kind of valid token.',
    twin: { from: 'd2', tool: 'hr.read_salary', caption: 'Same call, procurement role (D2)' } },
  { id: 'd4', code: 'D4', title: 'New agent, no history', agent: 'procurement-02', play: D4,
    summary: 'Created today. With no baseline of its own, its calls are judged against its role and its peer.' },
  { id: 'd5', code: 'D5', title: 'Legitimate role change', agent: 'procurement-01', play: D5,
    summary: 'Procurement starts onboarding suppliers. The owner approves it as a role change instead of treating it as an attack.' },
  { id: 'd6', code: 'D6', title: 'Slow drift on a stolen token', agent: 'procurement-01', play: D6,
    summary: 'A stolen token adds a few report exports each day. No call crosses the hold line; the drift accumulator does.' },
  { id: 'd7', code: 'D7', title: 'Delegated mailer', agent: 'procurement-01', play: D7, twin: 'own-call',
    summary: 'The tainted procurement agent hands a send to the mailer. Only the delegated session is restricted.' },
  { id: 'd8', code: 'D8', title: 'Decoy file opened', agent: 'hr-assist-01', play: D8,
    summary: 'A honeytoken file that no real job ever opens. Touching it is enough.' },
  { id: 'd12', code: 'D12', title: 'Stolen token at night', agent: 'procurement-01', play: D12,
    summary: 'The real agent works at 02:58. A copy of its token is used from a new network at 03:00, then the used token is replayed.' },
  { id: 'd14', code: 'D14', title: 'Poisoned tool', agent: 'procurement-01', play: D14,
    summary: 'The ERP tool server re-lists erp.get_vendor with a hidden instruction. Its first call is held; when the owner lets it run, the output still counts as outside content and the salary upload is stopped.' },
];

export const SCENARIO_LIST: ScenarioMeta[] = SCENARIOS.map(({ id, code, title, agent, summary }) => ({ id, code, title, agent, summary }));

const ARG_KEYS = ['file', 'host', 'to', 'supplier', 'employee', 'sku', 'id', 'q', 'item', 'dept', 'report'];
const argOf = (d: Decision) => { const k = ARG_KEYS.find(k => d.call.args[k] !== undefined); return k ? String(d.call.args[k]) : undefined; };

const delegatedJwt = (jwt: string) => {
  try { return !!JSON.parse(b64urlDecodeText(jwt.split('.')[1] ?? '')).act; } catch { return false; }
};

function memo<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>) {
  let p = cache.get(key);
  if (!p) { p = make(); cache.set(key, p); p.catch(() => cache.delete(key)); }
  return p;
}

const runs = new Map<string, Promise<Run>>();
const views = new Map<string, Promise<ScenarioView>>();

/** The raw sandbox after the scenario script, played once per scenario and mode. */
function rawRun(id: string, mode: Mode) {
  return memo(runs, `${id}:${mode}`, async () => {
    const meta = SCENARIOS.find(s => s.id === id);
    if (!meta) throw new Error(`unknown scenario ${id}`);
    const run = await Run.create({ mode });
    await meta.play(run);
    return run;
  });
}

export function runScenario(id: string, mode: Mode = 'enforce'): Promise<ScenarioView> {
  return memo(views, `${id}:${mode}`, () => view(id, mode));
}

async function view(id: string, mode: Mode): Promise<ScenarioView> {
  const meta = SCENARIOS.find(s => s.id === id);
  if (!meta) throw new Error(`unknown scenario ${id}`);
  const run = await rawRun(id, mode);
  const e = run.engine;
  const untrusted = new Set(e.events.flatMap(ev => (ev.kind === 'ContentIngested' && !ev.trusted ? [ev.callId] : [])));
  const homeRuntime = (agent: string) => AGENT_PROFILES.find(p => p.id === agent)?.runtime.id;
  const isDelegated = (d: Decision) => delegatedJwt(d.call.jwt);

  let ds = [...e.decisions];
  let drift: DriftSession[] | null = null;
  if (id === 'd6') {
    // Spine = the session after the alarm; the sessions before it become the drift series.
    const bySession = new Map<string, Decision[]>();
    for (const d of ds) bySession.set(d.call.sessionId, [...(bySession.get(d.call.sessionId) ?? []), d]);
    const sessions = [...bySession.values()];
    const hist = e.driftOf(meta.agent).history;
    drift = sessions.map((calls, i) => ({
      session: i + 1, S: hist[i]?.S ?? 0, alarm: hist[i]?.alarm ?? false, calls: calls.length,
      exports: calls.filter(d => d.call.tool === 'erp.export_report').length, maxCall: Math.max(...calls.map(d => d.score)),
    }));
    ds = sessions.at(-1)!;
  }

  let twin: ScenarioView['twin'] = null;
  if (meta.twin === 'own-call') {
    const own = ds.find(d => d.call.agentId !== meta.agent && !isDelegated(d))!;
    ds = ds.filter(d => d !== own);
    twin = { atStep: ds.findIndex(isDelegated), caption: 'Mailer’s own job, same minute', agent: own.call.agentId, role: e.charterOf(own.call.agentId).role, decision: own };
  } else if (meta.twin) {
    const t = meta.twin;
    const other = await rawRun(t.from, mode);
    const d = other.engine.decisions.find(x => x.call.tool === t.tool)!;
    twin = { atStep: ds.findIndex(x => x.call.tool === t.tool), caption: t.caption, agent: d.call.agentId, role: e.charterOf(d.call.agentId).role, decision: d };
  }

  const roleChanges = e.ledgerRecords().filter(r => r.type === 'role_change');
  const steps: StepView[] = ds.map((d, i) => {
    const prev = ds[i - 1];
    const sessionStart = prev && prev.call.sessionId !== d.call.sessionId && !isDelegated(d) && !isDelegated(prev);
    const approved = prev && roleChanges.find(r => r.payload.decision === prev.id);
    const divider = [
      approved ? `Owner approved as role change · charter v${approved.payload.from} → v${approved.payload.to}` : null,
      sessionStart ? 'new session' : null,
    ].filter(Boolean).join(' · ');
    const blockedBefore = ds.slice(0, i).some(x => x.call.sessionId === d.call.sessionId && !x.executed);
    const tag: Tag | undefined = d.factors.some(f => f.subs.some(s => s.code === 'tool_definition_changed')) ? 'changed tool'
      : isDelegated(d) ? 'delegated'
      : untrusted.has(d.call.callId) ? 'untrusted'
      : d.call.runtime.id !== homeRuntime(d.call.agentId) ? 'new runtime'
      : d.executed && d.band === 'ALLOW' && blockedBefore ? 'still works' : undefined;
    return { decision: d, agent: d.call.agentId, tool: d.call.tool, ...(argOf(d) ? { arg: argOf(d) } : {}), ...(tag ? { tag } : {}),
      ...(divider ? { divider: divider[0]!.toUpperCase() + divider.slice(1) } : {}) };
  });

  // Taint: from the untrusted content (a document, or a changed tool's output) that a later decision names as its
  // culprit, to every call that names it. The content id comes from the engine's ContentIngested event.
  const docOf = new Map(e.events.flatMap(ev => (ev.kind === 'ContentIngested' && !ev.trusted ? [[ev.callId, ev.docId] as const] : [])));
  let taint: ScenarioView['taint'] = null;
  const from = steps.findIndex(s => { const doc = docOf.get(s.decision.call.callId); return !!doc && steps.some(t => t.decision.culpritDoc === doc); });
  if (from >= 0) {
    const doc = docOf.get(steps[from]!.decision.call.callId)!;
    taint = { from, to: steps.flatMap((s, i) => (i > from && s.decision.culpritDoc === doc ? [i] : [])) };
  }

  const egress = run.backends.log.flatMap(l => {
    const tool = e.catalog.get(l.tool);
    return tool && actionOf(tool, l.args, INTERNAL_DOMAINS) === 'send_external' ? [`${l.tool} → ${String(l.args[tool.egressArg!] ?? '')}`] : [];
  });

  return { ...meta, mode, role: e.charterOf(meta.agent).role, steps, taint, twin, drift, egress, engine: e };
}

/** How the noisy-OR total is built: factors largest first, each bar the score with that factor and every one before it. */
export function buildUp(d: Decision): { factor: Factor | 'TRIPWIRE'; weighted: number; cumulative: number }[] {
  if (d.rootCause === 'TRIPWIRE') return [{ factor: 'TRIPWIRE', weighted: 1, cumulative: 100 }];
  let keep = 1;
  return [...d.factors].sort((a, b) => b.weighted - a.weighted || b.looImpact - a.looImpact).map(f => {
    keep *= 1 - f.weighted;
    return { factor: f.factor, weighted: f.weighted, cumulative: Math.min(100, 100 * (1 - keep) * d.multiplier) };
  });
}

export { MULTIPLIER, WEIGHTS };
