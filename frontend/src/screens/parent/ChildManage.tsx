import { useCallback, useEffect, useState } from 'react';
import type { HouseholdMember } from '@chore-quest/shared';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

/**
 * Who is in the household.
 *
 * Children are managed here; parents are listed but not editable. Adding a
 * parent, changing another parent's PIN, or deactivating one stays a terminal
 * job on the laptop, so nothing in this screen can lock a parent out of their
 * own household.
 */
export function ChildManage() {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinFor, setPinFor] = useState<HouseholdMember | null>(null);
  const [pinValue, setPinValue] = useState('');

  const load = useCallback(async () => {
    try {
      setMembers((await api.household.members()).members);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the household.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addChild = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.household.addChild({
        displayName: newName.trim(),
        ...(newPin ? { pin: newPin } : {}),
      });
      setAdding(false);
      setNewName('');
      setNewPin('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  const savePin = async () => {
    if (!pinFor) return;
    setWorking(true);
    setError(null);
    try {
      const result = await api.household.setPin(pinFor.id, pinValue);
      setNotice(
        result.signedOutDevices > 0
          ? `PIN set. ${result.signedOutDevices} signed-in device${result.signedOutDevices === 1 ? '' : 's'} was signed out.`
          : 'PIN set.',
      );
      setPinFor(null);
      setPinValue('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That PIN was not accepted.');
    } finally {
      setWorking(false);
    }
  };

  const setActive = async (member: HouseholdMember, isActive: boolean) => {
    setWorking(true);
    try {
      await api.household.updateChild(member.id, { isActive });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <>
        <ScreenTop title="Household" />
        <main className="screen screen--wide">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  const children = members.filter((member) => member.role === 'child');
  const parents = members.filter((member) => member.role === 'parent');

  return (
    <>
      <ScreenTop title="Household" />
      <main className="screen screen--wide">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="badge badge--done" style={{ padding: 'var(--space-3)' }}>
            {notice}
          </p>
        )}

        <Button
          tone="purple"
          size="lg"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => setAdding(true)}
        >
          Add a child
        </Button>

        {children.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="user"
              title="No children yet"
              message="Add one and they can pick their hero and sign in with a PIN."
            />
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {children.map((child) => (
              <article
                key={child.id}
                className="card stack stack--tight"
                style={{ opacity: child.isActive ? 1 : 0.55 }}
              >
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <Avatar
                    config={(child.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR}
                    size={56}
                    label={`${child.displayName} avatar`}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>{child.displayName}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {child.signedInDevices} device{child.signedInDevices === 1 ? '' : 's'} ·{' '}
                      {child.lastLoginAt
                        ? `last seen ${new Date(child.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : 'never signed in'}
                    </span>
                  </span>
                  <PointsPill value={child.balance ?? 0} small />
                </div>

                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  {child.hasPin ? (
                    <Badge tone="done" icon="check">PIN set</Badge>
                  ) : (
                    <Badge tone="waiting" icon="lock">No PIN yet</Badge>
                  )}
                  {!child.isActive && <Badge tone="neutral">Turned off</Badge>}
                </div>

                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <Button
                    tone="quiet"
                    block
                    icon="lock"
                    disabled={working}
                    onClick={() => {
                      setPinFor(child);
                      setPinValue('');
                    }}
                  >
                    {child.hasPin ? 'Reset PIN' : 'Set PIN'}
                  </Button>
                  <Button
                    tone={child.isActive ? 'stop' : 'go'}
                    block
                    disabled={working}
                    onClick={() => void setActive(child, !child.isActive)}
                  >
                    {child.isActive ? 'Turn off' : 'Turn back on'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <section style={{ marginTop: 'var(--space-6)' }}>
          <h2 className="subtitle">Parents</h2>
          <div className="stack stack--tight">
            {parents.map((parent) => (
              <div key={parent.id} className="card row" style={{ gap: 'var(--space-3)' }}>
                <span className="iconbtn">
                  <Icon name="user" size={20} />
                </span>
                <span style={{ flex: 1, fontWeight: 700 }}>{parent.displayName}</span>
                <Badge tone="neutral">Managed on the laptop</Badge>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            Parent accounts are deliberately not editable here, so nothing in the app can lock a
            parent out. Add one or change a parent PIN on the laptop with{' '}
            <code>npm run user -w backend</code>.
          </p>
        </section>
      </main>

      {adding && (
        <Sheet title="Add a child" onClose={() => setAdding(false)}>
          <div className="stack">
            <label className="stack stack--tight">
              <span className="eyebrow">Name</span>
              <input
                className="input"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="What they are called"
              />
            </label>
            <label className="stack stack--tight">
              <span className="eyebrow">PIN (optional, four digits)</span>
              <input
                className="input numeric"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))}
                placeholder="Leave blank to set it later"
              />
            </label>
            <Button
              tone="go"
              size="lg"
              block
              disabled={working || newName.trim().length === 0}
              onClick={() => void addChild()}
            >
              {working ? 'Saving…' : 'Add them'}
            </Button>
          </div>
        </Sheet>
      )}

      {pinFor && (
        <Sheet title={`PIN for ${pinFor.displayName}`} onClose={() => setPinFor(null)}>
          <div className="stack">
            <p style={{ margin: 0 }} className="muted">
              Four digits, and not one of the obvious ones. Setting this signs {pinFor.displayName}{' '}
              out of every device they are on.
            </p>
            <input
              className="input numeric"
              inputMode="numeric"
              maxLength={4}
              value={pinValue}
              onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ''))}
              aria-label="New PIN"
              placeholder="••••"
            />
            <Button
              tone="go"
              size="lg"
              block
              disabled={working || pinValue.length !== 4}
              onClick={() => void savePin()}
            >
              {working ? 'Saving…' : 'Set it'}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
