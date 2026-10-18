// S6 delegation graph (Phase II-B). Weight 0.60. Applies only to calls made on a delegated (act-chain) token.
// s = nor(1.0·[call needs a tool, data class or egress host outside the intersection of every charter in the chain],
//         .3·[first-ever caller→callee edge], .4·[caller fan-out > 3 in this session], .8·parentLastScore/100)
import { nor } from '../fusion/fuse';
import { egressHost, hostMatches } from '../tools';
import type { Charter, SubSignal, ToolDef } from '../types';

export interface S6Input {
  tool: ToolDef;
  args: Record<string, string | number>;
  chain: Charter[];          // caller(s) first, callee last
  edgeSeen: boolean;
  callerFanOut: number;      // distinct delegations by the caller in this session, including this one
  parentLastScore: number;
}

export function s6Delegation(i: S6Input) {
  const subs: SubSignal[] = [];
  if (i.chain.length < 2) return { strength: 0, subs };
  const names = i.chain.map(c => c.role).join(' ∩ ');

  const host = egressHost(i.tool, i.args);
  if (!i.chain.every(c => c.tools.includes(i.tool.name))) {
    subs.push({ code: 'widens_act_chain', value: 1, reason: `${i.tool.name} is outside what ${names} allow`, evidence: [i.tool.name] });
  } else if (!i.chain.every(c => c.dataClasses.includes(i.tool.dataClass))) {
    subs.push({ code: 'widens_act_chain', value: 1, reason: `${i.tool.dataClass} data is outside what ${names} allow`, evidence: [i.tool.dataClass] });
  } else if (host !== null && !i.chain.every(c => c.egressAllow.some(a => hostMatches(host, a)))) {
    const common = i.chain[0]!.egressAllow.filter(d => i.chain.every(c => c.egressAllow.some(a => hostMatches(d, a))));
    subs.push({ code: 'widens_act_chain', value: 1, reason: `host ${host} is outside what ${names} allow ([${common.join(', ')}])`, evidence: [host] });
  }
  if (!i.edgeSeen) subs.push({ code: 'new_edge', value: 0.3, reason: `first delegation along ${i.chain.map(c => c.role).join(' → ')}`, evidence: [] });
  if (i.callerFanOut > 3) subs.push({ code: 'fan_out', value: 0.4, reason: `caller delegated ${i.callerFanOut} times this session`, evidence: [] });
  if (i.parentLastScore > 0) {
    subs.push({ code: 'parent_risk', value: 0.8 * i.parentLastScore / 100, reason: `caller's last call scored ${i.parentLastScore}`, evidence: [] });
  }
  return { strength: nor(subs.map(s => s.value)), subs };
}
