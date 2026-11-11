/** Art from the NEON asset packs, served from public/neon. */
import type { CSSProperties } from 'react';

export type NeonGroup =
  | 'achievements'
  | 'avatars'
  | 'backgrounds'
  | 'brand'
  | 'celebrations'
  | 'icons'
  | 'rewards'
  | 'states'
  | 'ui';

export const neonUrl = (group: NeonGroup, name: string) => `${import.meta.env.BASE_URL}neon/${group}/${name}.svg`;

/** Level 1-9 is tier 1 ... 40-50 is tier 5. */
export const levelTier = (level: number) => `level-tier-${Math.min(5, Math.max(1, Math.floor(level / 10) + 1))}`;

/** Decorative unless `alt` is given. */
export function NeonArt({
  group,
  name,
  size,
  alt = '',
  style,
  className,
}: {
  group: NeonGroup;
  name: string;
  size?: number;
  alt?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <img
      src={neonUrl(group, name)}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', ...style }}
    />
  );
}

/** Unearned badges show their art dimmed, so there is something to chase, with the pack's lock in the corner. */
export function BadgeArt({ code, earned, size }: { code: string; earned: boolean; size: number }) {
  const art = (
    <NeonArt
      group="achievements"
      name={code}
      size={size}
      style={earned ? { filter: 'drop-shadow(0 0 10px rgba(247, 199, 107, 0.35))' } : { filter: 'grayscale(1)', opacity: 0.35 }}
    />
  );
  if (earned) return art;
  const lock = Math.max(18, Math.round(size * 0.42));
  return (
    <span style={{ position: 'relative', display: 'block', width: size, height: size, flexShrink: 0 }}>
      {art}
      <NeonArt
        group="achievements"
        name="badge-locked"
        size={lock}
        style={{
          position: 'absolute',
          right: -lock * 0.12,
          bottom: -lock * 0.08,
          filter: 'drop-shadow(0 0 1px rgba(168, 183, 206, 0.9)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6))',
        }}
      />
    </span>
  );
}

/** Rewards are household-made, so art is picked from the name. */
export function rewardArt(name: string): string {
  const n = name.toLowerCase();
  if (/game|gaming|xbox|playstation|switch|screen|phone|tablet/.test(n)) return 'gaming-time';
  if (/pizza|food|dinner|lunch|treat|snack|ice cream|restaurant|takeout/.test(n)) return 'pizza-night';
  if (/movie|film|cinema|theater|theatre/.test(n)) return 'movie-night';
  if (/skip|pass|day off|free chore/.test(n)) return 'skip-chore';
  if (/\$|cash|money|allowance|dollar|bucks/.test(n)) return 'extra-allowance';
  return 'custom-reward';
}
