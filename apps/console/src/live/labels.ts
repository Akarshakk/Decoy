// Display words for engine values. Thresholds come from the engine's own BANDS table.
import { BANDS, FACTOR_LABEL, type AgentState, type Band } from '@swaroop/engine';
import type { AlertStatus, Cause } from './view';

export const BAND_LABEL: Record<Band, string> = {
  ALLOW: 'Allow', HOLD: 'Hold', DOWN_SCOPE: 'Down-scope', QUARANTINE: 'Quarantine', REVOKE: 'Revoke',
};

/** Lower edge of every band above Allow, ascending: [30, HOLD], [55, DOWN_SCOPE], … */
export const BAND_EDGES = [...BANDS].reverse().filter(([t]) => t > 0) as [number, Band][];

export const CAUSE_LABEL: Record<Cause, string> = { ...FACTOR_LABEL, TRIPWIRE: 'tripwire', credentials: 'credentials' };

export const STATE_LABEL: Record<AgentState, string> = {
  active: 'Active', watch: 'Watch', scoped_down: 'Scoped down', quarantined: 'Quarantined', revoked: 'Revoked',
};
export const STATE_BAND: Record<AgentState, Band> = {
  active: 'ALLOW', watch: 'HOLD', scoped_down: 'DOWN_SCOPE', quarantined: 'QUARANTINE', revoked: 'REVOKE',
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  held: 'waiting for owner', approved: 'approved, ran', denied: 'denied', role_change: 'approved as role change',
  shadow: 'shadow: would have', blocked: 'blocked', ran: 'ran',
};

const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const fmtTime = (ms: number) => TIME.format(ms);
export const fmtDateTime = (ms: number) => `${DATE.format(ms)}, ${TIME.format(ms)} UTC`;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
