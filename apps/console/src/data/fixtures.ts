// Fixture scenarios for the console until the engine lands (build_execution.md §9, Wed 21).
// Every score, factor strength and leave-one-out drop below is printed by research/sim/fusion_sim.mjs;
// surprise bits come from research/sim/model.mjs (seed 42, 40 sessions, 308 calls, own p95 3.6).
// When @swaroop/engine exists, replace this file with Decision objects from engine.check().

export type Band = 'ALLOW' | 'HOLD' | 'DOWN_SCOPE' | 'QUARANTINE' | 'REVOKE';
export type Factor = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'DA' | 'TRIPWIRE';

export const FACTOR_NAME: Record<Factor, string> = {
  S1: 'role', S2: 'behaviour', S3: 'flow', S4: 'injection', S5: 'credential', S6: 'delegation', DA: 'drift', TRIPWIRE: 'tripwire',
};

export const BAND_LABEL: Record<Band, string> = {
  ALLOW: 'Allow', HOLD: 'Hold', DOWN_SCOPE: 'Down-scope', QUARANTINE: 'Quarantine', REVOKE: 'Revoke',
};

export const LADDER: { from: number; to: number; band: Band; effect: string }[] = [
  { from: 0, to: 29, band: 'ALLOW', effect: 'Runs normally' },
  { from: 30, to: 54, band: 'HOLD', effect: 'Parked until the owner approves, with the evidence attached' },
  { from: 55, to: 74, band: 'DOWN_SCOPE', effect: 'Blocked; token re-issued without the risky scopes' },
  { from: 75, to: 89, band: 'QUARANTINE', effect: 'Blocked; token cut to in-role reads only' },
  { from: 90, to: 100, band: 'REVOKE', effect: 'Token revoked, delegated child tokens revoked with it' },
];

export const bandOf = (score: number): Band => [...LADDER].reverse().find(l => score >= l.from)!.band;

export interface FactorRow { factor: Factor; weighted: number; drop: number; reason: string }

export interface Verdict {
  score: number;
  band: Band;
  escalated?: string;          // why the band is one step above the score's own band
  factors: FactorRow[];
  rootCause?: string;          // plain words, shown before any chart
  outcome: string;             // what actually happened to the call
}

export interface Step extends Verdict {
  agent: string;
  tool: string;
  arg?: string;
  tag?: 'untrusted' | 'still works' | 'delegated';
  credentials: { ok: boolean; reason?: string };
  culprit?: { doc: string; finding: string };
  token?: { from: string; to: string; change: string };
  shadow?: Verdict;            // what the same call scores when nothing is enforced (state diverges)
  dividerBefore?: string;      // a session or charter boundary drawn above the step
}

export interface Twin { atStep: number; agent: string; role: string; step: Pick<Step, 'tool' | 'arg' | 'score' | 'band'>; caption: string }

export interface Scenario {
  id: string;
  code: string;
  title: string;
  agent: string;
  role: string;
  summary: string;
  steps: Step[];
  taint?: { from: number; to: number[] };   // step indexes (0-based)
  twin?: Twin;
  shadowNote?: string;
}

const allow = (outcome = 'Ran normally'): Pick<Step, 'score' | 'band' | 'factors' | 'outcome' | 'credentials'> =>
  ({ score: 0, band: 'ALLOW', factors: [], outcome, credentials: { ok: true } });

const PDF = { doc: 'inv-204511.pdf', finding: 'hidden instruction, foreign URL' };

