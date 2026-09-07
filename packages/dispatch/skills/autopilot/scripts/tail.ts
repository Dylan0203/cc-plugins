import { closeSync, openSync, readSync } from "node:fs";

const DEFAULT_CHUNK = 1 << 20;

/**
 * Read a byte range in bounded chunks. Yields fewer bytes than asked when the
 * file shrank mid-read, nothing at all for an empty range.
 *
 * Chunked because `size - from` is bounded by nothing: `nextCursor` resets to 0
 * on a truncated or replaced file, and a cold pass starts there, so the range is
 * routinely the whole file — 2.4 GB for a Claude transcript, which no single
 * Buffer-plus-string survives.
 *
 * Chunks are freshly allocated so a caller may hold one past the next iteration.
 */
export function* readRangeChunks(
  path: string,
  from: number,
  size: number,
  chunkSize: number = DEFAULT_CHUNK,
): Generator<Uint8Array> {
  const total = size - from;
  if (total <= 0) return;

  const descriptor = openSync(path, "r");
  try {
    let read = 0;
    while (read < total) {
      const want = Math.min(chunkSize, total - read);
      const bytes = Buffer.allocUnsafe(want);
      const count = readSync(descriptor, bytes, 0, want, from + read);
      if (count === 0) break;
      read += count;
      yield bytes.subarray(0, count);
    }
  } finally {
    closeSync(descriptor);
  }
}

/** Split a chunk into complete lines and the trailing partial remainder. */
export function splitCompleteLines(text: string): {
  complete: string[];
  partial: string;
} {
  const parts = text.split("\n");
  const partial = parts.pop() ?? "";
  return { complete: parts, partial };
}

/**
 * Decide how to advance after a stat. A file smaller than the cursor means it was
 * truncated or replaced, so the cursor resets to zero and the whole file is re-read.
 */
export function nextCursor(
  prev: number,
  size: number,
): { from: number; reset: boolean } {
  if (size < prev) return { from: 0, reset: true };
  return { from: prev, reset: false };
}
