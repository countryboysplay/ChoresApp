import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '../design/icons';

/** Sticky screen header with an optional back action and trailing slot. */
export function ScreenTop({
  title,
  back,
  trailing,
}: {
  title: string;
  back?: string | number;
  trailing?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      {back !== undefined && (
        <button
          type="button"
          className="iconbtn"
          aria-label="Go back"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <Icon name="chevron" size={20} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}
      <h1 className="subtitle" style={{ flex: 1, margin: 0 }}>
        {title}
      </h1>
      {trailing}
    </header>
  );
}
