import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type GraphNode, unmetNodeDependencies } from "./graph-node";
import { loadGraph, parseGraph } from "./graph-source";

function node(overrides: Record<string, unknown> = {}) {
  return { ref: "build/01", lane: "build", title: "Build", ...overrides };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1, title: "Run", repoRoot: "/repo", lanes: ["build", "empty"],
    nodes: [node()], ...overrides,
  });
}

const expectedNode: GraphNode = {
  ref: "build/01", bucket: "build", nn: "01", title: "Build",
  status: null, validity: { kind: "unfinished", status: null },
  dependsOn: [], blocks: [], finalReview: false,
};

async function withDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "graph-source-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("parseGraph", () => {
  test("maps every node and preserves lane order, including empty lanes", () => {
    expect(parseGraph(fixture({ lanes: ["empty", "build"], nodes: [
      node({ nn: "99", status: "done" }),
      node({ ref: "review/02", dependsOn: ["build/01"], blocks: ["absent/99"], finalReview: true }),
    ] }), "label", "fallback")).toEqual({
      title: "Run", repoRoot: "/repo", lanes: ["empty", "build"], errors: [],
      nodes: {
        "build/01": expectedNode,
        "review/02": { ...expectedNode, ref: "review/02", nn: "02", dependsOn: ["build/01"], blocks: ["absent/99"], finalReview: true },
      },
    });
  });

  test("uses the explicit fallback independently of the error label", () => {
    expect(parseGraph(fixture({ title: undefined }), "/unrelated/graph.json", "chosen")).toEqual({
      title: "chosen", repoRoot: "/repo", lanes: ["build", "empty"],
      nodes: { "build/01": expectedNode }, errors: [],
    });
  });

  test("accepts unspecified shapes without inventing validation rules", () => {
    // Empty strings, multiline titles, cycles, duplicate edges, and advisory dangling blocks are legal.
    const result = parseGraph(fixture({ title: "", lanes: ["", "unused"], extra: true, nodes: [
      node({ ref: "a0-/00", lane: "", title: "\n", dependsOn: ["a0-/00", "a0-/00"], blocks: ["anything"] }),
    ] }), "label", "fallback");
    expect(result).toEqual({
      title: "", repoRoot: "/repo", lanes: ["", "unused"], errors: [],
      nodes: { "a0-/00": { ...expectedNode, ref: "a0-/00", bucket: "", nn: "00", title: "\n", dependsOn: ["a0-/00", "a0-/00"], blocks: ["anything"] } },
    });
  });

  for (const value of [null, [], 1, true, "root"]) {
    test(`rejects non-object root ${JSON.stringify(value)}`, () => {
      const result = parseGraph(JSON.stringify(value), "label", "fallback");
      expect(result).toEqual({ title: "fallback", repoRoot: "", lanes: [], nodes: {}, errors: [
        { file: "label", bucket: "", reason: `root must be an object; received ${JSON.stringify(value)}` },
      ] });
    });
  }

  test("reports malformed JSON with the offending text", () => {
    const result = parseGraph("{broken", "label", "fallback");
    expect(result.nodes).toEqual({});
    expect(result.errors).toEqual([{ file: "label", bucket: "", reason: expect.stringContaining("{broken") }]);
  });

  const topCases: [string, unknown[]][] = [
    ["version", [undefined, null, "1", 0, 2, true]],
    ["title", [null, 7, false, [], {}]],
    ["repoRoot", [undefined, null, 1, "", "relative/path"]],
    ["lanes", [undefined, null, "build", [], ["build", 4], ["build", "build"]]],
    ["nodes", [undefined, null, {}, []]],
  ];
  for (const [field, values] of topCases) {
    for (const value of values) {
      test(`rejects ${field}=${JSON.stringify(value)}`, () => {
        const result = parseGraph(fixture({ [field]: value }), "label", "fallback");
        expect(result.nodes).toEqual({});
        expect(result.errors).toContainEqual({
          file: "label", bucket: "", reason: expect.stringContaining(`${field}`),
        });
        expect(result.errors.some((error) => error.reason.includes(value === undefined ? "missing" : JSON.stringify(value)))).toBe(true);
      });
    }
  }

  const nodeCases: [string, unknown[]][] = [
    ["ref", [undefined, null, 12, "Build/01", "build/1", "build/001", "1build/01", "build_/01", "build/01\n"]],
    ["lane", [undefined, null, 12, "other"]],
    ["title", [undefined, null, 12]],
    ["dependsOn", [null, "build/01", [1], ["build/01", false]]],
    ["blocks", [null, "build/01", [1], ["build/01", false]]],
    ["finalReview", [null, "true", 1, [], {}]],
  ];
  for (const [field, values] of nodeCases) {
    for (const value of values) {
      test(`rejects node ${field}=${JSON.stringify(value)} without partial loading`, () => {
        const result = parseGraph(fixture({ nodes: [node({ ref: "build/02" }), node({ [field]: value })] }), "label", "fallback");
        expect(result.nodes).toEqual({});
        expect(result.errors).toContainEqual({
          file: "label", bucket: field === "lane" ? (typeof value === "string" ? value : "") : "build",
          reason: expect.stringContaining(field),
        });
        expect(result.errors.some((error) => error.reason.includes(value === undefined ? "missing" : JSON.stringify(value)))).toBe(true);
      });
    }
  }

  for (const value of [null, [], "node", 1, true]) {
    test(`rejects non-object node ${JSON.stringify(value)}`, () => {
      const result = parseGraph(fixture({ nodes: [node(), value] }), "label", "fallback");
      expect(result.nodes).toEqual({});
      expect(result.errors).toEqual([{ file: "label", bucket: "", reason: `nodes[1] must be an object; received ${JSON.stringify(value)}` }]);
    });
  }

  test("reports duplicate refs and competing final reviews", () => {
    const result = parseGraph(fixture({ nodes: [node({ finalReview: true }), node({ finalReview: true })] }), "label", "fallback");
    expect(result.nodes).toEqual({});
    expect(result.errors).toEqual([
      { file: "label", bucket: "build", reason: expect.stringMatching(/ref.*duplicate.*"build\/01"/) },
      { file: "label", bucket: "build", reason: expect.stringMatching(/finalReview.*"build\/01"/) },
    ]);
  });

  test("removes dangling dependencies, retains valid edges and advisory blocks", () => {
    const result = parseGraph(fixture({ nodes: [
      node({ dependsOn: ["absent/01", "__proto__"], blocks: ["absent/01"] }),
      node({ ref: "build/02", dependsOn: ["build/01", "absent/02"] }),
    ] }), "label", "fallback");
    expect(result.nodes).toEqual({
      "build/01": { ...expectedNode, blocks: ["absent/01"] },
      "build/02": { ...expectedNode, ref: "build/02", nn: "02", dependsOn: ["build/01"] },
    });
    expect(result.errors).toEqual(["absent/01", "__proto__", "absent/02"].map((ref) => ({
      file: "label", bucket: "build", reason: expect.stringContaining(JSON.stringify(ref)),
    })));
    expect(unmetNodeDependencies(result.nodes["build/01"], result.nodes)).toEqual([]);
    expect(unmetNodeDependencies(result.nodes["build/02"], result.nodes)).toEqual(["build/01"]);
  });
});

describe("loadGraph", () => {
  test("reads graph.json and supplies the directory basename", () => withDir(async (dir) => {
    const text = fixture({ title: undefined });
    await writeFile(join(dir, "graph.json"), text);
    expect(await loadGraph(dir)).toEqual(parseGraph(text, join(dir, "graph.json"), basename(dir)));
  }));

  test("returns parser errors with the file path", () => withDir(async (dir) => {
    await writeFile(join(dir, "graph.json"), "{broken");
    expect(await loadGraph(dir)).toEqual(parseGraph("{broken", join(dir, "graph.json"), basename(dir)));
  }));

  for (const unreadable of [false, true]) {
    test(`returns an error for ${unreadable ? "unreadable" : "missing"} graph.json`, () => withDir(async (dir) => {
      // A directory at graph.json produces a real read failure even when tests run as root.
      if (unreadable) await mkdir(join(dir, "graph.json"));
      expect(await loadGraph(dir)).toEqual({
        title: basename(dir), repoRoot: "", lanes: [], nodes: {}, errors: [{
          file: join(dir, "graph.json"), bucket: "", reason: expect.stringContaining("read"),
        }],
      });
    }));
  }
});
