// The 12 demo tools (build_execution.md §4.1). Names must match research/sim/model.mjs CATALOG.
import { canonicalJSON, sha256Hex, type ToolDef } from '@swaroop/engine';

export type ToolSpec = Omit<ToolDef, 'defHash'>;

export const INTERNAL_DOMAINS = ['acme.com'];
export const HONEYTOKEN = 'hr/salary_2026_FINAL.xlsx';

export const TOOL_SPECS: ToolSpec[] = [
  { name: 'erp.get_vendor', action: 'read', dataClass: 'supplier_master', sensitivity: 1 },
  { name: 'erp.get_price_list', action: 'read', dataClass: 'pricing', sensitivity: 1 },
  { name: 'erp.search_invoices', action: 'read', dataClass: 'invoice', sensitivity: 1 },
  { name: 'erp.create_purchase_request', action: 'write_internal', dataClass: 'purchase_request', sensitivity: 1 },
  { name: 'erp.export_report', action: 'read', dataClass: 'supplier_export', sensitivity: 2 },
  { name: 'erp.onboard_supplier', action: 'write_internal', dataClass: 'supplier_master', sensitivity: 1 },
  { name: 'docs.read_attachment', action: 'read', dataClass: 'document', sensitivity: 1, untrustedOutput: true },
  // An internal message by default; the engine reclassifies it as send_external when `to` is outside INTERNAL_DOMAINS.
  { name: 'mail.send', action: 'write_internal', dataClass: 'message', sensitivity: 1, egressArg: 'to' },
  { name: 'hr.read_salary', action: 'read', dataClass: 'hr_salary', sensitivity: 3 },
  { name: 'hr.list_employees', action: 'read', dataClass: 'hr_directory', sensitivity: 2 },
  { name: 'http.post', action: 'send_external', dataClass: 'outbound', sensitivity: 1, egressArg: 'host' },
  { name: 'payments.pay_invoice', action: 'payment', dataClass: 'payment', sensitivity: 3 },
];

export async function buildCatalog(): Promise<ToolDef[]> {
  return Promise.all(TOOL_SPECS.map(async t => ({ ...t, defHash: await sha256Hex(canonicalJSON(t)) })));
}
