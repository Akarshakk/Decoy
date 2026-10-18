import { useEffect, useState } from 'react';
import type { LedgerRecord } from '@swaroop/engine';
import { Frame } from '../components/ui';
import { fmtDateTime } from '../live/labels';
import { useLive } from '../live/react';
import { tamperCheck } from '../live/view';

function summary(r: LedgerRecord) {
  const p = r.payload;
  switch (r.type) {
    case 'decision': return `${p.id} ${p.tool} · ${p.agent} · ${p.score} ${String(p.band)}${p.executed ? '' : ' · not run'}`;
    case 'token_reissue': return `${p.agent} ${p.target === 'delegated_session' ? `delegated session ${p.session}` : 'token'} ${p.kind} v${p.from} → v${p.to}${(p.removed as string[] | undefined)?.length ? ` · −${(p.removed as string[]).length} scopes` : ''}`;
    case 'hold_resolved': return `${p.id} ${p.outcome}`;
    case 'role_change': return `${p.agent} charter v${p.from} → v${p.to} · + ${(p.added as string[]).join(', ')}`;
    case 'drift_alarm': return `${p.agent} drift ${p.S} crossed H · snapshot ${p.snapshot}`;
    case 'fp_review': return `${p.decision} marked false positive${p.proposedAddTool ? ` · proposes adding ${p.proposedAddTool}` : ''}`;
    case 'compromise_confirmed': return `${p.agent} revoked after ${p.decision}`;
    case 'owner_reset': return `${p.agent} drift reset by owner`;
  }
}

export function Ledger() {
  const { engine, version, ledger } = useLive();
  const records = engine?.ledgerRecords() ?? [];
  const [target, setTarget] = useState(0);
  const [tamper, setTamper] = useState<{ seq: number; brokenAt: number | null } | null>(null);
  useEffect(() => { setTamper(null); }, [version]);

  const runTamper = async () => {
    if (!engine) return;
    setTamper({ seq: target, brokenAt: await tamperCheck(engine, target) });
  };

  return (
    <div className="main-col">
      <header className="topbar">
        <p className="crumb"><b>Ledger</b> <span className="muted">{records.length} records</span></p>
        <div className="topbar-actions">
          <span className={`pill-status ${ledger.ok === false ? 'is-bad' : ''}`}>
            {ledger.ok === null ? 'Verifying…' : ledger.ok ? `✓ Chain verified, ${ledger.count} records` : `✕ Chain breaks at #${ledger.brokenAt}`}
          </span>
        </div>
      </header>

      <section className="canvas" aria-label="Ledger records">
        <div className="page">
          <Frame className="card card-wide">
            <h2 className="card-h">How it is verified</h2>
            <p className="small">Each record's hash is SHA-256 of the previous hash plus the record. The browser re-derives every hash from the first record after each change, so editing any record breaks every hash after it. IBANs and email addresses are masked before hashing.</p>
            <div className="tamper">
              <label className="small">
                Edit a copy of record
                <select value={target} onChange={e => { setTarget(Number(e.target.value)); setTamper(null); }}>
                  {records.map(r => <option key={r.seq} value={r.seq}>#{r.seq} {r.type}</option>)}
                </select>
              </label>
              <button className="btn btn-line" onClick={runTamper} disabled={!records.length}>Tamper with the copy and verify</button>
              {tamper && (
                <p className="small tamper-out">
                  {tamper.brokenAt === null ? 'The copy still verifies.' : <>The copy fails verification at <b>#{tamper.brokenAt}</b>. The real chain above is unchanged{ledger.ok ? ' and still verifies' : ''}.</>}
                </p>
              )}
            </div>
          </Frame>

          <Frame className="table-frame">
            <table className="fleet ledger">
              <thead>
                <tr><th scope="col" className="r">#</th><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Record</th><th scope="col">Hash</th></tr>
              </thead>
              <tbody>
                {[...records].reverse().map(r => (
                  <tr key={r.seq} className={ledger.brokenAt !== null && r.seq >= ledger.brokenAt ? 'is-broken' : ''}>
                    <td className="num r">{r.seq}</td>
                    <td className="small nowrap">{fmtDateTime(r.ts)}</td>
                    <td><span className="tag">{r.type}</span></td>
                    <td className="mono small">{summary(r)}</td>
                    <td className="mono small muted nowrap" title={`prev ${r.prevHash}\nhash ${r.hash}`}>{r.prevHash.slice(0, 6)} → <b>{r.hash.slice(0, 6)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        </div>
      </section>
    </div>
  );
}
