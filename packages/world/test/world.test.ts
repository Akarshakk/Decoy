import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs reference implementation, no types
import { CATALOG as SIM_CATALOG, PROC_V1, PROC_V2 } from '../../../research/sim/model.mjs';
import { actionOf, canonicalJSON, egressHost, sha256Hex, signCharter, verifyCharter } from '@swaroop/engine';
import { AGENT_PROFILES, CHARTERS_V1, CHARTER_PROCUREMENT_V2, HONEYTOKEN, INTERNAL_DOMAINS, REGISTRY_KEY, TOOL_SPECS, buildCatalog } from '../src';

describe('catalog', () => {
  it('has the same 12 tools as the reference sim', () => {
    expect(TOOL_SPECS.map(t => t.name).sort()).toEqual([...SIM_CATALOG].sort());
  });

  it('pins each tool definition with sha256 of its canonical form', async () => {
    const catalog = await buildCatalog();
    for (const t of catalog) {
      const { defHash, ...def } = t;
      expect(defHash).toBe(await sha256Hex(canonicalJSON(def)));
    }
  });

  it('marks salary data most sensitive and attachments as untrusted output', () => {
    const by = Object.fromEntries(TOOL_SPECS.map(t => [t.name, t]));
    expect(by['hr.read_salary']).toMatchObject({ sensitivity: 3, dataClass: 'hr_salary' });
    expect(by['payments.pay_invoice']).toMatchObject({ action: 'payment', sensitivity: 3 });
    expect(by['docs.read_attachment']!.untrustedOutput).toBe(true);
    expect(by['erp.export_report']!.sensitivity).toBe(2);
  });
});

describe('effective action and egress', () => {
  const tools = Object.fromEntries(TOOL_SPECS.map(t => [t.name, { ...t, defHash: '' }]));
  it('treats mail to an outside domain as an external send', () => {
    expect(actionOf(tools['mail.send']!, { to: 'finance@acme-verify.co' }, INTERNAL_DOMAINS)).toBe('send_external');
    expect(actionOf(tools['mail.send']!, { to: 'buyer@acme.com' }, INTERNAL_DOMAINS)).toBe('write_internal');
    expect(actionOf(tools['erp.get_vendor']!, { id: 'v1' }, INTERNAL_DOMAINS)).toBe('read');
  });
  it('extracts the egress host from an email, a host or a URL', () => {
    expect(egressHost(tools['mail.send']!, { to: 'finance@acme-verify.co' })).toBe('acme-verify.co');
    expect(egressHost(tools['http.post']!, { host: 'acme-verify.co' })).toBe('acme-verify.co');
    expect(egressHost(tools['http.post']!, { host: 'https://acme-verify.co/confirm' })).toBe('acme-verify.co');
    expect(egressHost(tools['erp.get_vendor']!, { id: 'v1' })).toBeNull();
  });
});

describe('charters', () => {
  it('procurement v1 and v2 match the sim exactly', () => {
    expect(CHARTERS_V1.procurement.tools.sort()).toEqual([...PROC_V1].sort());
    expect(CHARTER_PROCUREMENT_V2.tools.sort()).toEqual([...PROC_V2].sort());
    expect(CHARTER_PROCUREMENT_V2.version).toBe(2);
  });

  it('are signed, and any edit breaks the signature', async () => {
    for (const c of Object.values(CHARTERS_V1)) {
      const signed = await signCharter(c, REGISTRY_KEY);
      expect(await verifyCharter(signed, REGISTRY_KEY)).toBe(true);
      expect(await verifyCharter({ ...signed, tools: [...signed.tools, 'http.post'] }, REGISTRY_KEY)).toBe(false);
      expect(await verifyCharter(signed, 'wrong-key')).toBe(false);
    }
  });

  it('every charter tool and data class exists in the catalog', () => {
    const names = new Set(TOOL_SPECS.map(t => t.name)), classes = new Set(TOOL_SPECS.map(t => t.dataClass));
    for (const c of [...Object.values(CHARTERS_V1), CHARTER_PROCUREMENT_V2]) {
      for (const t of c.tools) expect(names.has(t)).toBe(true);
      for (const d of c.dataClasses) expect(classes.has(d)).toBe(true);
    }
  });
});

describe('agents', () => {
  it('over-provisions tokens exactly as build_execution.md §4.3 says', () => {
    const extra = (id: string) => {
      const a = AGENT_PROFILES.find(p => p.id === id)!;
      return a.scopes.filter(s => !CHARTERS_V1[a.role as keyof typeof CHARTERS_V1].tools.includes(s)).sort();
    };
    expect(extra('procurement-01')).toEqual(['hr.list_employees', 'hr.read_salary', 'http.post', 'payments.pay_invoice']);
    expect(extra('procurement-02')).toEqual(['hr.list_employees', 'hr.read_salary', 'http.post', 'payments.pay_invoice']);
    expect(extra('hr-assist-01')).toEqual(['http.post']);
    expect(extra('mailer-01')).toEqual([]);
  });

  it('gives each agent a known runtime, ASN and active hours', () => {
    expect(AGENT_PROFILES.map(a => [a.id, a.runtime.id, a.runtime.asn])).toEqual([
      ['procurement-01', 'rt-proc-01', 'AS64500'], ['procurement-02', 'rt-proc-02', 'AS64500'],
      ['hr-assist-01', 'rt-hr-01', 'AS64500'], ['mailer-01', 'rt-mail-01', 'AS64500'],
    ]);
    expect(AGENT_PROFILES.find(a => a.id === 'procurement-01')!.activeHours).toEqual([8, 19]);
  });

  it('names a honeytoken no charter can reach', () => {
    expect(HONEYTOKEN).toBe('hr/salary_2026_FINAL.xlsx');
  });
});
