import { formatDuration, MINUTE_MS } from "./time";
import type { EstimateSample } from "./types";

// Estimate accuracy: "DoSprout learns how long things actually take you."
// The server sends your finished tasks that had an estimate and tracked time
// (GET /estimates, all your teams). These helpers compare the two.

/** Fewer finished tasks than this is too little to say anything about. */
export const MIN_SAMPLES = 3;

// One odd task (forgot to stop the timer...) shouldn't make the numbers silly.
const MIN_FACTOR = 0.25;
const MAX_FACTOR = 4;

export interface Accuracy {
  /**
   * Tracked time divided by estimated time. 1.5 = things take you 1.5 times as long as
   * you estimate; 0.8 = they take 20% less.
   */
  factor: number;
  /** How many finished tasks it's based on. */
  count: number;
}

export interface EstimateAccuracy {
  /** For all your tasks together, or null while there are fewer than MIN_SAMPLES. */
  overall: Accuracy | null;
  /** Per tag, only for tags with at least MIN_SAMPLES tasks; the most tasks first. */
  byTag: { tag: string; accuracy: Accuracy }[];
  /** How many finished tasks there are in total (also when it's fewer than MIN_SAMPLES). */
  sampleCount: number;
}

/**
 * Total tracked divided by total estimated, so a long task counts for more than a short
 * one (an average of ratios would let one 5-minute task swing everything).
 */
function accuracyOf(samples: EstimateSample[]): Accuracy | null {
  if (samples.length < MIN_SAMPLES) return null;
  const estimated = samples.reduce((sum, s) => sum + s.estimateMinutes, 0);
  const tracked = samples.reduce((sum, s) => sum + s.trackedMinutes, 0);
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, tracked / estimated));
  return { factor, count: samples.length };
}

export function estimateAccuracy(samples: EstimateSample[]): EstimateAccuracy {
  const byTagSamples = new Map<string, EstimateSample[]>();
  for (const sample of samples) {
    if (!sample.tag) continue;
    byTagSamples.set(sample.tag, [...(byTagSamples.get(sample.tag) ?? []), sample]);
  }
  const byTag = [...byTagSamples]
    .map(([tag, list]) => ({ tag, accuracy: accuracyOf(list) }))
    .filter((row): row is { tag: string; accuracy: Accuracy } => row.accuracy !== null)
    .sort((a, b) => b.accuracy.count - a.accuracy.count || a.tag.localeCompare(b.tag));
  return { overall: accuracyOf(samples), byTag, sampleCount: samples.length };
}

/**
 * What we know about tasks with this tag: the tag's own accuracy when there are enough
 * of them, otherwise the overall one (tag: null). null when we don't know enough yet.
 */
export function accuracyFor(accuracy: EstimateAccuracy, tag: string): (Accuracy & { tag: string | null }) | null {
  const forTag = accuracy.byTag.find((row) => row.tag === tag);
  if (forTag) return { ...forTag.accuracy, tag };
  return accuracy.overall && { ...accuracy.overall, tag: null };
}

/** An estimate corrected by your history, rounded to 5 minutes (at least 5). */
export function honestMinutes(estimateMinutes: number, factor: number): number {
  return Math.max(5, Math.round((estimateMinutes * factor) / 5) * 5);
}

/**
 * How long a task will really take you: its estimate, corrected by your history when we
 * know enough. null when it has no estimate.
 */
export function realisticMinutes(task: { estimateMinutes: number | null; tag: string }, accuracy: EstimateAccuracy): number | null {
  if (task.estimateMinutes === null) return null;
  const known = accuracyFor(accuracy, task.tag);
  return known ? honestMinutes(task.estimateMinutes, known.factor) : task.estimateMinutes;
}

/** Within 10% counts as "about right": not worth correcting anyone over. */
export function worthMentioning(factor: number): boolean {
  return Math.abs(factor - 1) >= 0.1;
}

/** 1.6 -> "1.6× longer than you estimate", 0.7 -> "30% quicker than you estimate". */
export function describeFactor(factor: number): string {
  if (!worthMentioning(factor)) return "about as long as you estimate";
  if (factor > 1) return `${factor.toFixed(1)}× longer than you estimate`;
  return `${Math.round((1 - factor) * 100)}% quicker than you estimate`;
}

/** The note under the task editor's Estimate field, or null when there's nothing to say. */
export function estimateHint(estimateMinutes: number | null, tag: string, accuracy: EstimateAccuracy): string | null {
  if (estimateMinutes === null) return null;
  const known = accuracyFor(accuracy, tag.trim());
  if (!known || !worthMentioning(known.factor)) return null;
  const history = known.tag ? `your ${known.tag} tasks` : "your history";
  return `Based on ${history}, that's more like ${formatMinutes(honestMinutes(estimateMinutes, known.factor))}.`;
}

/** 1.6 -> "1.6× longer", 0.7 -> "30% quicker", 1.05 -> "About right". */
export function shortFactor(factor: number): string {
  if (!worthMentioning(factor)) return "About right";
  if (factor > 1) return `${factor.toFixed(1)}× longer`;
  return `${Math.round((1 - factor) * 100)}% quicker`;
}

/** 95 -> "1h 35m". */
export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * MINUTE_MS);
}
