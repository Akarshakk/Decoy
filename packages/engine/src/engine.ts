// The gateway (PEP) + Phase II scoring + Phase III response, in one object per sandbox.
// check() follows build_execution.md §5.1: verify token → tripwire → A (S1, S3, S5) → B (S2, S4, S6) → C (drift, fusion,
// explain) → orchestrator → run the backend only if allowed → emit events → ledger.
import { signCharter } from './charters';
import { s1Role } from './checks/s1_role';
import { extractValues, newFlowState, recordDataRead, recordIngest, s3Flow, sinkValues, type FlowState } from './checks/s3_flow';
import { endSession as endCredentialSession, newCredentialState, recordPresentation, s5Credential, type CredentialProfile } from './checks/s5_credential';
import { actionSummary, explain, FACTOR_LABEL } from './fusion/explain';
import { fuse, WEIGHTS } from './fusion/fuse';
import { DriftAccumulator, type DriftReference, type Snapshot } from './learned/drift';
import { Baseline, VolumeBands } from './learned/s2_baseline';
import { classifyInjection, s4Injection, type InjectionResult } from './learned/s4_injection';
import { s6Delegation } from './learned/s6_delegation';
import { respond } from './respond/orchestrator';
import { Ledger, type LedgerRecord } from './store/ledger';
import { mintToken, verifyToken } from './token';
import { actionOf } from './tools';
import type { AAE, Agent, AgentState, Charter, Decision, Factor, FactorResult, SubSignal, ToolCall, ToolDef } from './types';

const DAY_MS = 86_400_000;
const SNAPSHOT_EVERY_MS = 7 * DAY_MS;
const MIN_VOLUME_SESSIONS = 5;   // below this, an agent's own volume bands are noise

export interface ToolResult { text?: string; doc?: { id: string; sender: string; senderDomain: string; trusted: boolean }; rows?: number }
export interface Backend { run(agentId: string, tool: string, args: Record<string, string | number>): ToolResult }

export interface EngineConfig {
  catalog: ToolDef[];
  internalDomains: string[];
  honeytokens: string[];
  tokenKey: string;
  registryKey: string;
  backend: Backend;
  mode?: 'enforce' | 'shadow';
  detectors?: Detectors;
}

/** Which detectors score (ablations, build_execution.md §8). The credential gate is not a detector: it always runs. */
export interface Detectors { factors: Factor[]; tripwire: boolean }
export const ALL_DETECTORS: Detectors = { factors: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'DA'], tripwire: true };

export interface AgentSetup {
  id: string;
  displayName: string;
  charter: Omit<Charter, 'sig'>;
  scopes: string[];
  createdAt: number;
  peerOf?: string;                 // cold-start prior: another agent's live baseline and volume bands (same role)
  history: { tools: string[]; ts: number[]; runtime: { id: string; asn: string } }[];
}

interface AgentRecord {
  agent: Agent;
  charter: Charter;
  scopes: string[];
  jti: string;
  jwt: string;
  removedAt: Map<string, { ver: number; decisionId: string }>;   // scope → when a re-issue removed it
  profile: CredentialProfile;
  baseline: Baseline;
  volume: VolumeBands;
  snapshot: Snapshot & { id: string; frozenAt: number };
  drift: DriftAccumulator;
  lastScore: number;
  snapshots: number;
  peer: string | null;
}

interface SessionState {
  id: string;
  agentId: string;
  tools: string[];                      // START + every attempted call, for sequence and volume
  counts: Map<string, number>;
  flow: FlowState;
  latestUntrusted: ({ docId: string } & InjectionResult) | null;
  downScopedAt: string | null;
  peak: number;
  holdDenied: boolean;
  blockedWithGoodCredentials: boolean;
  delegation: { chain: string[]; parentSession: string; ver: number; scopes: string[]; jwt: string; revoked: boolean; edgeSeen: boolean } | null;
  children: string[];                   // child session ids
  delegations: number;
  ended: boolean;
  roleChangeApproved: boolean;
}

