import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonlLines } from "./jsonl-lines";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jsonl-lines-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, body: string | Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

function collect(path: string, opts?: Parameters<typeof readJsonlLines>[1]) {
  return [...readJsonlLines(path, opts)];
}

describe("readJsonlLines", () => {
  test("讀出每一行，不含換行字元", () => {
    const path = write("basic.jsonl", "a\nbb\nccc\n");
    expect(collect(path)).toEqual(["a", "bb", "ccc"]);
  });

  test("多位元組字元橫跨 chunk 邊界仍完整", () => {
    // 「中」是 3 bytes。用 4-byte chunk 保證它一定被切開。
    const path = write("utf8.jsonl", "中文\n中\n文中文\n");
    expect(collect(path, { chunkSize: 4 })).toEqual(["中文", "中", "文中文"]);
  });

  test("單行長度超過一個 chunk", () => {
    const long = "x".repeat(5000);
    const path = write("long.jsonl", `${long}\nshort\n`);
    expect(collect(path, { chunkSize: 64 })).toEqual([long, "short"]);
  });

  test("\\r\\n 不被拆成兩行", () => {
    const path = write("crlf.jsonl", "a\r\nb\r\n");
    expect(collect(path)).toEqual(["a", "b"]);
  });

  test("保留空行，交給呼叫端過濾", () => {
    const path = write("blank.jsonl", "a\n\nb\n");
    expect(collect(path)).toEqual(["a", "", "b"]);
  });

  test("預設吐出結尾未換行的殘段", () => {
    const path = write("partial.jsonl", "a\nb");
    expect(collect(path)).toEqual(["a", "b"]);
  });

  test("emitPartial:false 時保留殘段給下一輪", () => {
    const path = write("partial2.jsonl", "a\nb");
    expect(collect(path, { emitPartial: false })).toEqual(["a"]);
  });

  test("空檔不吐任何東西", () => {
    const path = write("empty.jsonl", "");
    expect(collect(path)).toEqual([]);
    expect(collect(path, { emitPartial: false })).toEqual([]);
  });

  test("檔案不存在時安靜地不吐東西", () => {
    expect(collect(join(dir, "nope.jsonl"))).toEqual([]);
  });

  test("start offset 從指定 byte 開始讀", () => {
    const path = write("offset.jsonl", "aaa\nbbb\nccc\n");
    expect(collect(path, { start: 4 })).toEqual(["bbb", "ccc"]);
  });
});

describe("cursor.bytesConsumed", () => {
  // rollup-update 拿它當 bytes_parsed，語意必須等同舊的 lastIndexOf(0x0a) 邊界：
  // 消化到最後一個完整行的結尾（含換行）為止。
  test("等同最後一個換行後的位置", () => {
    const body = "aaa\nbbb\nccc\n";
    const path = write("consumed.jsonl", body);
    const cursor = { bytesConsumed: 0 };
    [...readJsonlLines(path, { emitPartial: false, cursor })];
    expect(cursor.bytesConsumed).toBe(body.length);
  });

  test("殘段不計入 bytesConsumed", () => {
    const path = write("consumed2.jsonl", "aaa\nbbb\npartial");
    const cursor = { bytesConsumed: 0 };
    [...readJsonlLines(path, { emitPartial: false, cursor })];
    expect(cursor.bytesConsumed).toBe("aaa\nbbb\n".length);
  });

  test("完全沒有完整行時停在 start", () => {
    const path = write("consumed3.jsonl", "aaaa\nno-newline-yet");
    const cursor = { bytesConsumed: 0 };
    [...readJsonlLines(path, { start: 5, emitPartial: false, cursor })];
    expect(cursor.bytesConsumed).toBe(5);
  });

  test("start offset 之後的邊界是絕對位置", () => {
    const path = write("consumed4.jsonl", "aaa\nbbb\nccc\n");
    const cursor = { bytesConsumed: 0 };
    [...readJsonlLines(path, { start: 4, emitPartial: false, cursor })];
    expect(cursor.bytesConsumed).toBe(12);
  });

  test("多位元組跨塊時 bytesConsumed 以 byte 計，不是字元數", () => {
    const body = "中文\n中\n";
    const path = write("consumed5.jsonl", body);
    const cursor = { bytesConsumed: 0 };
    [...readJsonlLines(path, { chunkSize: 4, emitPartial: false, cursor })];
    expect(cursor.bytesConsumed).toBe(Buffer.byteLength(body));
  });
});

describe("超過 JSC 字串上限的檔案", () => {
  // 這是唯一能證明修好了的測試。舊寫法（readFileSync + split）在這個 fixture 上
  // 是 SIGTRAP / exit 133 —— bun 的 assertion 直接帶走 process，try/catch 接不到，
  // 所以「沒 crash」本身就是斷言的一部分：這個測試跑完就代表沒退回。
  //
  // fixture 用 APFS 稀疏檔：只實際寫幾個 byte，ftruncate 把邏輯大小撐到 2.4 GB，
  // 中間的洞讀出來是 \0。實體佔用接近 0，建立是瞬間的。永遠在 tmpdir，不進 repo。
  const bigDir = mkdtempSync(join(tmpdir(), "jsonl-lines-big-"));
  const bigPath = join(bigDir, "huge.jsonl");

  afterAll(() => {
    rmSync(bigDir, { recursive: true, force: true });
  });

  test("2.4 GB 檔案的頭尾兩筆都讀得到", () => {
    const first = JSON.stringify({ marker: "first" });
    const last = JSON.stringify({ marker: "last" });
    // 2^31 是 JSC 的字串上限量級；2.4 GB 確定跨過去。
    const holeEnd = 2_400_000_000;

    const fd = openSync(bigPath, "w");
    try {
      writeSync(fd, `${first}\n`);
      // 每 ~600 KB 插一個換行，讓中間的洞被切成很多短行，而不是一條 2.4 GB
      // 的長行 —— 後者會讓串流本身撞上同一個上限。
      const nl = Buffer.from("\n");
      for (let at = 600_000; at < holeEnd; at += 600_000) {
        writeSync(fd, nl, 0, 1, at);
      }
      ftruncateSync(fd, holeEnd);
      // Lead with a newline so the last record is a clean line rather than the
      // tail of the \0-filled hole.
      writeSync(fd, Buffer.from(`\n${last}\n`), 0, last.length + 2, holeEnd);
    } finally {
      closeSync(fd);
    }

    let firstSeen: string | null = null;
    let lastSeen: string | null = null;
    let lineCount = 0;
    for (const line of readJsonlLines(bigPath)) {
      lineCount += 1;
      // 洞的部分是 \0 填充，JSON.parse 會失敗——正是真實迴圈的行為。
      let entry: { marker?: string };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.marker === "first") firstSeen = entry.marker;
      if (entry.marker === "last") lastSeen = entry.marker;
    }

    expect(firstSeen).toBe("first");
    expect(lastSeen).toBe("last");
    expect(lineCount).toBeGreaterThan(4000);
  }, 600_000);
});
