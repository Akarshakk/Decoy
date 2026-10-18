// Tool semantics that depend on the call's arguments: where it sends data, and whether that is outside the org.
import type { ActionClass, ToolDef } from './types';

export function egressHost(tool: ToolDef, args: Record<string, string | number>): string | null {
  if (!tool.egressArg) return null;
  const v = String(args[tool.egressArg] ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('@')) return v.split('@').pop()!;
  try { return new URL(v.includes('://') ? v : `https://${v}`).hostname; } catch { return v; }
}

export const hostMatches = (host: string, allowed: string) => host === allowed || host.endsWith(`.${allowed}`);

// A sink tool is an external send only when its target is outside the org's own domains.
export function actionOf(tool: ToolDef, args: Record<string, string | number>, internalDomains: string[]): ActionClass {
  const host = egressHost(tool, args);
  if (host === null) return tool.action;
  return internalDomains.some(d => hostMatches(host, d)) ? (tool.action === 'send_external' ? 'write_internal' : tool.action) : 'send_external';
}