export interface Hold { decision: Decision; step: number; status: 'pending' | 'approved' | 'denied' | 'role_change' }

export class Engine {
  readonly catalog: Map<string, ToolDef>;
  readonly detectors: Detectors;
  mode: 'enforce' | 'shadow';
  readonly ledger = new Ledger();
  readonly events: AAE[] = [];
  readonly decisions: Decision[] = [];
  readonly holds = new Map<string, Hold>();
  private agents = new Map<string, AgentRecord>();
  private sessions = new Map<string, SessionState>();
  private cred = newCredentialState();
  private edges = new Set<string>();
  private seq = 0;
  private jtiSeq = 0;

  constructor(private cfg: EngineConfig) {
    this.catalog = new Map(cfg.catalog.map(t => [t.name, t]));
    this.mode = cfg.mode ?? 'enforce';
    this.detectors = cfg.detectors ?? ALL_DETECTORS;
  }

  // ---------- setup ----------

  async registerAgent(s: AgentSetup, nowMs: number) {
    const charter = await signCharter(s.charter, this.cfg.registryKey);
    const names = [...this.catalog.keys()];
    const peer = s.peerOf ? this.agents.get(s.peerOf)?.baseline ?? null : null;
    const baseline = new Baseline(charter.tools, names, peer);
    const volume = new VolumeBands();
    const hours: number[] = [], runtimes = new Set<string>(), asns = new Set<string>();
    for (const h of s.history) {
      volume.observeSession(h.tools);
      for (let j = 1; j < h.tools.length; j++) baseline.observe(h.tools[j - 1]!, h.tools[j]!);
      h.ts.forEach(t => hours.push(new Date(t).getUTCHours()));
      runtimes.add(h.runtime.id); asns.add(h.runtime.asn);
    }
    const pct = (p: number) => { const x = [...hours].sort((a, b) => a - b); return x[Math.floor(p * (x.length - 1))]!; };
    const rec: AgentRecord = {
      agent: { id: s.id, role: charter.role, displayName: s.displayName, owner: charter.owner, createdAt: s.createdAt, state: 'active', tokenVer: 1 },
      charter, scopes: [...s.scopes], jti: '', jwt: '', removedAt: new Map(),
      profile: { knownRuntimes: [...runtimes], knownAsns: [...asns], activeHours: hours.length ? [pct(0.05), pct(0.95)] : [0, 23] },
      baseline, volume, snapshot: { baseline: baseline.clone(), volume: volume.clone(), id: `bs_${s.id}_1`, frozenAt: nowMs },
      drift: new DriftAccumulator(), lastScore: 0, snapshots: 1, peer: s.peerOf ?? null,
    };
    this.agents.set(s.id, rec);
    await this.mint(rec, nowMs);
    return rec.agent;
  }

  /** A registered agent with no history yet (e.g. procurement-02) whose runtime is known from provisioning. */
  provisionRuntime(agentId: string, runtime: { id: string; asn: string }, activeHours: [number, number]) {
    const r = this.rec(agentId);
    r.profile.knownRuntimes.push(runtime.id);
    r.profile.knownAsns.push(runtime.asn);
    r.profile.activeHours = activeHours;
  }

  private async mint(r: AgentRecord, nowMs: number) {
    r.jti = `${r.agent.id}.v${r.agent.tokenVer}.${++this.jtiSeq}`;
    r.jwt = await mintToken({ sub: r.agent.id, role: r.agent.role, scope: r.scopes, ver: r.agent.tokenVer, jti: r.jti }, this.cfg.tokenKey, Math.floor(nowMs / 1000));
  }

  /** The agent's current token, refreshed (same version, new jti) so long simulations don't hit the 15-minute expiry. */
  async tokenFor(agentId: string, nowMs: number) {
    const r = this.rec(agentId);
    await this.mint(r, nowMs);
    return r.jwt;
  }

