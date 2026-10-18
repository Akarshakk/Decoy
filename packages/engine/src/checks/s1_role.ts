// S1 role conformance (Phase II-A, inline, deterministic). Weight 0.40.
// s = nor(.5·[tool ∉ charter], .15·sens·[data class ∉ charter], .6·[egress host ∉ allow list], .3·[calls > budget])
import { nor } from '../fusion/fuse';
import { egressHost, hostMatches } from '../tools';
import type { Charter, SubSignal, ToolDef } from '../types';

export interface S1Input {
  tool: ToolDef;
  args: Record<string, string | number>;
  charter: Charter;
  callsInSession: number;   // including this call
}

export function s1Role({ tool, args, charter, callsInSession }: S1Input): { strength: number; subs: SubSignal[] } {
  const subs: SubSignal[] = [];
  const cv = `${charter.role} charter v${charter.version}`;
  if (!charter.tools.includes(tool.name)) {
    subs.push({ code: 'tool_off_charter', value: 0.5, reason: `${tool.name} is not in the ${cv}`, evidence: [cv] });
  }
  if (!charter.dataClasses.includes(tool.dataClass) && tool.sensitivity > 0) {
    subs.push({ code: 'data_class_off_charter', value: 0.15 * tool.sensitivity,
      reason: `${tool.dataClass} data (sensitivity ${tool.sensitivity}) is outside the ${cv}`, evidence: [cv] });
  }
  const host = egressHost(tool, args);
  if (host !== null && !charter.egressAllow.some(a => hostMatches(host, a))) {
    subs.push({ code: 'egress_off_allowlist', value: 0.6, reason: `host ${host} not in [${charter.egressAllow.join(', ')}]`, evidence: [host] });
  }
  if (callsInSession > charter.maxCallsPerSession) {
    subs.push({ code: 'over_call_budget', value: 0.3,
      reason: `call ${callsInSession} exceeds the session budget of ${charter.maxCallsPerSession}`, evidence: [] });
  }
  return { strength: nor(subs.map(s => s.value)), subs };
}
