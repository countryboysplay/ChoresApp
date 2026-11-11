import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChildProfileResponse } from '@chore-quest/shared';
import {
  Avatar,
  BACKGROUNDS,
  BANNERS,
  DEFAULT_AVATAR,
  FRAMES,
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type AvatarConfig,
} from '../../design/Avatar';
import { BadgeArt, levelTier, NeonArt } from '../../design/neon';
import { Icon, type IconName } from '../../design/icons';
import { Button, Meter, PointsPill, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { InstallPrompt } from '../../components/InstallPrompt';
import { levelForLifetimePoints, rankForLevel } from '../../config/levels';
import { api, ApiRequestError } from '../../lib/api';
import { playSound } from '../../design/sound';
import '../../design/neon-polish.css';

/** Level milestone badges in the pack; legend is max level. */
const MILESTONES = [
  { code: 'level-5', level: 5, label: 'Level 5' },
  { code: 'level-10', level: 10, label: 'Level 10' },
  { code: 'level-20', level: 20, label: 'Level 20' },
  { code: 'legend', level: 50, label: 'Legend' },
];

/**
 * A child's own screen.
 *
 * Every number here read mock/data.ts until now, which meant both brothers
 * opened it and saw the same stranger's name, level and streak. It reads the
 * signed-in child, and the avatar builder - which has always worked and has
 * never saved - now writes what it builds.
 */
export function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ChildProfileResponse | null>(null);
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.standings.profile();
      setProfile(response);
      setConfig((response.me.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load your profile.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    playSound('tap');
    setConfig((current) => ({ ...current, [key]: value }));
  };

  /**
   * Saved on closing the builder rather than on every swatch. A tap is a child
   * trying a colour on, not deciding, and a request per tap would be a hundred
   * writes to settle on one hero.
   */
  const stopEditing = async () => {
    setEditing(false);
    setSaving(true);
    try {
      await api.standings.saveAvatar(config);
      setError(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <>
        <ScreenTop title="Profile" />
        <main className="screen">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            {error ?? 'Loading...'}
          </p>
        </main>
      </>
    );
  }

  const me = profile.me;
  const level = levelForLifetimePoints(me.lifetimePoints);
  const rank = rankForLevel(level.level);
  const toggleEditing = () => (editing ? void stopEditing() : setEditing(true));
  const menu: { label: string; icon: IconName; onClick: () => void }[] = [
    { label: 'Notifications', icon: 'bell', onClick: () => navigate('/child/notifications') },
    { label: 'Wallet', icon: 'wallet', onClick: () => navigate('/child/wallet') },
    { label: 'Achievements', icon: 'achievements', onClick: () => navigate('/child/achievements') },
    { label: 'Switch player', icon: 'logout', onClick: () => navigate('/profiles') },
  ];
  const goal = profile.primaryGoal;

  return (
    <>
      <ScreenTop title="Profile" />
      <main className="screen">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <InstallPrompt />
        </div>

        <section
          className="panel panel--navy id-banner"
          style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)', paddingTop: 'var(--space-6)' }}
        >
          <NeonArt group="avatars" name={config.banner ?? 'banner-nebula'} className="id-banner__art id-hero__art" />
          <Avatar config={config} size={132} label={`${me.displayName} avatar`} />
          <h2 className="title" style={{ margin: 0 }}>{me.displayName}</h2>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <NeonArt group="achievements" name={levelTier(level.level)} size={36} alt={`${rank} rank emblem`} />
            <PointsPill value={`Level ${level.level}`} />
            <span className="polish-rank">{rank} rank</span>
          </span>
          <div style={{ width: '100%' }}>
            <Meter
              value={level.pointsIntoLevel}
              max={level.levelSpan ?? level.pointsIntoLevel}
              label="Level progress"
              right={level.levelSpan ? `${level.pointsIntoLevel} / ${level.levelSpan}` : 'Max level'}
            />
          </div>
          <ul className="id-milestones" aria-label="Level milestones" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {MILESTONES.map((milestone) => {
              const earned = level.level >= milestone.level;
              return (
                <li key={milestone.code} className={`id-milestone ${earned ? '' : 'is-locked'}`}>
                  <BadgeArt code={milestone.code} earned={earned} size={52} />
                  <span>{milestone.label}</span>
                  <span className="row" style={{ gap: 2 }}>
                    {earned ? <Icon name="check" size={12} /> : <Icon name="lock" size={12} />}
                    {earned ? 'Earned' : 'Locked'}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button
            tone="quiet"
            block
            icon="user"
            disabled={saving}
            onClick={toggleEditing}
          >
            {saving ? 'Saving...' : editing ? 'Done editing' : 'Edit avatar'}
          </Button>
        </section>

        {editing && (
          <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
            <h2 className="subtitle">Avatar builder</h2>
            <Swatches label="Skin" colors={SKIN_TONES} value={config.skin} onPick={(value) => set('skin', value)} />
            <Options
              label="Face"
              options={['round', 'square', 'oval'] as const}
              value={config.face}
              onPick={(value) => set('face', value)}
            />
            <Options
              label="Hair"
              options={['short', 'buzz', 'curly', 'spiky', 'long'] as const}
              value={config.hair}
              onPick={(value) => set('hair', value)}
            />
            <Swatches label="Hair color" colors={HAIR_COLORS} value={config.hairColor} onPick={(value) => set('hairColor', value)} />
            <Options
              label="Eyes"
              options={['happy', 'wide', 'calm', 'wink'] as const}
              value={config.eyes}
              onPick={(value) => set('eyes', value)}
            />
            <Swatches label="Shirt" colors={SHIRT_COLORS} value={config.shirt} onPick={(value) => set('shirt', value)} />
            <Options
              label="Accessory"
              options={['none', 'glasses', 'headband', 'cap'] as const}
              value={config.accessory}
              onPick={(value) => set('accessory', value)}
            />
            <Swatches label="Background" colors={BACKGROUNDS} value={config.background} onPick={(value) => set('background', value)} />
            <Unlockables
              label="Frame"
              items={FRAMES}
              level={level.level}
              value={config.frame ?? 'frame-basic'}
              onPick={(value) => set('frame', value)}
              art={(name) => <NeonArt group="avatars" name={name} size={48} className="id-option__art" />}
            />
            <Unlockables
              label="Banner"
              wide
              items={BANNERS}
              level={level.level}
              value={config.banner ?? 'banner-nebula'}
              onPick={(value) => set('banner', value)}
              art={(name) => <NeonArt group="avatars" name={name} className="id-option__art id-option__banner" />}
            />
          </section>
        )}

        <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
          <Tile value={profile.spendablePoints} label="Coins" />
          <Tile value={me.lifetimePoints} label="Total XP" />
          <Tile
            value={
              <span className="row" style={{ justifyContent: 'center', gap: 4 }}>
                <Icon name="flame" size={18} />
                {me.streakDays}
              </span>
            }
            label="Day streak"
          />
          <Tile value={me.choresApproved} label="Chores approved" />
        </div>

        {goal && (
          <section className="card row" style={{ marginTop: 'var(--space-4)' }}>
            <span className="iconbtn" style={{ color: 'var(--gold)' }}>
              <Icon name="star" size={22} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="eyebrow">Reward goal</span>
              <strong style={{ display: 'block' }}>{goal.name}</strong>
            </span>
            <PointsPill value={goal.pointCost} small />
          </section>
        )}

        <nav aria-label="Profile shortcuts" className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          {menu.map((item) => (
            <button key={item.label} type="button" className="card card--interactive row" onClick={item.onClick}>
              <span className="tile-icon tile-icon--sm tile-icon--blue">
                <Icon name={item.icon} size={20} />
              </span>
              <span style={{ fontWeight: 700, flex: 1, textAlign: 'left' }}>{item.label}</span>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </nav>
      </main>
    </>
  );
}

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            aria-pressed={value === color}
            onClick={() => onPick(color)}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: color,
              border: value === color ? '3px solid var(--gold)' : '2px solid var(--outline)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onPick: (option: T) => void;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="chip-row">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            aria-pressed={value === option}
            onClick={() => onPick(option)}
            style={{ textTransform: 'capitalize' }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Frames and banners: every one is shown, locked ones dimmed with the level that unlocks them. */
function Unlockables<T extends string>({
  label,
  items,
  level,
  value,
  onPick,
  art,
  wide,
}: {
  label: string;
  items: { name: T; label: string; level: number }[];
  level: number;
  value: T;
  onPick: (name: T) => void;
  art: (name: T) => JSX.Element;
  wide?: boolean;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={`id-picker ${wide ? 'id-picker--wide' : ''}`}>
        {items.map((item) => {
          const locked = level < item.level;
          return (
            <button
              key={item.name}
              type="button"
              className="id-option"
              aria-pressed={value === item.name}
              aria-label={locked ? `${item.label} ${label.toLowerCase()}, locked until level ${item.level}` : `${item.label} ${label.toLowerCase()}`}
              disabled={locked}
              onClick={() => onPick(item.name)}
            >
              {art(item.name)}
              {locked ? (
                <span className="id-option__lock">
                  <Icon name="lock" size={12} />
                  Level {item.level}
                </span>
              ) : (
                <span>{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
