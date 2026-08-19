import { useState } from 'react';
import { Avatar, BACKGROUNDS, HAIR_COLORS, SHIRT_COLORS, SKIN_TONES, type AvatarConfig } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Button, Meter, PointsPill, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { levelForLifetimePoints } from '../../config/levels';
import { achievements, children, rewards } from '../../mock/data';
import { playSound } from '../../design/sound';

const me = children[0]!;

export function Profile() {
  const [config, setConfig] = useState<AvatarConfig>(me.avatar);
  const [editing, setEditing] = useState(false);
  const level = levelForLifetimePoints(me.lifetimePoints);
  const goal = rewards.find((reward) => reward.primaryGoal);
  const earnedBadges = achievements.filter((badge) => badge.earned);

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    playSound('tap');
    setConfig((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <ScreenTop title="Profile" />
      <main className="screen">
        <section className="panel panel--navy" style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar config={config} size={132} label={`${me.name} avatar`} />
          <h2 className="title" style={{ margin: 0 }}>{me.name}</h2>
          <PointsPill value={`Level ${level.level}`} />
          <div style={{ width: '100%' }}>
            <Meter
              value={level.pointsIntoLevel}
              max={level.levelSpan ?? level.pointsIntoLevel}
              label="Level progress"
              right={level.levelSpan ? `${level.pointsIntoLevel} / ${level.levelSpan}` : 'Max level'}
            />
          </div>
          <Button tone="quiet" block icon="user" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Done editing' : 'Edit avatar'}
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
          <Tile value={me.spendablePoints} label="Spendable points" />
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
          <Tile value={me.approvedChores} label="Chores approved" />
        </div>

        <section style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle">Badges</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {earnedBadges.map((badge) => (
              <span key={badge.id} className="badge badge--bonus">
                <Icon name={badge.icon} size={14} />
                {badge.name}
              </span>
            ))}
          </div>
        </section>

        {goal && (
          <section className="card row" style={{ marginTop: 'var(--space-4)' }}>
            <span className="iconbtn" style={{ color: 'var(--gold)' }}>
              <Icon name={goal.icon} size={22} />
            </span>
            <span style={{ flex: 1 }}>
              <span className="eyebrow">Reward goal</span>
              <strong style={{ display: 'block' }}>{goal.name}</strong>
            </span>
            <PointsPill value={goal.cost} small />
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
