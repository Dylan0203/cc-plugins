export const meta = {
  name: "repository-tour",
  description: "Inspect a repository and write a guide without editing its source",
  phases: [{ title: "Inspect", detail: "Inventory, documentation, guide and license evidence" }],
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

// The announce command embeds the absolute run directory for transcript membership.
// The run identifier separates transcripts when this directory is reused.
phase("Inspect");

const inventory = await agent(`bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task scout/01 --role dev --attempt 1 --agent "dev:scout/01#1" --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
Inspect tracked source directories and entry points. Write an accurate inventory to "${CFG.runDir}/inventory.md". Do not assume a particular language or framework.
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task scout/01 --state done --agent "dev:scout/01#1"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task scout/01 --role dev --attempt 1 --agent "dev:scout/01#1" --phase end --message "<actual outcome>"`,
  { label: "dev:scout/01#1", phase: "Inspect", schema: resultSchema });

// Keep dependent work parked if its prerequisite did not declare success.
await parallel([
  async () => {
    if (!inventory?.ok) return;
    const guide = await agent(`bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task build/01 --role dev --attempt 1 --agent "dev:build/01#1" --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
Read "${CFG.runDir}/inventory.md". Inspect the referenced source files and write a concise repository guide to "${CFG.runDir}/guide.md". Check every claim against the repository.
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task build/01 --state done --agent "dev:build/01#1"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task build/01 --role dev --attempt 1 --agent "dev:build/01#1" --phase end --message "<actual outcome>"`,
  { label: "dev:build/01#1", phase: "Inspect", schema: resultSchema });
    if (!guide?.ok) return;
    await agent(`bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task build/02 --role dev --attempt 1 --agent "dev:build/02#1" --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
Read "${CFG.runDir}/guide.md" and "${CFG.runDir}/inventory.md". Check the guide against the repository. Write findings and corrections to "${CFG.runDir}/guide-review.md". Succeed only if no inaccurate claims remain in the guide.
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task build/02 --state done --agent "dev:build/02#1"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task build/02 --role dev --attempt 1 --agent "dev:build/02#1" --phase end --message "<actual outcome>"`,
  { label: "dev:build/02#1", phase: "Inspect", schema: resultSchema });
  },
  async () => await agent(`bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task scout/02 --role dev --attempt 1 --agent "dev:scout/02#1" --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
Inspect repository documentation. Write a summary of documented setup and verification commands to "${CFG.runDir}/documentation.md". Cite their absolute source paths in that report.
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task scout/02 --state done --agent "dev:scout/02#1"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task scout/02 --role dev --attempt 1 --agent "dev:scout/02#1" --phase end --message "<actual outcome>"`,
  { label: "dev:scout/02#1", phase: "Inspect", schema: resultSchema }),
  async () => await agent(`bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task audit/01 --role dev --attempt 1 --agent "dev:audit/01#1" --phase start
Execute the opening command before any work. This run's identifier is ${CFG.runId}.
Work in "${CFG.repoRoot}". Keep repository source unchanged and leave all changes unstaged. Do not commit.
Inspect tracked files for license evidence. Write evidence and any uncertainty to "${CFG.runDir}/license-evidence.md". If no evidence exists, report failure and request an owner decision; do not invent a license.
Only append to the trail. Never edit the graph, reset the trail, or replace the run identifier.
On success, execute:
bun "${CFG.flightlog}" state "${CFG.runDir}/.flightlog/run.jsonl" --task audit/01 --state done --agent "dev:audit/01#1"
On failure, use that state command with --state failed --message "<specific cause>" instead.
Return {"ok":true} only after success and its state append; otherwise return {"ok":false}.
On both successful and unsuccessful exits, execute the final command below, replacing the message with the actual outcome:
bun "${CFG.flightlog}" log "${CFG.runDir}/.flightlog/run.jsonl" --task audit/01 --role dev --attempt 1 --agent "dev:audit/01#1" --phase end --message "<actual outcome>"`,
  { label: "dev:audit/01#1", phase: "Inspect", schema: resultSchema }),
]);
