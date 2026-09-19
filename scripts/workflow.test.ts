import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { saveCapture, loadCapture, readAnalysis } from "./workflow.ts";
import { snapshot, analysis } from "../src/examples/invitations.ts";
import {
  inventory,
  inventoryText,
  validateAnalysis,
} from "../src/core/analysis.ts";
import { indexChanges } from "../src/core/review.ts";
import { snapshotSchema } from "../src/core/snapshot.ts";
import { z } from "zod";
import { stringify } from "yaml";

const savedCaptureSchema = z.object({
  version: z.number(),
  digest: z.string(),
  snapshot: snapshotSchema.extend({
    inventory: snapshotSchema.shape.inventory.unwrap(),
  }),
});

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

it("saves, validates, and reopens analysis without recapturing the repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-workflow-"));
  dirs.push(dir);
  saveCapture(snapshot, dir);
  expect(loadCapture(dir)).toEqual({
    ...snapshot,
    inventory: inventory(snapshot),
  });
  const path = join(dir, "analysis.yaml");
  writeFileSync(path, stringify(analysis));
  expect(readAnalysis(loadCapture(dir), path).errors).toEqual([]);

  const output = execFileSync("node", ["scripts/cli.ts", "validate", dir], {
    encoding: "utf8",
  });

  expect(output).toContain("2 groups, 2 flags");
  expect(
    execFileSync("node", ["scripts/cli.ts", "inspect", dir, "--block", "B1"], {
      encoding: "utf8",
    }),
  ).toContain('"id": "B1"');

  const saved = savedCaptureSchema.parse(
    JSON.parse(readFileSync(join(dir, "capture.json"), "utf8")),
  );

  saved.snapshot.files[0].after = "corrupted";
  writeFileSync(join(dir, "capture.json"), JSON.stringify(saved));
  expect(() => loadCapture(dir)).toThrow("checksum");
});

it("keeps malformed analysis recoverable and refuses capture overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-workflow-"));
  dirs.push(dir);
  saveCapture(snapshot, dir);
  writeFileSync(join(dir, "analysis.yaml"), "groups: [");
  expect(
    readAnalysis(snapshot, join(dir, "analysis.yaml")).analysis,
  ).toBeNull();
  expect(() => saveCapture(snapshot, dir)).toThrow();
});

it("preserves saved block IDs, row mappings and units across reopening and browser parsing", () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-workflow-"));
  dirs.push(dir);

  // Simulate a historical numbering scheme unlike the current generator.
  const blocks = inventory(snapshot).map((b) => ({
    ...b,
    id: `saved-${b.id}`,
  }));

  const captured = { ...snapshot, inventory: blocks };
  saveCapture(captured, dir);
  const reopened = snapshotSchema.parse(loadCapture(dir));
  expect(inventory(reopened)).toEqual(blocks);
  expect(indexChanges(reopened)).toEqual(
    blocks.flatMap((b) => (b.unit ? [b.unit] : [])),
  );
  expect(inventoryText(reopened)).toEqual(
    readFileSync(join(dir, "diff.txt"), "utf8"),
  );
  const authored = structuredClone(analysis);

  for (const g of authored.groups)
    for (const c of g.changes) c.block = `saved-${c.block}`;

  for (const f of authored.flags) f.anchor.block = `saved-${f.anchor.block}`;
  expect(validateAnalysis(reopened, authored).errors).toEqual([]);

  const envelope = savedCaptureSchema.parse(
    JSON.parse(readFileSync(join(dir, "capture.json"), "utf8")),
  );

  envelope.snapshot.inventory[0].rows[0].text = "modified inventory";
  writeFileSync(join(dir, "capture.json"), JSON.stringify(envelope));
  expect(() => loadCapture(dir)).toThrow("checksum");
});

it("rejects legacy captures instead of silently reinterpreting their references", () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-workflow-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "capture.json"),
    JSON.stringify({ version: 1, snapshot }),
  );
  expect(() => loadCapture(dir)).toThrow("saved block inventory");
});
