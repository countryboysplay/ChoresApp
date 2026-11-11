import { renderHook } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { useCatchUp } from '../lib/motion';

beforeEach(() => localStorage.clear());

test('first visit shows the value with nothing to catch up from', () => {
  const { result } = renderHook(() => useCatchUp('k', 50, true));
  expect(result.current).toBe(50);
});

test('holds the last seen value, then moves to the new one and remembers it', () => {
  localStorage.setItem('cq-seen:k', '20');
  const { result, rerender } = renderHook(({ hold }) => useCatchUp('k', 50, hold), {
    initialProps: { hold: true },
  });
  expect(result.current).toBe(20);
  rerender({ hold: false });
  expect(result.current).toBe(50);
  expect(localStorage.getItem('cq-seen:k')).toBe('50');
});

test('an unknown value stays unknown and is not stored', () => {
  const { result } = renderHook(() => useCatchUp('k', undefined, false));
  expect(result.current).toBeUndefined();
  expect(localStorage.getItem('cq-seen:k')).toBeNull();
});
