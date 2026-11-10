import { describe, expect, it, vi } from 'vitest';

// Fresh module per test: the launch clock is module state set at import.
async function load() {
  vi.resetModules();
  return import('../lib/appUpdate');
}

describe('updates install on the next launch', () => {
  it('installs an update found while the app is launching', async () => {
    const m = await load();
    const apply = vi.fn(async () => {});
    m.reportUpdateWaiting(apply, Date.now() + 2_000);
    expect(apply).toHaveBeenCalledWith(true);
  });

  it('leaves an update that lands mid-use waiting', async () => {
    const m = await load();
    const apply = vi.fn(async () => {});
    m.reportUpdateWaiting(apply, Date.now() + 60_000);
    expect(apply).not.toHaveBeenCalled();
    expect(m.isUpdateWaiting()).toBe(true);
  });

  it('counts a return after five minutes away as a launch, but not a quick glance away', async () => {
    const m = await load();
    const t = Date.now() + 60_000;
    m.noteVisibility(true, t);
    expect(m.noteVisibility(false, t + 30_000)).toBe(false);

    m.noteVisibility(true, t + 40_000);
    const back = t + 40_000 + 5 * 60_000;
    expect(m.noteVisibility(false, back)).toBe(true);

    // The relaunch reopens the window, so an update found right after installs.
    const apply = vi.fn(async () => {});
    m.reportUpdateWaiting(apply, back + 3_000);
    expect(apply).toHaveBeenCalledWith(true);
  });
});
