import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';
import { children, parents } from '../../mock/data';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
const PIN_LENGTH = 4;

export function PinEntry() {
  useSkyBackground();
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');

  const child = children.find((entry) => entry.id === userId);
  const parent = parents.find((entry) => entry.id === userId);
  const isParent = Boolean(parent);
  const name = child?.name ?? parent?.name ?? 'Player';

  const press = (key: string) => {
    if (!key) return;
    playSound('tap');
    if (key === 'back') return setPin((value) => value.slice(0, -1));
    if (pin.length >= PIN_LENGTH) return;

    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Stage 4 replaces this with a server-side PIN check and rate limiting.
      window.setTimeout(() => navigate(isParent ? '/parent' : '/child/home'), 220);
    }
  };

  return (
    <main className="screen screen--sky" style={{ paddingTop: 'var(--space-6)', maxWidth: 400 }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}>
        {child ? (
          <Avatar config={child.avatar} size={76} label={`${name} avatar`} />
        ) : (
          <span className="iconbtn" style={{ width: 76, height: 76 }}>
            <Icon name="user" size={32} />
          </span>
        )}
        <h1 className="title" style={{ fontSize: 'var(--text-xl)' }}>
          Enter your PIN
        </h1>

        <div className="row" style={{ gap: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <span
              key={index}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.85)',
                background: index < pin.length ? '#fff' : 'transparent',
                transition: 'background var(--transition-fast)',
              }}
            />
          ))}
        </div>
        <p className="visually-hidden" aria-live="polite">{`${pin.length} of ${PIN_LENGTH} digits entered`}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
        {KEYS.map((key, index) =>
          key ? (
            <button
              key={key}
              type="button"
              className="btn btn--dark"
              style={{ minHeight: 62, fontSize: 'var(--text-xl)', borderRadius: 'var(--radius-md)' }}
              onClick={() => press(key)}
              aria-label={key === 'back' ? 'Delete last digit' : key}
            >
              {key === 'back' ? <Icon name="close" size={20} /> : key}
            </button>
          ) : (
            <span key={`gap-${index}`} />
          ),
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          style={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }}
          onClick={() => navigate('/profiles')}
        >
          Forgot PIN?
        </button>
      </div>
    </main>
  );
}
