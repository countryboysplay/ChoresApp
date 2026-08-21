import { useCallback, useEffect, useState } from 'react';
import type { ChildProfileResponse } from '@chore-quest/shared';
import { Avatar, BACKGROUNDS, DEFAULT_AVATAR, HAIR_COLORS, SHIRT_COLORS, SKIN_TONES, type AvatarConfig } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Button, Meter, PointsPill, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { InstallPrompt } from '../../components/InstallPrompt';
import { levelForLifetimePoints } from '../../config/levels';
import { api, ApiRequestError } from '../../lib/api';
import { playSound } from '../../design/sound';

/**
 * A child's own screen.
 *
 * Every number here read mock/data.ts until now, which meant both brothers
 * opened it and saw the same stranger's name, level and streak. It reads the
 * signed-in child, and the avatar builder - which has always worked and has
 * never saved - now writes what it builds.
 */
export function Profile() {
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

        <section className="panel panel--navy" style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar config={config} size={132} label={`${me.displayName} avatar`} />
          <h2 className="title" style={{ margin: 0 }}>{me.displayName}</h2>
          <PointsPill value={`Level ${level.level}`} />
          <div style={{ width: '100%' }}>
            <Meter
              value={level.pointsIntoLevel}
              max={level.levelSpan ?? level.pointsIntoLevel}
              label="Level progress"
              right={level.levelSpan ? `${level.pointsIntoLevel} / ${level.levelSpan}` : 'Max level'}
            />
          </div>
          <Button
            tone="quiet"
            block
            icon="user"
            disabled={saving}
            onClick={() => (editing ? void stopEditing() : setEditing(true))}
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
          </section>
        )}

        <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
          <Tile value={profile.spendablePoints} label="Spendable points" />
          <Tile value={me.lifetimePoints} label="Lifetime points" />
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
