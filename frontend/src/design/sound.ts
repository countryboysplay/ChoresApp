/**
 * Web Audio game sounds. No audio files - every effect is generated.
 *
 * Rules from the spec: sound never blocks a workflow, there is no child-facing
 * mute switch, and the OS volume control is never bypassed. If the browser
 * blocks audio until a gesture, playback simply no-ops.
 */
export type SoundName = 'success' | 'approve' | 'redeem' | 'levelUp' | 'achievement' | 'tap';

type Note = { freq: number; start: number; duration: number; gain?: number };

const SOUNDS: Record<SoundName, { wave: OscillatorType; notes: Note[] }> = {
  tap: { wave: 'sine', notes: [{ freq: 660, start: 0, duration: 0.07, gain: 0.12 }] },
  success: {
    wave: 'triangle',
    notes: [
      { freq: 523, start: 0, duration: 0.12 },
      { freq: 784, start: 0.1, duration: 0.16 },
    ],
  },
  approve: {
    wave: 'triangle',
    notes: [
      { freq: 587, start: 0, duration: 0.12 },
      { freq: 880, start: 0.1, duration: 0.14 },
      { freq: 1175, start: 0.22, duration: 0.2 },
    ],
  },
  redeem: {
    wave: 'square',
    notes: [
      { freq: 880, start: 0, duration: 0.08, gain: 0.1 },
      { freq: 1046, start: 0.08, duration: 0.08, gain: 0.1 },
      { freq: 1318, start: 0.16, duration: 0.18, gain: 0.1 },
    ],
  },
  levelUp: {
    wave: 'sawtooth',
    notes: [
      { freq: 392, start: 0, duration: 0.12, gain: 0.09 },
      { freq: 523, start: 0.12, duration: 0.12, gain: 0.09 },
      { freq: 659, start: 0.24, duration: 0.12, gain: 0.09 },
      { freq: 1046, start: 0.36, duration: 0.3, gain: 0.09 },
    ],
  },
  achievement: {
    wave: 'triangle',
    notes: [
      { freq: 659, start: 0, duration: 0.14 },
      { freq: 988, start: 0.14, duration: 0.14 },
      { freq: 1318, start: 0.28, duration: 0.36 },
    ],
  },
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

/** Fire and forget. Never throws, never awaits, never blocks the caller. */
export function playSound(name: SoundName): void {
  const ctx = getContext();
  if (!ctx) return;

  // Autoplay policy: resume is a no-op until the first user gesture.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const preset = SOUNDS[name];
  const now = ctx.currentTime;

  for (const note of preset.notes) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = (note.gain ?? 0.14) * (prefersReducedMotion ? 0.6 : 1);

      osc.type = preset.wave;
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(peak, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    } catch {
      return;
    }
  }
}
