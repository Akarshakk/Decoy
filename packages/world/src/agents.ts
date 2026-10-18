// The four demo agents (build_execution.md §4.3). Tokens are over-provisioned on purpose, as in the PS.
import { CHARTERS_V1 } from './charters';

export interface AgentProfile {
  id: string;
  role: keyof typeof CHARTERS_V1;
  displayName: string;
  scopes: string[];
  runtime: { id: string; asn: string };
  activeHours: [number, number];   // p5–p95 of the agent's active hours (UTC)
  historySessions: number;         // seeded benign sessions before the demo starts
  historySeed?: number;
}

const proc = CHARTERS_V1.procurement.tools;
// Over-provisioned like real agent tokens: broad ERP write scope plus HR, outbound HTTP and payments.
const PROC_EXTRA = ['erp.onboard_supplier', 'hr.read_salary', 'hr.list_employees', 'http.post', 'payments.pay_invoice'];

export const AGENT_PROFILES: AgentProfile[] = [
  { id: 'procurement-01', role: 'procurement', displayName: 'Procurement assistant', scopes: [...proc, ...PROC_EXTRA],
    runtime: { id: 'rt-proc-01', asn: 'AS64500' }, activeHours: [8, 19], historySessions: 40, historySeed: 42 },
  { id: 'procurement-02', role: 'procurement', displayName: 'Procurement assistant (new)', scopes: [...proc, ...PROC_EXTRA],
    runtime: { id: 'rt-proc-02', asn: 'AS64500' }, activeHours: [8, 19], historySessions: 0 },
  { id: 'hr-assist-01', role: 'hr_assistant', displayName: 'HR assistant', scopes: [...CHARTERS_V1.hr_assistant.tools, 'http.post'],
    runtime: { id: 'rt-hr-01', asn: 'AS64500' }, activeHours: [8, 19], historySessions: 40, historySeed: 43 },
  { id: 'mailer-01', role: 'mailer', displayName: 'Mailer', scopes: [...CHARTERS_V1.mailer.tools],
    runtime: { id: 'rt-mail-01', asn: 'AS64500' }, activeHours: [8, 19], historySessions: 40, historySeed: 44 },
];
