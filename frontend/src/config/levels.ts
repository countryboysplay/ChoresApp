/**
 * Level progression - the single source of truth.
 *
 * Levels come from LIFETIME earned points and each level costs more than the
 * last. Nothing else in the app may compute a level threshold; import from here.
 *
 * Curve: level N requires BASE * N^EXPONENT lifetime points, rounded to the
 * nearest 5 so the numbers read cleanly to a kid. Tune BASE/EXPONENT here only.
 */
const BASE = 60;
const EXPONENT = 1.45;
const MAX_LEVEL = 50;

export interface LevelProgress {
  level: number;
  /** Lifetime points required to have reached the current level. */
  currentLevelAt: number;
  /** Lifetime points required for the next level, or null at max level. */
  nextLevelAt: number | null;
  /** Points earned inside the current level. */
  pointsIntoLevel: number;
  /** Points the current level spans, or null at max level. */
  levelSpan: number | null;
}

export function thresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((BASE * Math.pow(level - 1, EXPONENT)) / 5) * 5;
}

export function levelForLifetimePoints(lifetimePoints: number): LevelProgress {
  const points = Math.max(0, Math.floor(lifetimePoints));

  let level = 1;
  while (level < MAX_LEVEL && points >= thresholdForLevel(level + 1)) {
    level += 1;
  }

  const currentLevelAt = thresholdForLevel(level);
  const nextLevelAt = level >= MAX_LEVEL ? null : thresholdForLevel(level + 1);

  return {
    level,
    currentLevelAt,
    nextLevelAt,
    pointsIntoLevel: points - currentLevelAt,
    levelSpan: nextLevelAt === null ? null : nextLevelAt - currentLevelAt,
  };
}
