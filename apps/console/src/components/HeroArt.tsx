import type { ReactNode } from 'react';

// Hero illustration: "stays in its lane". The lane is procurement-01's role; its usual stops sit on it.
// After the poisoned supplier PDF the path leaves the lane, and Swaroop scores each off-lane step (D2: 69, then 72).
// The in-role price lookup at the end of the lane still runs.

const LANE_Y = 372;
const TILE = 68;

function Tile({ x, label, children, tint }: { x: number; label: string; children: ReactNode; tint?: boolean }) {
  return (
    <g>
      <rect x={x - TILE / 2} y={LANE_Y - TILE / 2} width={TILE} height={TILE} rx={16} className={`ink ${tint ? 'fill-paper' : 'fill-white'}`} />
      {children}
      <text x={x} y={LANE_Y + 64} textAnchor="middle" className="art-label">{label}</text>
    </g>
  );
}

function Badge({ x, y, score, band, label, side }: { x: number; y: number; score: number; band: 'down' | 'quar'; label: string; side: 'left' | 'right' }) {
  return (
    <g>
      <circle cx={x} cy={y} r={21} className={`ink fill-${band}`} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="art-mono art-num">{score}</text>
      <text x={side === 'left' ? x - 30 : x + 30} y={y} dominantBaseline="central" textAnchor={side === 'left' ? 'end' : 'start'} className="art-mono art-tiny">{label}</text>
    </g>
  );
}

const OFF_1 = 'M 296 338 C 296 272, 290 222, 322 222';
const OFF_2 = 'M 492 222 C 524 222, 520 160, 520 116';

export function HeroArt() {
  return (
    <figure className="ring-art">
      <svg className="art" viewBox="0 20 630 432" role="img"
        aria-label="procurement-01 travels its role lane: vendors, invoices, a supplier PDF. After the PDF its path leaves the lane to salaries, scored 69 and down-scoped, then to acme-verify.co, scored 72 and quarantined. The price lookup back on the lane still runs.">

        {/* the lane = the role */}
        <rect x="8" y={LANE_Y - 42} width="596" height="84" rx="42" className="ink fill-lane" />
        <path d={`M 30 ${LANE_Y} H 506`} className="trace trace-draw" pathLength={1} />
        <path className="check" d={`M 410 ${LANE_Y - 2} l8 8 15 -17`} />

        {/* the token rides in */}
        <g className="art-in">
          <rect x="24" y="40" width="172" height="80" rx="14" className="ink fill-white" />
          <rect x="38" y="56" width="34" height="48" rx="6" className="ink fill-paper" />
          <circle cx="55" cy="72" r="7" className="ink" />
          <path className="ink" d="M44 96c2-9 20-9 22 0" />
          <text x="86" y="74" className="art-label art-strong">token</text>
          <text x="86" y="96" className="art-mono art-tiny">signature ok</text>
          <circle cx="192" cy="44" r="14" className="ink fill-white" />
          <path className="check" d="M185.5 44l4.5 4.5 8.5-9.5" />
        </g>
        <path className="ink dash" d={`M 72 120 V ${LANE_Y - TILE / 2}`} />

        {/* usual stops on the lane */}
        <g className="art-in" style={{ animationDelay: '80ms' }}>
          <Tile x={72} label="vendors">
            <ellipse cx="72" cy="358" rx="16" ry="6" className="ink fill-paper" />
            <path className="ink fill-paper" d="M56 358v25c0 3.3 7.2 6 16 6s16-2.7 16-6v-25" />
            <path className="ink" d="M56 370.5c0 3.3 7.2 6 16 6s16-2.7 16-6" />
          </Tile>
        </g>
        <g className="art-in" style={{ animationDelay: '160ms' }}>
          <Tile x={184} label="invoices">
            <rect x="176" y="349" width="24" height="31" rx="3" className="ink fill-paper" />
            <rect x="168" y="357" width="24" height="31" rx="3" className="ink fill-white" />
            <path className="ink" d="M174 367h12 M174 373h12 M174 379h8" />
          </Tile>
        </g>
        <g className="art-in" style={{ animationDelay: '240ms' }}>
          <Tile x={296} label="supplier PDF" tint>
            <path className="ink fill-white" d="M282 351h19l10 10v29h-29z" />
            <path className="ink" d="M301 351v10h10 M288 363h11 M288 369h16" />
            <rect x="286" y="376" width="21" height="8" rx="4" className="ink fill-mark" />
          </Tile>
        </g>
        <g className="art-in" style={{ animationDelay: '320ms' }}>
          <Tile x={540} label="price list">
            <path className="ink fill-paper" d="M522 372l11-12h24v24h-24z" />
            <circle cx="534" cy="372" r="3.2" className="ink fill-white" />
            <path className="ink" d="M541 368h10 M541 376h7" />
          </Tile>
        </g>

        {/* leaving the lane, tainted by the PDF */}
        <path d={OFF_1} className="trace-marker trace-late" />
        <path d={OFF_1} className="trace trace-taint trace-late" />
        <path d={OFF_2} className="trace-marker trace-late" />
        <path d={OFF_2} className="trace trace-taint trace-late" />

        <g className="art-in" style={{ animationDelay: '900ms' }}>
          <rect x="322" y="184" width="170" height="76" rx="14" className="ink fill-white" />
          <rect x="338" y="198" width="34" height="48" rx="6" className="ink fill-paper" />
          <circle cx="355" cy="214" r="7" className="ink" />
          <path className="ink" d="M344 238c2-9 20-9 22 0" />
          <text x="386" y="216" className="art-label art-strong">salaries</text>
          <text x="386" y="238" className="art-mono art-tiny">hr.read_salary</text>
        </g>
        <g className="art-in" style={{ animationDelay: '1150ms' }}>
          <rect x="432" y="36" width="172" height="80" rx="14" className="ink fill-white" />
          <circle cx="466" cy="76" r="18" className="ink fill-paper" />
          <path className="ink" d="M448 76h36 M466 58c-7.5 9.5-7.5 26.5 0 36 M466 58c7.5 9.5 7.5 26.5 0 36" />
          <text x="494" y="70" className="art-label art-strong">acme-verify.co</text>
          <text x="494" y="92" className="art-mono art-tiny">http.post</text>
        </g>

        <g className="art-pop" style={{ animationDelay: '1300ms' }}>
          <Badge x={297} y={262} score={69} band="down" label="down-scope" side="left" />
        </g>
        <g className="art-pop" style={{ animationDelay: '1500ms' }}>
          <Badge x={518} y={186} score={72} band="quar" label="quarantine" side="right" />
        </g>
      </svg>
      <figcaption className="ring-cap">
        <span className="mono">procurement-01</span> stays in its lane until the <mark className="mark">supplier PDF</mark>.
        Every step off the lane gets a score. The price lookup still runs.
      </figcaption>
    </figure>
  );
}
