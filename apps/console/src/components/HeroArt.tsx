// Hero illustration: the D2 story as line art. A poisoned PDF reaches procurement-01; every call passes
// through Swaroop's response ladder; the in-role read is allowed, the salary read is down-scoped, the upload is stopped.
export function HeroArt() {
  return (
    <svg className="art" viewBox="0 0 640 540" role="img"
      aria-label="A poisoned supplier PDF reaches the procurement agent. Swaroop allows erp.get_vendor, down-scopes hr.read_salary and quarantines http.post to acme-verify.co.">
      {/* document */}
      <g className="art-in" style={{ animationDelay: '0ms' }}>
        <path className="ink fill-paper" d="M48 30h120l40 40v150H48z" />
        <path className="ink" d="M168 30v40h40" />
        <path className="ink" d="M72 82h86 M72 106h106 M72 130h70" />
        <rect className="ink fill-mark" x="68" y="156" width="118" height="26" rx="13" />
        <path className="ink dash" d="M82 169h90" />
        <text className="art-label" x="48" y="244">inv-204511.pdf</text>
      </g>

      {/* agent window */}
      <path className="ink dash wire" d="M128 254v38" />
      <g className="art-in" style={{ animationDelay: '120ms' }}>
        <rect className="ink fill-white" x="20" y="292" width="228" height="176" rx="14" />
        <path className="ink" d="M20 326h228" />
        <circle className="ink" cx="42" cy="309" r="5" /><circle className="ink" cx="60" cy="309" r="5" /><circle className="ink" cx="78" cy="309" r="5" />
        <text className="art-mono" x="44" y="362">procurement-01</text>
        <path className="ink" d="M44 386h150 M44 410h176 M44 434h110" />
      </g>

      {/* agent → gateway */}
      <path className="ink wire" d="M248 380 C 282 380, 282 300, 318 300" />

      {/* gateway: the five-band response ladder */}
      <g className="art-in" style={{ animationDelay: '220ms' }}>
        <rect className="ink fill-white" x="318" y="96" width="88" height="388" rx="44" />
        <text className="art-label" x="362" y="80" textAnchor="middle">Swaroop</text>
        {[
          { y: 140, c: 'slot-allow' },
          { y: 196, c: 'slot-hold' },
          { y: 252, c: 'slot-down is-lit' },
          { y: 308, c: 'slot-quar' },
          { y: 364, c: 'slot-revoke' },
        ].map(s => <rect key={s.y} className={`ink slot ${s.c}`} x="336" y={s.y} width="52" height="30" rx="15" />)}
        <text className="art-mono art-score" x="362" y="440" textAnchor="middle">69</text>
      </g>

      {/* gateway → tools */}
      <path className="ink wire" d="M406 158 C 446 158, 446 92, 486 92" />
      <path className="ink dash wire" d="M406 268 C 446 268, 446 262, 486 262" />
      <path className="ink dash wire" d="M406 330 C 446 330, 446 432, 486 432" />

      {/* verdict marks on the wires */}
      <path className="check" d="M432 108l8 8 16-18" />
      <g className="art-pop" style={{ animationDelay: '900ms' }}>
        <circle className="ink fill-down" cx="446" cy="266" r="13" /><path className="ink thick" d="M439 266h14" />
      </g>
      <g className="art-pop" style={{ animationDelay: '1100ms' }}>
        <circle className="ink fill-quar" cx="446" cy="384" r="13" /><path className="ink thick" d="M439 384h14" />
      </g>

      {/* tool cards */}
      <g className="art-in" style={{ animationDelay: '320ms' }}>
        <rect className="ink fill-white" x="486" y="44" width="138" height="96" rx="14" />
        <ellipse className="ink fill-paper" cx="522" cy="76" rx="18" ry="7" />
        <path className="ink fill-paper" d="M504 76v26c0 4 8 7 18 7s18-3 18-7V76" />
        <path className="ink" d="M504 89c0 4 8 7 18 7s18-3 18-7" />
        <path className="ink" d="M556 78h50 M556 96h34" />
        <text className="art-mono art-small" x="502" y="130">erp.get_vendor</text>
      </g>
      <g className="art-in" style={{ animationDelay: '400ms' }}>
        <rect className="ink fill-white" x="486" y="214" width="138" height="96" rx="14" />
        <rect className="ink fill-paper" x="504" y="232" width="40" height="44" rx="6" />
        <circle className="ink" cx="524" cy="248" r="7" /><path className="ink" d="M512 270c2-8 22-8 24 0" />
        <path className="ink" d="M556 246h50 M556 264h34" />
        <text className="art-mono art-small" x="502" y="300">hr.read_salary</text>
      </g>
      <g className="art-in" style={{ animationDelay: '480ms' }}>
        <rect className="ink fill-white" x="486" y="384" width="138" height="96" rx="14" />
        <circle className="ink fill-paper" cx="524" cy="424" r="20" />
        <path className="ink" d="M504 424h40 M524 404c-8 10-8 30 0 40 M524 404c8 10 8 30 0 40" />
        <path className="ink" d="M556 416h50 M556 434h34" />
        <text className="art-mono art-small" x="502" y="470">http.post</text>
      </g>
    </svg>
  );
}