  /** The token the agent's runtime currently holds (after any re-issue), without minting a new one. */
  currentToken(agentId: string) { return this.rec(agentId).jwt; }
  agent(agentId: string) { return this.rec(agentId).agent; }
  charterOf(agentId: string) { return this.rec(agentId).charter; }
  scopesOf(agentId: string) { return [...this.rec(agentId).scopes]; }
  profileOf(agentId: string) { return this.rec(agentId).profile; }
  baselineOf(agentId: string) { return this.rec(agentId).baseline; }
  driftOf(agentId: string) { return this.rec(agentId).drift; }
  snapshotOf(agentId: string) { return this.rec(agentId).snapshot; }
  agentIds() { return [...this.agents.keys()]; }
  peerOf(agentId: string) { return this.rec(agentId).peer; }
  /** The volume bands S2 scores this agent against right now, and whose they are. */
  volumeFor(agentId: string): { bands: VolumeBands | null; source: 'own' | 'peer' | 'none' } {
    const r = this.rec(agentId), bands = this.volumeBandsFor(r);
    return { bands, source: !bands ? 'none' : bands === r.volume ? 'own' : 'peer' };
  }

  private rec(id: string) {
    const r = this.agents.get(id);
    if (!r) throw new Error(`unknown agent ${id}`);
    return r;
  }

  private session(call: ToolCall): SessionState {
    let s = this.sessions.get(call.sessionId);
    if (!s) {
      s = { id: call.sessionId, agentId: call.agentId, tools: ['START'], counts: new Map(), flow: newFlowState(), latestUntrusted: null,
        downScopedAt: null, peak: 0, holdDenied: false, blockedWithGoodCredentials: false, delegation: null, children: [], delegations: 0, ended: false,
        roleChangeApproved: false };
      this.sessions.set(call.sessionId, s);
    }
    return s;
  }

  // ---------- delegation (RFC 8693-shaped act chain) ----------

  async delegate(parentSessionId: string, calleeId: string, childSessionId: string, nowMs: number) {
    const parent = this.sessions.get(parentSessionId);
    if (!parent) throw new Error(`unknown session ${parentSessionId}`);
    const caller = this.rec(parent.agentId), callee = this.rec(calleeId);
    const chain = [...(parent.delegation?.chain ?? [parent.agentId]), calleeId];
    const callerScopes = parent.delegation?.scopes ?? caller.scopes;
    const scopes = callee.scopes.filter(s => callerScopes.includes(s));
    const act = chain.slice(0, -1).reduceRight<{ sub: string; act?: { sub: string } } | undefined>((inner, sub) => ({ sub, ...(inner ? { act: inner } : {}) }), undefined);
    const jwt = await mintToken({ sub: calleeId, role: callee.agent.role, scope: scopes, ver: 1, jti: `${calleeId}.d.${++this.jtiSeq}`, act },
      this.cfg.tokenKey, Math.floor(nowMs / 1000));
    // The child inherits the parent's flow state: whatever tainted the caller taints the delegated work.
    const edge = `${caller.agent.id}->${calleeId}`;
    const edgeSeen = this.edges.has(edge);
    this.edges.add(edge);
    const child: SessionState = {
      id: childSessionId, agentId: calleeId, tools: ['START'], counts: new Map(), flow: parent.flow, latestUntrusted: parent.latestUntrusted,
      downScopedAt: null, peak: 0, holdDenied: false, blockedWithGoodCredentials: false,
      delegation: { chain, parentSession: parentSessionId, ver: 1, scopes, jwt, revoked: false, edgeSeen }, children: [], delegations: 0, ended: false,
      roleChangeApproved: false,
    };
    this.sessions.set(childSessionId, child);
    parent.children.push(childSessionId);
    parent.delegations++;
    this.events.push({ kind: 'Delegation', from: caller.agent.id, to: calleeId, chain });
    return { sessionId: childSessionId, jwt, edgeSeen };
  }

