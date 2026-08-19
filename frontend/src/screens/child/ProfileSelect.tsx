import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Button } from '../../design/primitives';
import { levelForLifetimePoints } from '../../config/levels';
import { children, parents } from '../../mock/data';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

export function ProfileSelect() {
  useSkyBackground();
  const navigate = useNavigate();

  return (
    <main className="screen screen--sky" style={{ paddingTop: 'var(--space-6)' }}>
      <h1 className="title" style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
        Choose your hero
      </h1>

      <div className="stack">
        {children.map((child) => {
          const level = levelForLifetimePoints(child.lifetimePoints);
          return (
            <button
              key={child.id}
              type="button"
              className="panel panel--purple card--interactive row"
              style={{ gap: 'var(--space-4)' }}
              onClick={() => {
                playSound('tap');
                navigate(`/pin/${child.id}`);
              }}
            >
              <Avatar config={child.avatar} size={84} label={`${child.name} avatar`} />
              <span style={{ flex: 1, textAlign: 'center' }}>
                <span
                  className="logo"
                  style={{ display: 'block', fontSize: 'var(--text-2xl)', color: '#fff', textShadow: 'none' }}
                >
                  {child.name}
                </span>
                <span style={{ display: 'block', fontWeight: 700, marginTop: 4 }}>Level {level.level}</span>
                <span className="numeric" style={{ display: 'block', fontWeight: 700 }}>
                  {child.lifetimePoints.toLocaleString('en-US')} pts
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Button tone="dark" size="lg" block icon="plus" style={{ marginTop: 'var(--space-5)' }}>
        Add profile
      </Button>

      <hr className="divider" style={{ background: 'rgba(255,255,255,0.35)' }} />

      <div className="stack stack--tight">
        {parents.map((parent) => (
          <button
            key={parent.id}
            type="button"
            className="card card--interactive row"
            onClick={() => navigate(`/pin/${parent.id}`)}
          >
            <span className="iconbtn">
              <Icon name="user" size={22} />
            </span>
            <span style={{ fontWeight: 700, flex: 1 }}>{parent.name}</span>
            <span className="badge badge--info">Parent</span>
          </button>
        ))}
      </div>
    </main>
  );
}
