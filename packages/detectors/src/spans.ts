// Interval helpers that stay near-linear when a hostile prompt produces thousands of matches.

export interface Span {
  start: number;
  end: number;
}

/**
 * Walk `items` in preference order and keep each one that does not overlap an already-kept one.
 * Kept spans are held sorted by start, so each overlap check is a binary search.
 */
export function keepNonOverlapping<T extends Span>(items: T[]): T[] {
  const kept: T[] = [];
  for (const it of items) {
    // First kept span whose start is >= it.end; the one before it is the only possible left overlap.
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kept[mid].start < it.end) lo = mid + 1;
      else hi = mid;
    }
    const prev = kept[lo - 1];
    if (prev && prev.end > it.start) continue;
    kept.splice(lo, 0, it);
  }
  return kept;
}

/** First index in `sorted` (by start) whose start is >= x. */
export function lowerBound(sorted: Span[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
