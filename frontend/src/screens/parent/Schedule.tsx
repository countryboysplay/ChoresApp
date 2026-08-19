import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScheduleEntry } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

/** ISO weekdays, in the order a week is read. */
const WEEK = [
  { iso: 1, label: 'Monday' },
  { iso: 2, label: 'Tuesday' },
  { iso: 3, label: 'Wednesday' },
  { iso: 4, label: 'Thursday' },
  { iso: 5, label: 'Friday' },
  { iso: 6, label: 'Saturday' },
  { iso: 7, label: 'Sunday' },
] as const;

/** A daily chore has no days listed and applies to all of them. */
function appliesOn(entry: ScheduleEntry, iso: number): boolean {
  return entry.recurrence === 'daily' || entry.daysOfWeek.includes(iso);
}

export function Schedule() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSchedules((await api.dashboard.schedule()).schedules);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <>
        <ScreenTop title="Schedule" />
        <main className="screen screen--wide">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <ScreenTop title="Schedule" />
      <main className="screen screen--wide">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        {schedules.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="missions"
              title="Nothing scheduled yet"
              message="Create a chore and assign it, and the week fills in here."
            />
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {WEEK.map((day) => {
              const onThisDay = schedules.filter((entry) => appliesOn(entry, day.iso));
              return (
                <section key={day.iso} className="card stack stack--tight">
                  <div className="row row--between">
                    <h2 className="subtitle" style={{ margin: 0 }}>{day.label}</h2>
                    <Badge tone={onThisDay.length === 0 ? 'neutral' : 'info'}>
                      {onThisDay.length === 0 ? 'Free' : `${onThisDay.length} chore${onThisDay.length === 1 ? '' : 's'}`}
                    </Badge>
                  </div>

                  {onThisDay.map((entry) => (
                    <div key={`${entry.id}-${day.iso}`} className="row" style={{ gap: 'var(--space-3)' }}>
                      <span className="tile-icon tile-icon--gold tile-icon--sm">
                        <Icon name={entry.choreIcon as IconName} size={18} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, display: 'block' }}>{entry.choreName}</span>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {entry.child.displayName}
                        </span>
                      </span>
                      <PointsPill value={entry.points} small />
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}

        <Button
          tone="purple"
          size="lg"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-5)' }}
          onClick={() => navigate('/parent/chores/new')}
        >
          Add a chore
        </Button>
      </main>
    </>
  );
}
