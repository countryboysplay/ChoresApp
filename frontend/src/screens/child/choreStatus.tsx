import { Badge, type BadgeTone } from '../../design/primitives';
import type { IconName } from '../../design/icons';
import type { ChoreStatus } from '../../mock/data';

/** Status is never communicated by color alone - each state has an icon and a label. */
const STATUS: Record<ChoreStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  not_started: { label: 'Not started', tone: 'neutral', icon: 'clock' },
  in_progress: { label: 'In progress', tone: 'info', icon: 'missions' },
  submitted: { label: 'Waiting for approval', tone: 'waiting', icon: 'clock' },
  approved: { label: 'Approved', tone: 'done', icon: 'check' },
  rejected: { label: 'Needs fixing', tone: 'late', icon: 'alert' },
  carried_over: { label: 'Carried over', tone: 'waiting', icon: 'chevron' },
  excused: { label: 'Excused', tone: 'info', icon: 'check' },
  missed: { label: 'Missed', tone: 'late', icon: 'close' },
};

export function StatusBadge({ status }: { status: ChoreStatus }) {
  const config = STATUS[status];
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

export const statusAccent: Record<ChoreStatus, string> = {
  not_started: '',
  in_progress: 'is-info',
  submitted: 'is-waiting',
  approved: 'is-done',
  rejected: 'is-late',
  carried_over: 'is-waiting',
  excused: 'is-info',
  missed: 'is-late',
};
