// Chunked line reader for the JSONL transcripts, shared by api.ts (the live
// walk) and rollup-update.ts (the incremental ingest).
//
// It exists because `readFileSync(file, "utf-8")` is not survivable on this
// data. A single transcript here reaches 2.4 GB — long-lived sessions append
// forever — and materialising one as a JS string blows past JSC's string limit.
// Bun handles that with an assertion, not an exception: the process dies with
// SIGTRAP / exit 133, no stack, no JS frame, and **`try/catch` never sees it**.
// That is why the read itself had to change; no amount of wrapping helps.
//
// Sync on purpose. `updateRollup` is sync with four callers, so a stream-and-
// await reader would turn a leaf fix into a signature change across api.ts and
// its tests. The openSync/readSync + `0x0a` Buffer-boundary shape below is the
// one rollup-update.ts already uses for its tail reads.
import { closeSync, openSync, readSync } from "node:fs";

/** Byte offset consumed through the last *complete* line. */
export type LineCursor = { bytesConsumed: number };

export type JsonlLinesOptions = {
  /** Byte offset to start reading from. Must sit on a line boundary. */
  start?: number;
  /** Read buffer size. Only tests need to set this. */
  chunkSize?: number;
  /**
   * Whether a trailing segment with no terminating newline is yielded.
   *
   * `true` (default) matches the `split("\n")` this replaced — api.ts must keep
   * it, or a transcript written without a final newline silently loses its last
   * record, which shows up as under-counted tokens rather than as an error.
   *
   * `false` is for the rollup ingest, which leaves a partial line for the next
   * run so a session still being written is never billed from half a line.
   */
  emitPartial?: boolean;
  /** Receives the consumed byte boundary; `for..of` swallows a return value. */
  cursor?: LineCursor;
};

const DEFAULT_CHUNK = 1 << 20;
const NEWLINE = 0x0a;

// The file may be CRLF; the caller wants the logical line either way.
function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Yield the file's lines without ever holding more than one chunk plus the
 * current line in memory.
 *
 * Multibyte safety comes from the order of operations: split on `0x0a` in the
 * *Buffer*, decode each line afterwards. A `0x0a` byte never occurs inside a
 * UTF-8 multibyte sequence, so a line boundary is always a safe decode
 * boundary — whereas decoding a chunk first would corrupt any character
 * straddling the chunk edge.
 *
 * A missing or unreadable file yields nothing, matching the callers' existing
 * `try { readFileSync } catch { continue }`.
 */
export function* readJsonlLines(
  file: string,
  opts: JsonlLinesOptions = {},
): Generator<string> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  const start = opts.start ?? 0;
  const emitPartial = opts.emitPartial ?? true;
  const cursor = opts.cursor;
  if (cursor) cursor.bytesConsumed = start;

  let fd: number;
  try {
    fd = openSync(file, "r");
  } catch {
    return;
  }

  try {
    const chunk = Buffer.allocUnsafe(chunkSize);
    // Carry-over for a line that spans chunks, kept as Buffers and joined once
    // per line — concatenating on every chunk would make a long line quadratic.
    const carry: Buffer[] = [];
    let carryLen = 0;
    let pos = start;
    let consumed = start;

    for (;;) {
      let n: number;
      try {
        n = readSync(fd, chunk, 0, chunkSize, pos);
      } catch {
        break;
      }
      if (n <= 0) break;
      pos += n;

      // Bound the search to what we actually read — `chunk` is allocUnsafe and
      // holds stale bytes from the previous read past `n`.
      const view = chunk.subarray(0, n);
      let from = 0;
      for (;;) {
        const nl = view.indexOf(NEWLINE, from);
        if (nl === -1) break;
        const seg = view.subarray(from, nl);
        let line: string;
        if (carryLen > 0) {
          // `seg` points into the reused chunk, but it is consumed right here,
          // before the next read — safe without a copy.
          carry.push(seg);
          line = Buffer.concat(carry, carryLen + seg.length).toString("utf-8");
          consumed += carryLen + seg.length + 1;
          carry.length = 0;
          carryLen = 0;
        } else {
          line = view.toString("utf-8", from, nl);
          consumed += seg.length + 1;
        }
        if (cursor) cursor.bytesConsumed = consumed;
        yield stripCr(line);
        from = nl + 1;
      }

      if (from < n) {
        // Crosses into the next read, so this one must be copied out of the
        // reused chunk.
        const rest = Buffer.from(view.subarray(from, n));
        carry.push(rest);
        carryLen += rest.length;
      }
    }

    if (carryLen > 0 && emitPartial) {
      const line = Buffer.concat(carry, carryLen).toString("utf-8");
      consumed += carryLen;
      if (cursor) cursor.bytesConsumed = consumed;
      yield stripCr(line);
    }
  } finally {
    closeSync(fd);
  }
}