export const SCENARIOS: Scenario[] = [
  {
    id: 'd2', code: 'D2', title: 'Poisoned supplier PDF', agent: 'procurement-01', role: 'procurement',
    summary: 'A supplier invoice hides an instruction to fetch salaries and post them to an outside host.',
    taint: { from: 2, to: [3, 4] },
    twin: {
      atStep: 3, agent: 'hr-assist-01', role: 'hr_assistant',
      step: { tool: 'hr.read_salary', score: 0, band: 'ALLOW' },
      caption: 'Same call, HR role',
    },
    shadowNote: 'Shadow mode: nothing is blocked. The salary read runs, and the upload leaves with salary data in hand.',
    steps: [
      { agent: 'procurement-01', tool: 'erp.get_vendor', ...allow() },
      {
        agent: 'procurement-01', tool: 'erp.search_invoices', score: 5, band: 'ALLOW', credentials: { ok: true },
        factors: [{ factor: 'S2', weighted: 0.05, drop: 5, reason: 'get_vendor → search_invoices is 5.4 bits, own p95 3.6' }],
        outcome: 'Ran normally',
      },
      {
        agent: 'procurement-01', tool: 'docs.read_attachment', arg: 'inv-204511.pdf', tag: 'untrusted', ...allow('Ran; content marked untrusted (external sender)'),
        culprit: { doc: 'inv-204511.pdf', finding: 'injection score 0.90' },
      },
      {
        agent: 'procurement-01', tool: 'hr.read_salary', score: 69, band: 'DOWN_SCOPE', credentials: { ok: true },
        factors: [
          { factor: 'S2', weighted: 0.30, drop: 13, reason: 'read_attachment → read_salary is 14.4 bits; own p95 is 3.6' },
          { factor: 'S1', weighted: 0.29, drop: 12, reason: 'hr.read_salary is outside the procurement charter' },
          { factor: 'S4', weighted: 0.23, drop: 9, reason: 'behaviour shifted right after inv-204511.pdf was read' },
          { factor: 'S3', weighted: 0.20, drop: 8, reason: 'sensitive read one step after untrusted content' },
        ],
        rootCause: 'hr.read_salary is 14.4 bits more surprising than this agent’s normal (own p95 3.6, 308 calls).',
        culprit: PDF,
        token: { from: 'v1', to: 'v2', change: 'removed hr.read_salary, hr.list_employees, http.post, payments.pay_invoice' },
        outcome: 'Blocked before the read. No salary data left HR.',
        shadow: {
          score: 69, band: 'DOWN_SCOPE', outcome: 'Would have down-scoped. The read ran.',
          factors: [
            { factor: 'S2', weighted: 0.30, drop: 13, reason: 'read_attachment → read_salary is 14.4 bits; own p95 is 3.6' },
            { factor: 'S1', weighted: 0.29, drop: 12, reason: 'hr.read_salary is outside the procurement charter' },
            { factor: 'S4', weighted: 0.23, drop: 9, reason: 'behaviour shifted right after inv-204511.pdf was read' },
            { factor: 'S3', weighted: 0.20, drop: 8, reason: 'sensitive read one step after untrusted content' },
          ],
          rootCause: 'hr.read_salary is 14.4 bits more surprising than this agent’s normal (own p95 3.6, 308 calls).',
        },
      },
      {
        agent: 'procurement-01', tool: 'http.post', arg: 'acme-verify.co', score: 72, band: 'QUARANTINE',
        escalated: 'Second call ≥55 in this session, after the down-scope at step 4',
        credentials: { ok: false, reason: 'http.post was removed in token v2' },
        factors: [
          { factor: 'S1', weighted: 0.33, drop: 14, reason: 'http.post is off-charter; acme-verify.co is not in [acme.com]' },
          { factor: 'S3', weighted: 0.28, drop: 11, reason: 'host acme-verify.co first appeared in untrusted content' },
          { factor: 'S2', weighted: 0.25, drop: 9, reason: 'read_salary → http.post is 12.0 bits; own p95 is 3.6' },
          { factor: 'S4', weighted: 0.23, drop: 8, reason: 'still inside the shift that followed inv-204511.pdf' },
        ],
        rootCause: 'http.post is outside the procurement role, to a host that only appears in the poisoned PDF.',
        culprit: PDF,
        token: { from: 'v2', to: 'v3', change: 'in-charter reads only' },
        outcome: 'Blocked. Zero requests reached acme-verify.co.',
        shadow: {
          score: 77, band: 'QUARANTINE', outcome: 'Would have quarantined. The POST ran with salary data held.',
          factors: [
            { factor: 'S3', weighted: 0.40, drop: 16, reason: 'external egress while a completed salary read is held' },
            { factor: 'S1', weighted: 0.33, drop: 12, reason: 'http.post is off-charter; acme-verify.co is not in [acme.com]' },
            { factor: 'S2', weighted: 0.25, drop: 8, reason: 'read_salary → http.post is 12.0 bits; own p95 is 3.6' },
            { factor: 'S4', weighted: 0.23, drop: 7, reason: 'still inside the shift that followed inv-204511.pdf' },
          ],
          rootCause: 'Salary data was in hand and leaving for a host named only in the poisoned PDF.',
        },
      },
      { agent: 'procurement-01', tool: 'erp.get_price_list', tag: 'still works', ...allow('Ran. In-role reads still work under token v3.') },
    ],
  },
  {
    id: 'd3', code: 'D3', title: 'Same read, HR role', agent: 'hr-assist-01', role: 'hr_assistant',
    summary: 'The HR assistant reads salaries as part of its job. Same tool, same kind of valid token.',
    twin: {
      atStep: 1, agent: 'procurement-01', role: 'procurement',
      step: { tool: 'hr.read_salary', score: 69, band: 'DOWN_SCOPE' },
      caption: 'Same call, procurement role (D2)',
    },
    steps: [
      { agent: 'hr-assist-01', tool: 'hr.list_employees', ...allow() },
      { agent: 'hr-assist-01', tool: 'hr.read_salary', ...allow('Ran. In charter and in this agent’s baseline.') },
    ],
  },
  {
    id: 'd4', code: 'D4', title: 'New agent, no history', agent: 'procurement-02', role: 'procurement',
    summary: 'Created today. With no baseline of its own, behaviour is judged against its role and its peers.',
    taint: { from: 1, to: [2, 3] },
    steps: [
      { agent: 'procurement-02', tool: 'erp.get_vendor', ...allow() },
      { agent: 'procurement-02', tool: 'docs.read_attachment', arg: 'inv-204511.pdf', tag: 'untrusted', ...allow('Ran; content marked untrusted (external sender)') },
      {
        agent: 'procurement-02', tool: 'hr.read_salary', score: 63, band: 'DOWN_SCOPE', credentials: { ok: true },
        factors: [
          { factor: 'S1', weighted: 0.29, drop: 15, reason: 'hr.read_salary is outside the procurement charter' },
          { factor: 'S4', weighted: 0.23, drop: 11, reason: 'behaviour shifted right after inv-204511.pdf was read' },
          { factor: 'S3', weighted: 0.20, drop: 9, reason: 'sensitive read one step after untrusted content' },
          { factor: 'S2', weighted: 0.16, drop: 7, reason: '8.9 bits against the peer prior (no own history yet)' },
        ],
        rootCause: 'hr.read_salary is outside the procurement charter. No history needed to see that.',
        culprit: PDF,
        token: { from: 'v1', to: 'v2', change: 'removed hr.read_salary, hr.list_employees, http.post, payments.pay_invoice' },
        outcome: 'Blocked before the read.',
      },
      {
        agent: 'procurement-02', tool: 'http.post', arg: 'acme-verify.co', score: 69, band: 'QUARANTINE',
        escalated: 'Second call ≥55 in this session, after the down-scope at step 3',
        credentials: { ok: false, reason: 'http.post was removed in token v2' },
        factors: [
          { factor: 'S1', weighted: 0.33, drop: 16, reason: 'http.post is off-charter; acme-verify.co is not in [acme.com]' },
          { factor: 'S3', weighted: 0.28, drop: 13, reason: 'host acme-verify.co first appeared in untrusted content' },
          { factor: 'S4', weighted: 0.23, drop: 10, reason: 'still inside the shift that followed inv-204511.pdf' },
          { factor: 'S2', weighted: 0.16, drop: 6, reason: '8.9 bits against the peer prior' },
        ],
        rootCause: 'http.post is outside the procurement role, to a host that only appears in the poisoned PDF.',
        culprit: PDF,
        token: { from: 'v2', to: 'v3', change: 'in-charter reads only' },
        outcome: 'Blocked. Zero requests reached acme-verify.co.',
      },
    ],
  },
  {
    id: 'd5', code: 'D5', title: 'Legitimate role change', agent: 'procurement-01', role: 'procurement',
    summary: 'Procurement starts onboarding suppliers. The owner approves it as a role change instead of an attack.',
    steps: [
      {
        agent: 'procurement-01', tool: 'erp.create_purchase_request', score: 6, band: 'ALLOW', credentials: { ok: true },
        factors: [{ factor: 'S2', weighted: 0.07, drop: 6, reason: 'opening a session with a purchase request is 6.1 bits' }],
        outcome: 'Ran normally',
      },
      {
        agent: 'procurement-01', tool: 'erp.onboard_supplier', score: 37, band: 'HOLD', credentials: { ok: true },
        factors: [
          { factor: 'S2', weighted: 0.30, drop: 20, reason: 'create_purchase_request → onboard_supplier is 14.3 bits; own p95 3.6' },
          { factor: 'S1', weighted: 0.20, drop: 11, reason: 'erp.onboard_supplier is outside charter v1' },
        ],
        rootCause: 'onboard_supplier has never followed a purchase request for this agent, and charter v1 does not include it.',
        outcome: 'Parked for the owner, finance-platform.',
      },
      {
        dividerBefore: 'Owner approved as role change · charter v1 → v2 · new session',
        agent: 'procurement-01', tool: 'erp.create_purchase_request', score: 6, band: 'ALLOW', credentials: { ok: true },
        factors: [{ factor: 'S2', weighted: 0.07, drop: 6, reason: 'opening a session with a purchase request is 6.1 bits' }],
        outcome: 'Ran normally',
      },
      {
        agent: 'procurement-01', tool: 'erp.onboard_supplier', score: 15, band: 'ALLOW', credentials: { ok: true },
        factors: [{ factor: 'S2', weighted: 0.17, drop: 15, reason: 'still new to the baseline: 9.3 bits under charter v2' }],
        outcome: 'Ran. Now in charter v2; the baseline will absorb it.',
      },
    ],
  },
  {
    id: 'd7', code: 'D7', title: 'Delegated mailer', agent: 'procurement-01', role: 'procurement',
    summary: 'The tainted procurement agent hands a send to the mailer. Only the delegated session is restricted.',
    taint: { from: 0, to: [1] },
    twin: {
      atStep: 1, agent: 'mailer-01', role: 'mailer',
      step: { tool: 'mail.send', arg: 'buyer@acme.com', score: 0, band: 'ALLOW' },
      caption: 'Mailer’s own job, same minute',
    },
    steps: [
      { agent: 'procurement-01', tool: 'docs.read_attachment', arg: 'inv-204511.pdf', tag: 'untrusted', ...allow('Ran; content marked untrusted (external sender)') },
      {
        agent: 'mailer-01', tool: 'mail.send', arg: 'finance@acme-verify.co', tag: 'delegated', score: 78, band: 'QUARANTINE', credentials: { ok: true },
        factors: [
          { factor: 'S6', weighted: 0.60, drop: 33, reason: 'needs egress outside what both agents in the chain may do' },
          { factor: 'S3', weighted: 0.28, drop: 8, reason: 'recipient domain first appeared in untrusted content' },
          { factor: 'S1', weighted: 0.24, drop: 7, reason: 'acme-verify.co is not in the mailer’s egress allow list' },
        ],
        rootCause: 'A delegated call asked for more than the procurement → mailer chain allows together.',
        culprit: PDF,
        token: { from: 'delegated session', to: 'quarantined', change: 'mailer-01 itself stays active' },
        outcome: 'Blocked on the delegated session only.',
      },
    ],
  },
  {
    id: 'd8', code: 'D8', title: 'Decoy file touched', agent: 'hr-assist-01', role: 'hr_assistant',
    summary: 'A honeytoken file no real job ever opens. Touching it is enough.',
    steps: [
      {
        agent: 'hr-assist-01', tool: 'docs.read_attachment', arg: 'hr/salary_2026_FINAL.xlsx', score: 100, band: 'REVOKE', credentials: { ok: true },
        factors: [{ factor: 'TRIPWIRE', weighted: 1, drop: 100, reason: 'hr/salary_2026_FINAL.xlsx is a decoy' }],
        rootCause: 'The agent opened a decoy file. No legitimate workflow references it.',
        token: { from: 'v1', to: 'revoked', change: 'all delegated child tokens revoked' },
        outcome: 'Blocked. Agent revoked.',
      },
    ],
  },
];

export const scenarioById = (id: string | undefined) => SCENARIOS.find(s => s.id === id);

export const AGENTS = [
  { id: 'procurement-01', role: 'procurement' },
  { id: 'procurement-02', role: 'procurement' },
  { id: 'hr-assist-01', role: 'hr_assistant' },
  { id: 'mailer-01', role: 'mailer' },
];

export const decisionId = (scenario: Scenario, i: number) => `${scenario.code.toLowerCase()}_${String(i + 1).padStart(4, '0')}`;
