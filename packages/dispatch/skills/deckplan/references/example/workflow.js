export const meta = {
  name: "repository-tour",
  description:
    "Inspect a repository and write a guide without editing its source",
  phases: [
    {
      title: "Inspect",
      detail: "Inventory, documentation, guide and license evidence",
    },
  ],
};

// Replace all three absolute paths before running; the repository must match graph.json.
const CFG = {
  runDir: "/absolute/path/to/data/q-lab/flightdeck/repository-tour",
  flightlog: "/absolute/path/to/flightplan/scripts/flightlog.ts",
  repoRoot: "/absolute/path/to/working-repository",
  runId: "repository-tour-example-20260906T060000Z",
};
const resultSchema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

/*
 * One node, one prompt. The announce command embeds the absolute run directory for
 * transcript membership, and the run identifier separates transcripts when this
 * directory is reused. Building the prompt from `ref` is what keeps the announce
 * command, the state command, the end note, and the label on the same node: a
 * hand-copied block that changes four of the five leaves a fleet row with no spend,
 * which looks exactly like an agent that used no tokens. `work` is the only part
 * to adapt per node.
 */
function node(ref, work) {
  const label = `dev:${ref}#1`;
  const log = `bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task ${ref} --role dev --attempt 1 --agent "${label}"`;
  const state = `bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task ${ref}`;
  return [
    `${log} --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
${work}
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
${state} --state done --agent "${label}"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
${log} --phase end --message "<actual outcome>"`,
    { label, phase: "Inspect", schema: resultSchema },
  ];
}

phase("Inspect");

const inventory = await agent(
  ...node(
    "scout/01",
    `Inspect tracked source directories and entry points. Write an accurate inventory to "${CFG.runDir}/inventory.md". Do not assume a particular language or framework.`,
  ),
);

// Keep dependent work parked if its prerequisite did not declare success.
await parallel([
  async () => {
    if (!inventory?.ok) return;
    const guide = await agent(
      ...node(
        "build/01",
        `Read "${CFG.runDir}/inventory.md". Inspect the referenced source files and write a concise repository guide to "${CFG.runDir}/guide.md". Check every claim against the repository.`,
      ),
    );
    if (!guide?.ok) return;
    await agent(
      ...node(
        "build/02",
        `Read "${CFG.runDir}/guide.md" and "${CFG.runDir}/inventory.md". Check the guide against the repository. Write findings and corrections to "${CFG.runDir}/guide-review.md". Succeed only if no inaccurate claims remain in the guide.`,
      ),
    );
  },
  async () =>
    await agent(
      ...node(
        "scout/02",
        `Inspect repository documentation. Write a summary of documented setup and verification commands to "${CFG.runDir}/documentation.md". Cite their absolute source paths in that report.`,
      ),
    ),
  async () =>
    await agent(
      ...node(
        "audit/01",
        `Inspect tracked files for license evidence. Write evidence and any uncertainty to "${CFG.runDir}/license-evidence.md". If no evidence exists, report failure and request an owner decision; do not invent a license.`,
      ),
    ),
]);
