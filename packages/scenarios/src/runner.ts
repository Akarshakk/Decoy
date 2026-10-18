// Drives a sandbox the way an agent runtime would: sessions, tokens, calls two minutes apart.
import type { Decision } from '@swaroop/engine';
import { AGENT_PROFILES, createSandbox, DAY, DEMO_START, MINUTE, type SandboxOptions } from '@swaroop/world';

export type Args = Record<string, string | number>;

export class Run {
  t = DEMO_START;
  private n = 0;
  private constructor(readonly sb: Awaited<ReturnType<typeof createSandbox>>) {}
  static async create(opts: SandboxOptions = {}) { return new Run(await createSandbox(opts)); }
  get engine() { return this.sb.engine; }
  get backends() { return this.sb.backends; }

  at(ms: number) { this.t = ms; return this; }
  nextDay(hour = 10) { const d = Math.floor((this.t - Date.UTC(2026, 9, 19)) / DAY) + 1; this.t = Date.UTC(2026, 9, 19) + d * DAY + hour * 60 * MINUTE; return this; }

  async session(agentId: string, opts: { runtime?: { id: string; asn: string }; jwt?: string } = {}) {
    const runtime = opts.runtime ?? AGENT_PROFILES.find(a => a.id === agentId)!.runtime;
    const jwt = opts.jwt ?? await this.engine.tokenFor(agentId, this.t);
    return new Session(this, agentId, `${agentId}-s${++this.n}`, runtime, jwt, null);
  }

  async delegate(parent: Session, calleeId: string) {
    const sid = `${calleeId}-d${++this.n}`;
    const d = await this.engine.delegate(parent.id, calleeId, sid, this.t);
    return new Session(this, calleeId, sid, AGENT_PROFILES.find(a => a.id === calleeId)!.runtime, d.jwt, parent.id);
  }
}

export class Session {
  decisions: Decision[] = [];
  constructor(private run: Run, readonly agentId: string, readonly id: string, readonly runtime: { id: string; asn: string },
    public jwt: string, readonly parent: string | null) {}

  async call(tool: string, args: Args = {}) {
    const d = await this.run.engine.check({
      callId: `c${this.run.engine.decisions.length + 1}`, agentId: this.agentId, sessionId: this.id, ts: this.run.t,
      jwt: this.jwt, tool, args, runtime: this.runtime,
    });
    this.decisions.push(d);
    this.run.t += 2 * MINUTE;
    // A re-issued token is handed back to the runtime, which uses it from the next call on.
    if (!this.parent && d.tokenAction.kind === 'reissue' && d.tokenAction.target === 'agent' && d.call.runtime.id === this.runtime.id) {
      this.jwt = this.run.engine.currentToken(this.agentId);
    }
    return d;
  }

  end() { return this.run.engine.endSession(this.id, this.run.t); }
}
