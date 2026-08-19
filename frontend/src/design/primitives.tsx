import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import { Icon, type IconName } from './icons';
import { playSound, type SoundName } from './sound';

/* ---------- Button ---------- */
type ButtonTone = 'primary' | 'purple' | 'go' | 'stop' | 'gold' | 'secondary' | 'quiet' | 'dark';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
  sound?: SoundName;
}

export function Button({
  tone = 'primary',
  size = 'md',
  block,
  icon,
  sound,
  className = '',
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${tone}`,
    size === 'lg' ? 'btn--lg' : size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={(event) => {
        if (sound) playSound(sound);
        onClick?.(event);
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 24 : 20} /> : null}
      {children}
    </button>
  );
}

/* ---------- Badge ---------- */
export type BadgeTone = 'done' | 'waiting' | 'late' | 'info' | 'bonus' | 'soon' | 'neutral';

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

/* ---------- Meter ---------- */
export function Meter({
  value,
  max,
  label,
  right,
  tone,
}: {
  value: number;
  max: number;
  label?: string;
  right?: string;
  tone?: 'gold' | 'green';
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      {(label ?? right) && (
        <div className="meter-label">
          <span>{label}</span>
          <span className="numeric">{right}</span>
        </div>
      )}
      <div
        className="meter"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? 'Progress'}
      >
        <div className={`meter__fill ${tone ? `meter__fill--${tone}` : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Circular progress ---------- */
export function Ring({
  value,
  max,
  size = 108,
  stroke = 10,
  label,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset var(--transition-base)' }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--green)" />
          </linearGradient>
        </defs>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Tile ---------- */
export function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="tile">
      <div className="tile__value numeric">{value}</div>
      <div className="tile__label">{label}</div>
    </div>
  );
}

/* ---------- Sheet ---------- */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <h2 className="subtitle">{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
        {footer ? <div style={{ marginTop: 'var(--space-4)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Section header ---------- */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="row row--between">
      <h2 className="subtitle">{title}</h2>
      {action}
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon = 'star',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h3 className="subtitle">{title}</h3>
      <p style={{ margin: 0 }}>{message}</p>
      {action}
    </div>
  );
}

/* ---------- Checklist item ---------- */
export function CheckItem({
  title,
  instruction,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  instruction?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="check"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => {
        playSound(checked ? 'tap' : 'success');
        onToggle();
      }}
    >
      <span className="check__box">{checked ? <Icon name="check" size={16} /> : null}</span>
      <span>
        <span style={{ fontWeight: 700, display: 'block' }}>{title}</span>
        {instruction ? (
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {instruction}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* ---------- Gold points pill ---------- */
export function PointsPill({ value, small }: { value: number | string; small?: boolean }) {
  return (
    <span className={`points-pill ${small ? 'points-pill--sm' : ''}`}>
      <span className="points-pill__coin" aria-hidden="true">
        ★
      </span>
      {typeof value === 'number' ? `${value.toLocaleString('en-US')} pts` : value}
    </span>
  );
}

/* ---------- XP level bar ---------- */
export function LevelBar({
  level,
  into,
  span,
}: {
  level: number;
  into: number;
  span: number | null;
}) {
  const pct = span ? Math.min(100, Math.round((into / span) * 100)) : 100;
  return (
    <div className="levelbar">
      <span className="levelbar__badge">{level}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="numeric"
          style={{ fontSize: 'var(--text-xs)', fontWeight: 800, marginBottom: 3 }}
        >
          {span ? `${into.toLocaleString('en-US')} / ${span.toLocaleString('en-US')} XP` : 'Max level'}
        </div>
        <div
          className="meter"
          style={{ height: 10 }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Level ${level} progress`}
        >
          <div className="meter__fill meter__fill--gold" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
  label: string;
}) {
  return (
    <div className="segment" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          className="segment__item"
          aria-selected={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/* ---------- Colored icon tile ---------- */
export function IconTile({
  name,
  tone = 'blue',
  small,
}: {
  name: IconName;
  tone?: 'blue' | 'purple' | 'green' | 'gold' | 'red' | 'slate';
  small?: boolean;
}) {
  return (
    <span className={`tile-icon tile-icon--${tone} ${small ? 'tile-icon--sm' : ''}`}>
      <Icon name={name} size={small ? 20 : 24} />
    </span>
  );
}

/* ---------- Stat row (parent dashboard) ---------- */
export function StatRow({
  icon,
  tone,
  label,
  value,
  onClick,
}: {
  icon: IconName;
  tone: 'blue' | 'purple' | 'green' | 'gold' | 'red' | 'slate';
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <IconTile name={icon} tone={tone} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="stat-row__label" style={{ display: 'block' }}>
          {label}
        </span>
        <span className="stat-row__value numeric">{value}</span>
      </span>
      {onClick ? <Icon name="chevron" size={18} /> : null}
    </>
  );

  return onClick ? (
    <button type="button" className="stat-row" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat-row">{content}</div>
  );
}
