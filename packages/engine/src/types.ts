// Contracts shared by the engine, the world, the scenarios and the console (build_execution.md §3).

export type ActionClass = 'read' | 'write_internal' | 'send_external' | 'payment' | 'delete';
export type Factor = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'DA';
export type Band = 'ALLOW' | 'HOLD' | 'DOWN_SCOPE' | 'QUARANTINE' | 'REVOKE';

export interface ToolDef {
  name: string;
  action: ActionClass;
  dataClass: string;
  sensitivity: 0 | 1 | 2 | 3;
  untrustedOutput?: boolean;
  egressArg?: string;        // where the tool sends data (decides internal vs external)
  sinkArg?: string;          // a destination that is not a host, e.g. the IBAN a payment goes to (S3 taint only)
  description?: string;      // what the tool server says the tool does; pinned with the rest of the definition
  defHash: string;
}

export interface Charter {
  role: string;
  version: number;
  purpose: string;
  owner: string;
  tools: string[];
  dataClasses: string[];
  egressAllow: string[];
  maxCallsPerSession: number;
  delegatesTo: string[];
  sig: string;
}

export interface TokenClaims {
  sub: string;
  role: string;
  scope: string[];
  ver: number;
  jti: string;
  iat: number;
  exp: number;
  act?: { sub: string; act?: TokenClaims['act'] };   // RFC 8693-shaped chain
}

export type AgentState = 'active' | 'watch' | 'scoped_down' | 'quarantined' | 'revoked';

export interface Agent {
  id: string;
  role: string;
  displayName: string;
  owner: string;
  createdAt: number;
  state: AgentState;
  tokenVer: number;
  parent?: string;
}

export interface ToolCall {
  callId: string;
  agentId: string;
  sessionId: string;
  ts: number;
  jwt: string;
  tool: string;
  args: Record<string, string | number>;
  runtime: { id: string; asn: string };
}

// normalised Agent Action Events (diagram: event stream)
export type AAE =
  | { kind: 'ToolCalled'; call: ToolCall }
  | { kind: 'DataRead'; callId: string; dataClass: string; sensitivity: number }
  | { kind: 'ContentIngested'; callId: string; docId: string; trusted: boolean; injectionScore: number; values: string[] }
  | { kind: 'EgressAttempt'; callId: string; host: string }
  | { kind: 'Delegation'; from: string; to: string; chain: string[] }
  | { kind: 'TokenPresented'; jti: string; ver: number; runtime: string }
  | { kind: 'CharterUpdated'; role: string; version: number }
  | { kind: 'ToolDefinitionChanged'; tool: string; from: string | null; to: string };

export interface SubSignal { code: string; value: number; reason: string; evidence: string[] }

export interface FactorResult {
  factor: Factor;
  strength: number;     // s ∈ [0,1]
  weighted: number;     // w · s
  looImpact: number;    // score − score without this factor
  subs: SubSignal[];
}

export interface Decision {
  id: string;
  call: ToolCall;
  credentials: { ok: boolean; reason?: string };
  factors: FactorResult[];
  multiplier: number;
  score: number;
  band: Band;
  escalated: boolean;
  enforced: boolean;
  rootCause: Factor | 'TRIPWIRE' | null;
  culpritDoc?: string;
  tokenVerBefore: number;
  tokenVerAfter: number;
  charterVersion: number;
  snapshotId: string;
  latencyUs: number;
  ledgerHash: string;
  explanation: string;
  // beyond §3: what the gateway actually did, for the console and the scenario assertions
  executed: boolean;
  held: boolean;
  escalationReason?: string;
  invariant?: string;
  inlineLatencyUs: number;
  tokenAction: TokenAction;
  agentStateAfter: AgentState;
}

export interface TokenAction {
  kind: 'none' | 'reissue' | 'revoke';
  target?: 'agent' | 'delegated_session';
  verAfter?: number;
  scopesAfter?: string[];
  removed?: string[];
  cascade?: string[];
}
