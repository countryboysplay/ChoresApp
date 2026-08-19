/**
 * Layered SVG avatar. Renders deterministically from a stored configuration
 * object - no raster upload, no generated images, identical on every device.
 */
export interface AvatarConfig {
  skin: string;
  face: 'round' | 'square' | 'oval';
  hair: 'short' | 'curly' | 'spiky' | 'long' | 'buzz';
  hairColor: string;
  eyes: 'happy' | 'wide' | 'calm' | 'wink';
  shirt: string;
  accessory: 'none' | 'glasses' | 'headband' | 'cap';
  background: string;
}

export const SKIN_TONES = ['#f2c8a2', '#e0a878', '#c1804f', '#8d5524', '#5c3317', '#ffdbb4'];
export const HAIR_COLORS = ['#2b1d14', '#5a3b22', '#a8631f', '#d9b168', '#1f1f2b', '#7c4dff'];
export const SHIRT_COLORS = ['#407cfe', '#7c4dff', '#00c853', '#ffc107', '#ff5252', '#f5f7fa'];
export const BACKGROUNDS = ['#407cfe', '#7c4dff', '#00c853', '#ffc107', '#ff5252', '#252539'];

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: '#e0a878',
  face: 'round',
  hair: 'short',
  hairColor: '#2b1d14',
  eyes: 'happy',
  shirt: '#407cfe',
  accessory: 'none',
  background: '#7c4dff',
};

const FACE_SHAPE: Record<AvatarConfig['face'], string> = {
  round: 'M50 26a22 24 0 1 0 0 48 22 24 0 0 0 0-48Z',
  square: 'M31 34a10 10 0 0 1 10-10h18a10 10 0 0 1 10 10v22a12 12 0 0 1-12 12H43a12 12 0 0 1-12-12Z',
  oval: 'M50 24a20 27 0 1 0 0 54 20 27 0 0 0 0-54Z',
};

const HAIR_SHAPE: Record<AvatarConfig['hair'], string> = {
  short: 'M28 44c0-14 10-22 22-22s22 8 22 22c0-6-4-10-10-11-5 4-19 5-24 1-6 1-10 4-10 10Z',
  buzz: 'M29 43c1-12 10-19 21-19s20 7 21 19c-4-6-12-9-21-9s-17 3-21 9Z',
  curly:
    'M30 42a7 7 0 0 1 3-11 8 8 0 0 1 8-7 9 9 0 0 1 18 0 8 8 0 0 1 8 7 7 7 0 0 1 3 11c-3-8-11-11-20-11s-17 3-20 11Z',
  spiky: 'M28 46 34 28l5 9 5-13 5 12 5-11 5 12 5-8 5 17c-4-9-12-13-22-13s-17 4-19 13Z',
  long: 'M27 46c0-15 10-24 23-24s23 9 23 24v26h-8V44c-3 5-19 6-27 2-2 2-3 5-3 8v18h-8Z',
};

const EYE_SHAPE: Record<AvatarConfig['eyes'], JSX.Element> = {
  happy: (
    <g strokeLinecap="round" strokeWidth={3} stroke="#1e1e2f" fill="none">
      <path d="M40 47c1.5-2.5 4.5-2.5 6 0" />
      <path d="M54 47c1.5-2.5 4.5-2.5 6 0" />
    </g>
  ),
  wide: (
    <g fill="#1e1e2f">
      <circle cx="43" cy="47" r="3.4" />
      <circle cx="57" cy="47" r="3.4" />
    </g>
  ),
  calm: (
    <g strokeLinecap="round" strokeWidth={3} stroke="#1e1e2f">
      <path d="M40 48h6" />
      <path d="M54 48h6" />
    </g>
  ),
  wink: (
    <g strokeLinecap="round" strokeWidth={3} stroke="#1e1e2f" fill="#1e1e2f">
      <circle cx="43" cy="47" r="3.2" stroke="none" />
      <path d="M54 47c1.5-2.5 4.5-2.5 6 0" fill="none" />
    </g>
  ),
};

interface AvatarProps {
  config?: AvatarConfig;
  size?: number;
  label?: string;
}

export function Avatar({ config = DEFAULT_AVATAR, size = 64, label }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', borderRadius: '50%', flexShrink: 0 }}
    >
      {label ? <title>{label}</title> : null}
      <circle cx="50" cy="50" r="50" fill={config.background} />
      <circle cx="50" cy="50" r="44" fill="rgba(0,0,0,0.18)" />

      {/* Shoulders */}
      <path d="M22 100c0-16 12-24 28-24s28 8 28 24Z" fill={config.shirt} />
      <path d="M50 76c-5 0-9 1-12 3l12 9 12-9c-3-2-7-3-12-3Z" fill="rgba(255,255,255,0.22)" />

      {/* Head */}
      <path d={FACE_SHAPE[config.face]} fill={config.skin} />
      <path d={HAIR_SHAPE[config.hair]} fill={config.hairColor} />

      {EYE_SHAPE[config.eyes]}
      <path d="M45 58c3 2.5 7 2.5 10 0" stroke="#1e1e2f" strokeWidth={3} strokeLinecap="round" fill="none" />

      {config.accessory === 'glasses' && (
        <g stroke="#1e1e2f" strokeWidth={2.5} fill="rgba(255,255,255,0.24)">
          <rect x="36" y="42" width="13" height="10" rx="5" />
          <rect x="51" y="42" width="13" height="10" rx="5" />
          <path d="M49 47h2" />
        </g>
      )}
      {config.accessory === 'headband' && (
        <path d="M29 42c6-4 36-4 42 0v5c-6-4-36-4-42 0Z" fill="var(--red)" />
      )}
      {config.accessory === 'cap' && (
        <g>
          <path d="M28 42c0-13 10-20 22-20s22 7 22 20Z" fill="var(--red)" />
          <path d="M28 42h34c8 0 12 3 13 6H28Z" fill="#c62828" />
        </g>
      )}
    </svg>
  );
}
