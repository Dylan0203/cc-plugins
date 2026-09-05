import {
  type ParsedTask,
  refToString,
  taskValidity,
} from "../../flightplan/scripts/lib/parse-task";

export type NodeValidity =
  | { kind: "complete" }
  | { kind: "unfinished"; status: string | null }
  | { kind: "invalid"; rule: string; reason: string };

// Markdown-only rubric, sections, body, requiredReading, and h1 are omitted because derivation never reads them.
export type GraphNode = {
  ref: string;
  bucket: string;
  nn: string;
  title: string;
  status: string | null;
  dependsOn: string[];
  blocks: string[];
  finalReview: boolean;
  /** Whether this node counts as complete for a dependent. */
  validity: NodeValidity;
};

/** Pure. Converts the parsed markdown tree into the narrow node shape. */
export function nodesFromParsedTasks(
  byRef: Record<string, ParsedTask>,
): Record<string, GraphNode> {
  return Object.fromEntries(Object.entries(byRef).map(([ref, task]) => [ref, {
    ref,
    bucket: task.bucket,
    nn: task.nn,
    title: task.title,
    status: task.status,
    dependsOn: task.dependsOn.map(refToString),
    blocks: task.blocks.map(refToString),
    finalReview: task.finalReview,
    validity: taskValidity(task),
  }]));
}

// Mirror next-ready.ts's scout rule here so every dashboard loader agrees without requiring ParsedTask.
export function unmetNodeDependencies(
  node: GraphNode,
  byRef: Record<string, GraphNode>,
): string[] {
  return node.dependsOn.filter((ref) => {
    const dependency = byRef[ref];
    return dependency === undefined || dependency.validity.kind !== "complete";
  });
}