  // ---------- the decision ----------

  async check(call: ToolCall): Promise<Decision> {
    const t0 = performance.now();
    const r = this.rec(call.agentId);
    const tool = this.catalog.get(call.tool);
    if (!tool) throw new Error(`unknown tool ${call.tool}`);
    const sess = this.session(call);
    const id = `dec_${String(++this.seq).padStart(4, '0')}`;
    const step = sess.tools.length - 1;
    const prev = sess.tools[sess.tools.length - 1]!;
    sess.tools.push(tool.name);
    const count = (sess.counts.get(tool.name) ?? 0) + 1;
    sess.counts.set(tool.name, count);
    this.events.push({ kind: 'ToolCalled', call });

    // 1. credentials
    const d = sess.delegation;
    const expectedVer = d ? d.ver : r.agent.tokenVer;
    const v = await verifyToken(call.jwt, this.cfg.tokenKey, { now: Math.floor(call.ts / 1000), expectedVer, tool: tool.name });
    let credentials: Decision['credentials'] = { ok: v.ok, reason: v.reason };
    if (v.ok && v.claims!.sub !== call.agentId) credentials = { ok: false, reason: `token belongs to ${v.claims!.sub}` };
    if (r.agent.state === 'revoked' || d?.revoked) credentials = { ok: false, reason: 'token revoked' };
    const removed = r.removedAt.get(tool.name);
    if (!credentials.ok && removed && credentials.reason?.endsWith('not in token scope')) {
      credentials = { ok: false, reason: `${tool.name} removed in token v${removed.ver} at ${removed.decisionId}` };
    }
    const jti = v.claims?.jti ?? 'unknown';
    this.events.push({ kind: 'TokenPresented', jti, ver: v.claims?.ver ?? 0, runtime: call.runtime.id });

    // 2. tripwire
    const honeytoken = !this.detectors.tripwire ? undefined : this.cfg.honeytokens.find(h => Object.values(call.args).some(a => String(a).includes(h)));

    // 3. A: inline deterministic checks
    const action = actionOf(tool, call.args, this.cfg.internalDomains);
    const charter = r.charter;
    const s1 = s1Role({ tool, args: call.args, charter, callsInSession: step + 1 });
    const sinks = await sinkValues(tool, call.args);
    const s3 = s3Flow({ tool, action, step, flow: sess.flow, sinks });
    const s5 = s5Credential({ agentId: call.agentId, sessionId: call.sessionId, jti, runtime: call.runtime, ts: call.ts, profile: r.profile, state: this.cred });
    recordPresentation(this.cred, { agentId: call.agentId, sessionId: call.sessionId, jti, runtime: call.runtime });
    const tA = performance.now();

    // B: learned checks
    const seq = r.baseline.seq(prev, tool.name);
    const bands = this.volumeBandsFor(r);
    const vol = bands ? bands.vol(tool.name, count) : 0;
    const s2Strength = Math.max(seq, vol);
    const s2Subs: SubSignal[] = [];
    if (s2Strength > 0) {
      const own = r.baseline.surprises.length >= 30 ? 'own' : 'peer';
      if (seq >= vol) {
        s2Subs.push({ code: 'sequence', value: seq, evidence: [r.snapshot.id],
          reason: `${prev === 'START' ? 'session start' : prev}→${tool.name} ${r.baseline.surprise(prev, tool.name).toFixed(1)} bits vs ${own} p95 ${r.baseline.tau().toFixed(1)} (${r.baseline.n} calls learned)` });
      } else {
        const { mu, sd } = bands!.stats(tool.name);
        s2Subs.push({ code: 'volume', value: vol, evidence: [], reason: `${tool.name} ×${count} this session vs usual ${mu.toFixed(1)} ± ${sd.toFixed(1)}` });
      }
    }
    const s4 = s4Injection({ latest: sess.latestUntrusted, seq });
    const s6 = d ? s6Delegation({
      tool, args: call.args, chain: d.chain.map(a => this.rec(a).charter),
      edgeSeen: d.edgeSeen, callerFanOut: this.sessions.get(d.parentSession)?.delegations ?? 0,
      parentLastScore: this.rec(d.chain[d.chain.length - 2]!).lastScore,
    }) : { strength: 0, subs: [] as SubSignal[] };

    // C: drift, fusion, explanation
    const da = r.drift.strength();
    const daSubs: SubSignal[] = da ? [{ code: 'drift_alarm', value: 1, reason: `drift accumulator crossed H; agent on watch until the owner resets it`, evidence: [] }] : [];
    const parts: [Factor, number, SubSignal[]][] = [['S1', s1.strength, s1.subs], ['S2', s2Strength, s2Subs], ['S3', s3.strength, s3.subs],
      ['S4', s4.strength, s4.subs], ['S5', s5.strength, s5.subs], ['S6', s6.strength, s6.subs], ['DA', da, daSubs]];
    for (const p of parts) if (!this.detectors.factors.includes(p[0])) { p[1] = 0; p[2] = []; }   // switched off: scores nothing
    const fused = fuse(Object.fromEntries(parts.map(([f, s]) => [f, s])), { sensitivity: tool.sensitivity, egress: action === 'send_external', honeytoken: !!honeytoken });
    const factors: FactorResult[] = honeytoken ? [] : parts.filter(([, s]) => s > 0).map(([factor, strength, subs]) => ({
      factor, strength, weighted: WEIGHTS[factor] * strength, looImpact: fused.loo[factor] ?? 0, subs,
    }));

    // Phase III
    const tokenVerBefore = d ? d.ver : r.agent.tokenVer;
    const resp = respond({
      score: fused.score, action, sensitivity: tool.sensitivity, mode: this.mode, agentState: r.agent.state,
      session: { downScopedAt: sess.downScopedAt }, delegated: !!d, charter, scopes: d ? d.scopes : r.scopes,
      tokenVer: tokenVerBefore, catalog: [...this.catalog.values()], children: this.descendants(sess),
    });
    // A failed token blocks in every mode: that is gateway authentication, not one of Swaroop's restrictions.
    const credentialBlock = !credentials.ok;
    const executed = resp.runs && !credentialBlock;
    if (!executed && credentials.ok && this.mode === 'enforce') sess.blockedWithGoodCredentials = true;

    await this.applyToken(resp, r, sess, id, call.ts);
    if (resp.band === 'DOWN_SCOPE' && resp.enforced) sess.downScopedAt = id;

    // run the backend only when allowed; its effects become events and flow state
    if (executed) await this.execute(call, tool, step, sess);

    sess.peak = Math.max(sess.peak, fused.score);
    r.lastScore = fused.score;

    const decision: Decision = {
      id, call, credentials, factors, multiplier: fused.multiplier, score: fused.score, band: resp.band,
      escalated: resp.escalated, enforced: resp.enforced, rootCause: fused.rootCause, culpritDoc: s4.culpritDoc ?? s3.subs.find(s => s.code === 'untrusted_sink_arg')?.evidence[0],
      tokenVerBefore, tokenVerAfter: resp.token.verAfter ?? tokenVerBefore, charterVersion: charter.version, snapshotId: r.snapshot.id,
      latencyUs: 0, ledgerHash: '', explanation: '',
      executed, held: resp.held && this.mode === 'enforce' && !credentialBlock,   // approving a hold must never bypass a failed token
      escalationReason: resp.escalationReason, invariant: resp.invariant,
      inlineLatencyUs: Math.round((tA - t0) * 1000), tokenAction: resp.token, agentStateAfter: d ? r.agent.state : resp.agentStateAfter,
    };
    decision.explanation = explain({
      id, band: resp.band, escalated: resp.escalated, escalationReason: resp.escalationReason, tool: tool.name, agentId: call.agentId,
      role: charter.role, charterVersion: charter.version, score: fused.score, enforced: resp.enforced, rootCause: fused.rootCause,
      rootCauseDetail: honeytoken ? `decoy ${honeytoken} touched` : undefined,
      factors: factors.map(f => ({ factor: f.factor, weighted: f.weighted, drop: f.looImpact, reason: f.subs.map(s => s.reason).join('; ') })),
      credentials, firstBlockedPassedCredentials: !credentials.ok && sess.blockedWithGoodCredentials,
      action: credentialBlock && resp.band === 'ALLOW' ? `blocked on credentials (${credentials.reason}).`
        : actionSummary({ band: resp.band, token: resp.token, tokenVerBefore, owner: charter.owner, enforced: resp.enforced }),
    });
    if (decision.held) this.holds.set(id, { decision, step, status: 'pending' });
    decision.latencyUs = Math.round((performance.now() - t0) * 1000);
    const rec = await this.ledger.append('decision', {
      id, agent: call.agentId, session: call.sessionId, tool: tool.name, args: call.args, score: fused.score, band: resp.band,
      escalated: resp.escalated, enforced: resp.enforced, executed, credentials: credentials.ok, rootCause: fused.rootCause,
      factors: Object.fromEntries(factors.map(f => [f.factor, +f.weighted.toFixed(4)])),
    }, call.ts);
    decision.ledgerHash = rec.hash;
    this.decisions.push(decision);
    return decision;
  }

