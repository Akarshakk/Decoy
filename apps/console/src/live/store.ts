// One live sandbox per browser tab: the real Engine with the demo world loaded, driven by benign workdays and
// injected incidents. Pages subscribe with useSyncExternalStore; every action runs one at a time, in order.
// The engine is deterministic, so a reload replays the tab's action log (sessionStorage) into the same sandbox.
import { verifyChain } from '@swaroop/engine';
import { INCIDENTS, LEGIT, Run, workday } from '@swaroop/scenarios';
import { DAY } from '@swaroop/world';

export type Mode = 'enforce' | 'shadow';

type Action =
  | { a: 'workday' } | { a: 'inject'; id: string } | { a: 'mode'; mode: Mode } | { a: 'ownerReset'; agent: string }
  | { a: 'approveToolVersion'; tool: string } | { a: 'announceBatch'; agent: string; days: number }
  | { a: 'approveHold' | 'denyHold' | 'approveAsRoleChange' | 'markFalsePositive' | 'confirmCompromise'; id: string };

export interface ActionLogStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const KEY = 'swaroop.sandbox.v1';

export interface LiveState {
  run: Run | null;
  version: number;              // bumps after every change; views memoise on it
  mode: Mode;
  busy: string | null;          // what is running now, in words
  error: string | null;
  ledger: { ok: boolean | null; brokenAt: number | null; count: number; head: string | null };
}

export class LiveStore {
  private state: LiveState = { run: null, version: 0, mode: 'enforce', busy: null, error: null, ledger: { ok: null, brokenAt: null, count: 0, head: null } };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private booting: Promise<void> | null = null;
  private log: Action[] = [];

  constructor(private storage: ActionLogStorage | null = null) {}

  private save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.log)); } catch { /* storage blocked: the sandbox just won't survive a reload */ }
  }

  private load(): Action[] {
    try {
      const v = JSON.parse(this.storage?.getItem(KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }

  private apply(run: Run, x: Action): Promise<unknown> {
    const e = run.engine;
    switch (x.a) {
      case 'workday': return workday(run);
      case 'inject': return [...INCIDENTS, ...LEGIT].find(i => i.id === x.id)!.play(run);
      case 'approveToolVersion': return e.approveToolVersion(x.tool, run.t);
      case 'announceBatch': return e.announceBatchWindow(x.agent, run.t + x.days * DAY, run.t);
      case 'mode': e.setMode(x.mode); this.state = { ...this.state, mode: x.mode }; return Promise.resolve();
      case 'ownerReset': return e.ownerReset(x.agent, run.t);
      default: return e[x.a](x.id, run.t);
    }
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.listeners.forEach(fn => fn());
  }

  private act<T>(label: string, fn: (run: Run) => Promise<T>, record?: Action): Promise<T> {
    const next = this.queue.then(async () => {
      this.set({ busy: label, error: null });
      try {
        const out = await fn(this.state.run!);
        if (record) { this.log.push(record); this.save(); }
        await this.settle();
        return out;
      } catch (e) {
        this.set({ busy: null, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  // Re-verify the whole hash chain after every change: the sidebar pill shows the engine's own ledger.
  private async settle() {
    const recs = this.state.run!.engine.ledgerRecords();
    const brokenAt = await verifyChain(recs);
    this.set({ busy: null, ledger: { ok: brokenAt === null, brokenAt, count: recs.length, head: recs.at(-1)?.hash ?? null } });
  }

  boot() {
    this.booting ??= this.queue.then(async () => {
      this.set({ busy: 'Loading the sandbox' });
      const run = await Run.create();
      this.state = { ...this.state, run };
      await workday(run);
      // Replay this tab's earlier actions; if any no longer applies (an old log), start clean instead.
      const log = this.load();
      try {
        for (const x of log) await this.apply(run, x);
        this.log = log;
      } catch {
        return this.fresh();
      }
      await this.settle();
    });
    this.queue = this.booting;
    return this.booting;
  }

  private async fresh() {
    const run = await Run.create();
    this.state = { ...this.state, run, mode: 'enforce' };
    await workday(run);
    this.log = [];
    try { this.storage?.removeItem(KEY); } catch { /* ignore */ }
    await this.settle();
  }

  reset() { return this.act('Resetting the sandbox', () => this.fresh()); }

  setMode(mode: Mode) {
    return this.act(mode === 'shadow' ? 'Switching to shadow mode' : 'Switching to enforce mode', run => this.apply(run, { a: 'mode', mode }), { a: 'mode', mode });
  }

  private run(label: string, x: Action) { return this.act(label, run => this.apply(run, x), x); }

  workday() { return this.run('Running a workday', { a: 'workday' }); }

  inject(id: string) {
    const inc = [...INCIDENTS, ...LEGIT].find(i => i.id === id);
    if (!inc) return Promise.reject(new Error(`unknown incident ${id}`));
    return this.run(`Running ${inc.code}: ${inc.title}`, { a: 'inject', id });
  }

  approveHold(id: string) { return this.run('Approving', { a: 'approveHold', id }); }
  denyHold(id: string) { return this.run('Denying', { a: 'denyHold', id }); }
  approveAsRoleChange(id: string) { return this.run('Approving as a role change', { a: 'approveAsRoleChange', id }); }
  markFalsePositive(id: string) { return this.run('Marking false positive', { a: 'markFalsePositive', id }); }
  confirmCompromise(id: string) { return this.run('Confirming compromise', { a: 'confirmCompromise', id }); }
  ownerReset(agentId: string) { return this.run('Resetting drift', { a: 'ownerReset', agent: agentId }); }
  approveToolVersion(tool: string) { return this.run(`Trusting the new ${tool} definition`, { a: 'approveToolVersion', tool }); }
  announceBatch(agent: string, days: number) { return this.run(`Announcing a ${days}-day batch window`, { a: 'announceBatch', agent, days }); }
}
