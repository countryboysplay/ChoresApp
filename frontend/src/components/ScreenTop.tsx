import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '../design/icons';
import DecryptedText from '../design/DecryptedText';

const ARCADE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&';

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
  // Kid titles decode in like an arcade readout; parent titles stay plain.
  const kid = useLocation().pathname.startsWith('/child');

  return (
    <header className="topbar">
      {back !== undefined && (
        <button
          type="button"
          className="iconbtn"
          aria-label="Go back"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <Icon name="back" size={20} />
        </button>
      )}
      <h1 className="subtitle" style={{ flex: 1, margin: 0 }}>
        {kid ? (
          <DecryptedText text={title} animateOn="view" sequential speed={28} characters={ARCADE_GLYPHS} />
        ) : (
          title
        )}
      </h1>
      {trailing}
    </header>
  );
}