  // Cold start: borrow the peer's volume bands until the agent has enough sessions of its own; with no peer, don't score volume.
  private volumeBandsFor(r: AgentRecord): VolumeBands | null {
    if (r.volume.sessions.length >= MIN_VOLUME_SESSIONS) return r.volume;
    return r.peer ? this.rec(r.peer).volume : null;
  }

  // A snapshot frozen before the agent had 5 sessions has no volume bands worth the name (an empty one made every
  // benign tool count a spike and alarmed a new agent on day one). Until then drift uses the peer's frozen bands,
  // and with no peer no volume term, exactly as S2 does live.
  private driftReference(r: AgentRecord): DriftReference {
    if (r.snapshot.volume.sessions.length >= MIN_VOLUME_SESSIONS) return r.snapshot;
    return { baseline: r.snapshot.baseline, volume: r.peer ? this.rec(r.peer).snapshot.volume : null };
  }

  private descendants(s: SessionState): string[] {
    return s.children.flatMap(c => {
      const child = this.sessions.get(c);
      return child ? [`${child.agentId}:${c}`, ...this.descendants(child)] : [];
    });
  }

  private async applyToken(resp: ReturnType<typeof respond>, r: AgentRecord, sess: SessionState, id: string, ts: number) {
    const t = resp.token;
    if (resp.enforced && !sess.delegation) r.agent.state = resp.agentStateAfter;   // also when no re-issue was needed
    if (t.kind === 'none') return;
    if (t.target === 'delegated_session' && sess.delegation) {
      sess.delegation.ver = t.verAfter!;
      sess.delegation.scopes = t.scopesAfter!;
      if (t.kind === 'revoke') sess.delegation.revoked = true;
      await this.ledger.append('token_reissue', { session: sess.id, agent: r.agent.id, target: 'delegated_session', kind: t.kind,
        from: t.verAfter! - 1, to: t.verAfter, removed: t.removed }, ts);
      return;
    }
    const from = r.agent.tokenVer;
    for (const s of t.removed ?? []) if (!r.removedAt.has(s)) r.removedAt.set(s, { ver: t.verAfter!, decisionId: id });
    r.scopes = t.scopesAfter!;
    r.agent.tokenVer = t.verAfter!;
    if (t.kind === 'revoke') {
      for (const c of t.cascade ?? []) { const sid = c.split(':')[1]!; const cs = this.sessions.get(sid); if (cs?.delegation) cs.delegation.revoked = true; }
    } else {
      await this.mint(r, ts);
    }
    await this.ledger.append('token_reissue', { agent: r.agent.id, target: 'agent', kind: t.kind, from, to: t.verAfter, removed: t.removed, cascade: t.cascade }, ts);
  }

