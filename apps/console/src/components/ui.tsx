import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';
import { BAND_LABEL, type Band } from '../data/fixtures';

const BAND_CLASS: Record<Band, string> = {
  ALLOW: 'allow', HOLD: 'hold', DOWN_SCOPE: 'down', QUARANTINE: 'quar', REVOKE: 'revoke',
};
export const bandClass = (b: Band) => BAND_CLASS[b];

// A black-ruled box with "+" crop marks on its four corners.
type FrameProps<T extends ElementType> = { as?: T; className?: string; children?: ReactNode } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;
export function Frame<T extends ElementType = 'div'>({ as, className = '', children, ...rest }: FrameProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={`frame ${className}`} {...rest}>
      <i className="tick tl" aria-hidden /><i className="tick tr" aria-hidden />
      <i className="tick bl" aria-hidden /><i className="tick br" aria-hidden />
      {children}
    </Tag>
  );
}

export function BandChip({ band, prefix }: { band: Band; prefix?: string }) {
  return <span className={`chip chip-${BAND_CLASS[band]}`}>{prefix}{BAND_LABEL[band]}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

const TICKS = [30, 55, 75, 90];

// 0–100 ring coloured by band. `ticks` draws the band edges around a large ring.
export function ScoreRing({ score, band, size = 36, ticks = false }: { score: number; band: Band; size?: number; ticks?: boolean }) {
  const stroke = size >= 64 ? 6 : 3;
  const r = size / 2 - stroke / 2 - (ticks ? 5 : 0);
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg className={`ring ring-${BAND_CLASS[band]}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score}`}>
      <circle cx={mid} cy={mid} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
      <circle
        cx={mid} cy={mid} r={r} className="ring-arc" strokeWidth={stroke} fill="none"
        strokeDasharray={`${(c * score) / 100} ${c}`} transform={`rotate(-90 ${mid} ${mid})`}
      />
      {ticks && TICKS.map(t => {
        const a = (t / 100) * 2 * Math.PI - Math.PI / 2;
        const r1 = r + stroke / 2 + 1, r2 = r1 + 4;
        return <line key={t} x1={mid + r1 * Math.cos(a)} y1={mid + r1 * Math.sin(a)} x2={mid + r2 * Math.cos(a)} y2={mid + r2 * Math.sin(a)} className="ring-tick" />;
      })}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-num" style={{ fontSize: size >= 64 ? size * 0.3 : size * 0.34 }}>
        {score}
      </text>
    </svg>
  );
}

export function Bar({ value, max = 0.6 }: { value: number; max?: number }) {
  return <span className="bar"><span className="bar-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></span>;
}
