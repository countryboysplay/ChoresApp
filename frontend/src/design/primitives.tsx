import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon, type IconName } from './icons';
import { NeonArt } from './neon';

/** Empty-state illustration for each icon the callers already pass. */
const emptyArt: Partial<Record<IconName, string>> = {
  check: 'no-approvals',
  gift: 'no-rewards',
  inbox: 'empty-inbox',
  missions: 'no-chores',
  star: 'no-chores',
  trophy: 'no-badges-yet',
};
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
  name,
  right,
  tone,
}: {
  value: number;
  max: number;
  label?: string;
  /** What the bar measures, for screen readers only (when there is no visible label). */
  name?: string;
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
        aria-label={label ?? name ?? 'Progress'}
      >
        <div className={`meter__fill ${tone ? `meter__fill--${tone}` : ''}`} style={{ width: `${pct}%` }} />
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
  art = emptyArt[icon],
  title,
  message,
  action,
}: {
  icon?: IconName;
  /** A file in public/neon/states; defaults to the art for `icon`. */
  art?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {art ? <NeonArt group="states" name={art} /> : <Icon name={icon} size={36} />}
      <h3 className="subtitle">{title}</h3>
      {message ? <p style={{ margin: 0 }}>{message}</p> : null}
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

/* ---------- Brass guild-points pill ---------- */
export function PointsPill({ value, small }: { value: number | string; small?: boolean }) {
  // Small sits inline on a chore row - just the number, like the board's
  // "+20" style. The full-size pill spells out "coins" - but only for
  // an actual points amount, not an arbitrary string like "Level 7".
  const label =
    typeof value === 'number'
      ? small
        ? value.toLocaleString('en-US')
        : `${value.toLocaleString('en-US')} coins`
      : value;
  return (
    <span className={`points-pill ${small ? 'points-pill--sm' : ''}`}>
      <span className="points-pill__coin" aria-hidden="true">
        ★
      </span>
      {label}
    </span>
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
  // One indicator slides to the chosen tab, so the switch reads as a move, not a swap.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const place = () => {
      const tab = root.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) return;
      root.style.setProperty('--seg-x', `${tab.offsetLeft}px`);
      root.style.setProperty('--seg-w', `${tab.offsetWidth}px`);
    };
    place();
    const frame = requestAnimationFrame(() => root.setAttribute('data-ready', ''));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [value]);

  return (
    <div className="segment" role="tablist" aria-label={label} ref={ref}>
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

/* ---------- List tools: search box and labelled select (parent lists) ---------- */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="toolfield">
      <Icon name="search" size={18} />
      <input
        className="input"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: IconName;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <label className="toolfield">
      <Icon name={icon} size={18} />
      <select className="select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