  private async execute(call: ToolCall, tool: ToolDef, step: number, sess: SessionState) {
    const out = this.cfg.backend.run(call.agentId, tool.name, call.args);
    this.events.push({ kind: 'DataRead', callId: call.callId, dataClass: tool.dataClass, sensitivity: tool.sensitivity });
    recordDataRead(sess.flow, { step, dataClass: tool.dataClass, sensitivity: tool.sensitivity });
    const host = sinkHost(tool, call.args, this.cfg.internalDomains);
    if (host) this.events.push({ kind: 'EgressAttempt', callId: call.callId, host });
    if (out.text !== undefined || out.doc) {
      const trusted = out.doc ? out.doc.trusted : true;
      const values = extractValues(out.text ?? '');
      const inj = out.doc && !trusted ? classifyInjection({ text: out.text ?? '', senderDomain: out.doc.senderDomain }) : { score: 0, findings: [] };
      const docId = out.doc?.id ?? `${tool.name}:${call.callId}`;
      await recordIngest(sess.flow, { step, docId, trusted, values });
      if (!trusted) sess.latestUntrusted = { docId, ...inj };
      this.events.push({ kind: 'ContentIngested', callId: call.callId, docId, trusted, injectionScore: inj.score, values });
    }
  }

  // ---------- session end: learning + drift ----------

