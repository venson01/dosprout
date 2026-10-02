// Short chimes for the focus timer, made with the browser's Web Audio API.
// They're generated from plain tones, so there are no audio files to download or host.

/** Which chime to play. */
export type TimerSound = "focus-done" | "break-over";

// Each chime is a few notes: [frequency in Hz, when it starts in seconds].
// Focus done: three notes going DOWN (C6, A5, F5), calm, "time to rest".
// Break over: three notes going UP, quicker and brighter (C5, E5, G5 then C6), "back to work".
const CHIMES: Record<TimerSound, { notes: [number, number][]; wave: OscillatorType }> = {
  "focus-done": { notes: [[1047, 0], [880, 0.22], [698, 0.44]], wave: "sine" },
  "break-over": { notes: [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]], wave: "triangle" },
};

// One AudioContext for the whole app (browsers limit how many a page can make).
let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  context ??= new AudioContext();
  return context;
}

/**
 * Browsers only let a page make sound after you've clicked something on it. Call this
 * from a click (e.g. "Start focus") so the chime can play later, when the timer ends.
 */
export function unlockSound() {
  getContext()
    ?.resume()
    .catch(() => {});
}

/** Plays a chime. Fails silently if the browser won't allow sound right now. */
export async function playSound(sound: TimerSound) {
  const ctx = getContext();
  if (!ctx) return;
  try {
    await ctx.resume();
  } catch {
    return;
  }
  const { notes, wave } = CHIMES[sound];
  const start = ctx.currentTime;
  for (const [frequency, offset] of notes) {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    // A quick fade in and a slow fade out, so each note sounds like a soft bell, not a beep.
    const at = start + offset;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(0.25, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, at + 0.8);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.8);
  }
}
