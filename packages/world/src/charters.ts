// Role charters v1 (build_execution.md §4.2), unsigned; the registry signs them at world setup.
import type { Charter } from '@swaroop/engine';

type Unsigned = Omit<Charter, 'sig'>;

// Demo-only registry key; the console labels it as a sandbox key.
export const REGISTRY_KEY = 'swaroop-demo-charter-registry';

export const CHARTERS_V1: Record<'procurement' | 'hr_assistant' | 'mailer', Unsigned> = {
  procurement: {
    role: 'procurement', version: 1, owner: 'finance-platform',
    purpose: 'Look up suppliers and prices, match invoices, raise purchase requests, email internal buyers.',
    tools: ['erp.get_vendor', 'erp.get_price_list', 'erp.search_invoices', 'erp.create_purchase_request', 'erp.export_report', 'docs.read_attachment', 'mail.send'],
    dataClasses: ['supplier_master', 'pricing', 'invoice', 'purchase_request', 'supplier_export', 'document', 'message'],
    egressAllow: ['acme.com'], maxCallsPerSession: 60, delegatesTo: ['mailer'],
  },
  hr_assistant: {
    role: 'hr_assistant', version: 1, owner: 'people-ops',
    purpose: 'Answer payroll and directory questions for HR staff.',
    tools: ['hr.read_salary', 'hr.list_employees', 'docs.read_attachment', 'mail.send'],
    dataClasses: ['hr_salary', 'hr_directory', 'document', 'message'],
    egressAllow: ['acme.com'], maxCallsPerSession: 60, delegatesTo: [],
  },
  mailer: {
    role: 'mailer', version: 1, owner: 'it-platform',
    purpose: 'Send email on behalf of other agents to approved domains.',
    tools: ['mail.send'],
    dataClasses: ['message', 'document', 'purchase_request'],
    egressAllow: ['acme.com', 'acme-supplies.example'], maxCallsPerSession: 100, delegatesTo: [],
  },
};

// D5: what "approve as role change" produces for procurement.
export const CHARTER_PROCUREMENT_V2: Unsigned = {
  ...CHARTERS_V1.procurement,
  version: 2,
  tools: [...CHARTERS_V1.procurement.tools, 'erp.onboard_supplier'],
};