  async endSession(sessionId: string, ts: number) {
    const s = this.sessions.get(sessionId);
    if (!s || s.ended) return null;
    s.ended = true;
    endCredentialSession(this.cred, s.agentId, sessionId);
    if (s.delegation) return null;          // delegated work is the caller's session, not the callee's behaviour
    const r = this.rec(s.agentId);
    const tools = s.tools;
    // The session whose call the owner just approved as a role change is the new normal, not drift.
    const result = s.roleChangeApproved || !this.detectors.factors.includes('DA') ? { S: r.drift.S, x: 0, alarm: false }
      : r.drift.endSession(tools, this.driftReference(r));
    if (result.alarm) {
      if (r.agent.state === 'active') r.agent.state = 'watch';   // an alarm only ever raises the state, never softens a quarantine
      await this.ledger.append('drift_alarm', { agent: r.agent.id, S: +result.S.toFixed(4), snapshot: r.snapshot.id }, ts);
    }
    // Anti-poisoning: only low-risk sessions teach the baseline.
    const absorb = s.peak < 30 && !s.holdDenied && !['watch', 'quarantined', 'revoked'].includes(r.agent.state);
    if (absorb) {
      r.volume.observeSession(tools);
      for (let j = 1; j < tools.length; j++) r.baseline.observe(tools[j - 1]!, tools[j]!);
    }
    // Re-freeze weekly, but never while drift is accumulating (that would let slow drift teach itself into the reference).
    if (ts - r.snapshot.frozenAt >= SNAPSHOT_EVERY_MS && r.drift.S === 0 && !r.drift.alarmed) this.refreeze(r, ts);
    return { ...result, absorbed: absorb };
  }

  private refreeze(r: AgentRecord, ts: number) {
    r.snapshots++;
    r.snapshot = { baseline: r.baseline.clone(), volume: r.volume.clone(), id: `bs_${r.agent.id}_${r.snapshots}`, frozenAt: ts };
  }

  // ---------- owner actions (change management) ----------

  private pending(id: string) {
    const h = this.holds.get(id);
    if (!h || h.status !== 'pending') throw new Error(`no pending hold ${id}`);
    return h;
  }

  async approveHold(id: string, ts: number) {
    const h = this.pending(id);
    h.status = 'approved';
    await this.execute(h.decision.call, this.catalog.get(h.decision.call.tool)!, h.step, this.sessions.get(h.decision.call.sessionId)!);
    await this.ledger.append('hold_resolved', { id, outcome: 'approved' }, ts);
  }

