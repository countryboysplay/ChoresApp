/** Shared display formatting. Kept out of components so wording stays consistent. */

export function relativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return 'just now';
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function countdown(minutesLeft: number): string {
  if (minutesLeft <= 0) return 'Expired';
  if (minutesLeft < 60) return `${minutesLeft}m left`;
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m left` : `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
}

export function points(value: number): string {
  return `${value.toLocaleString('en-US')} pts`;
}
