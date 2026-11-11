/**
 * Per-device memory for celebrations. Losing it only means a moment replays.
 * `undefined` = storage unavailable (private mode, blocked site data).
 */
export const deviceMemory = {
  get(key: string): string | null | undefined {
    try {
      return localStorage.getItem(key);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

/** What this browser has already celebrated, so a moment shows once. */
// Also kept in memory, so a failed write (storage full) still counts as shown this session.
const markedThisSession = new Set<string>();

export const celebrated = {
  has(key: string): boolean {
    if (markedThisSession.has(key)) return true;
    const value = deviceMemory.get(`cq-celebrated:${key}`);
    return value === undefined || value === '1'; // no storage: never nag
  },
  mark(key: string): void {
    markedThisSession.add(key);
    deviceMemory.set(`cq-celebrated:${key}`, '1');
  },
};