  async denyHold(id: string, ts: number) {
    const h = this.pending(id);
    h.status = 'denied';
    this.sessions.get(h.decision.call.sessionId)!.holdDenied = true;
    await this.ledger.append('hold_resolved', { id, outcome: 'denied' }, ts);
  }

  /** HOLD on an off-charter tool → charter v+1 (signed) → token re-issued → snapshot re-frozen → drift reset → ledger. */
  async approveAsRoleChange(id: string, ts: number) {
    const h = this.pending(id);
    const r = this.rec(h.decision.call.agentId);
    const tool = h.decision.call.tool;
    if (r.charter.tools.includes(tool)) throw new Error(`${tool} is already in the ${r.charter.role} charter`);
    const dc = this.catalog.get(tool)!.dataClass;
    const before = r.charter;
    r.charter = await signCharter({ ...before, version: before.version + 1, tools: [...before.tools, tool],
      dataClasses: before.dataClasses.includes(dc) ? before.dataClasses : [...before.dataClasses, dc] }, this.cfg.registryKey);
    r.baseline.setCharter(r.charter.tools);
    if (!r.scopes.includes(tool)) r.scopes = [...r.scopes, tool];
    r.agent.tokenVer++;
    await this.mint(r, ts);
    this.refreeze(r, ts);
    r.drift.reset();
    h.status = 'role_change';
    this.sessions.get(h.decision.call.sessionId)!.roleChangeApproved = true;
    this.events.push({ kind: 'CharterUpdated', role: r.charter.role, version: r.charter.version });
    await this.ledger.append('role_change', { agent: r.agent.id, role: r.charter.role, from: before.version, to: r.charter.version,
      added: [tool], decision: id }, ts);
    await this.execute(h.decision.call, this.catalog.get(tool)!, h.step, this.sessions.get(h.decision.call.sessionId)!);
    return r.charter;
  }

  /** FP review proposes a charter edit for a human; it never widens the baseline by itself. */
  async markFalsePositive(id: string, ts: number) {
    const d = this.decisions.find(x => x.id === id);
    if (!d) throw new Error(`unknown decision ${id}`);
    const proposal = { agent: d.call.agentId, decision: id, proposedAddTool: this.rec(d.call.agentId).charter.tools.includes(d.call.tool) ? null : d.call.tool };
    await this.ledger.append('fp_review', proposal, ts);
    if (this.holds.get(id)?.status === 'pending') await this.approveHold(id, ts);
    return proposal;
  }

  async confirmCompromise(id: string, ts: number) {
    const d = this.decisions.find(x => x.id === id);
    if (!d) throw new Error(`unknown decision ${id}`);
    const r = this.rec(d.call.agentId);
    r.agent.state = 'revoked';
    r.agent.tokenVer++;
    r.scopes = [];
    if (this.holds.get(id)?.status === 'pending') this.holds.get(id)!.status = 'denied';
    await this.ledger.append('compromise_confirmed', { agent: r.agent.id, decision: id }, ts);
  }

  async ownerReset(agentId: string, ts: number) {
    const r = this.rec(agentId);
    r.drift.reset();
    if (r.agent.state === 'watch') r.agent.state = 'active';
    await this.ledger.append('owner_reset', { agent: agentId }, ts);
  }

  setMode(mode: 'enforce' | 'shadow') { this.mode = mode; }
  ledgerRecords(): readonly LedgerRecord[] { return this.ledger.records(); }
  agentStates(): Record<string, AgentState> { return Object.fromEntries([...this.agents].map(([k, v]) => [k, v.agent.state])); }
  factorLabel(f: Factor) { return FACTOR_LABEL[f]; }
}

function sinkHost(tool: ToolDef, args: Record<string, string | number>, internal: string[]) {
  return actionOf(tool, args, internal) === 'send_external' ? String(args[tool.egressArg!] ?? '') : null;
}
