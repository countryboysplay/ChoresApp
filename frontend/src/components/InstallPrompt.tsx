import { useEffect, useState } from 'react';
import { Icon } from '../design/icons';
import { Button } from '../design/primitives';

/**
 * "Add Chore Quest to your home screen."
 *
 * Chrome fires `beforeinstallprompt` when it decides a site is installable and
 * lets the page hold onto it and ask later. That is worth doing rather than
 * leaving people to find the browser menu: on a kid's phone the difference
 * between an icon on the home screen and a bookmark in a browser is the
 * difference between an app they open and one they forget.
 *
 * The event only fires when the browser is satisfied - a manifest, icons, a
 * service worker with a fetch handler, https - and never at all on iOS, where
 * Add to Home Screen is a Safari menu item and no API exists to trigger it. So
 * this renders nothing most of the time, by design, and never explains its own
 * absence: a permanent "you cannot install this" notice on every desktop would
 * be noise on the one screen a parent uses daily.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      // Chrome shows its own mini-infobar unless this is called, and two
      // competing prompts is worse than one placed where it makes sense.
      raw.preventDefault();
      setEvent(raw as InstallEvent);
    };
    // Once installed the event never fires again, so this also clears the card
    // for anyone who accepted from the browser's own menu instead.
    const onInstalled = () => setEvent(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!event) return null;

  const install = async () => {
    setBusy(true);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // Nothing to say. The browser dialog either appeared or it did not.
    } finally {
      // Cleared either way: the event is single-use, and a button that silently
      // stops working is worse than one that goes away.
      setEvent(null);
      setBusy(false);
    }
  };

  return (
    <section className="card stack stack--tight">
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Icon name="star" size={18} style={{ color: 'var(--gold)' }} />
        <strong>Add to your home screen</strong>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        Opens straight into Chore Quest, without the browser around it.
      </p>
      <Button tone="primary" block disabled={busy} onClick={() => void install()}>
        Add Chore Quest
      </Button>
    </section>
  );
}
