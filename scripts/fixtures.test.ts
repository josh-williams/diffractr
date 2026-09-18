import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadCapture, readAnalysis } from "./workflow.ts";
import { inventoryText } from "../src/core/analysis.ts";
import { indexChanges, statistics, unitDiff } from "../src/core/review.ts";

const root = "tests/fixtures/reviews";

it.each([
  ["cross-file", 6, 2, 2],
  ["split-block", 1, 2, 1],
  ["metadata-only", 3, 1, 1],
])(
  "reopens saved %s with complete coverage and stable counts",
  (name, files, groups, flags) => {
    const dir = join(root, name);
    const snapshot = loadCapture(dir);
    const result = readAnalysis(snapshot, join(dir, "analysis.yaml"));

    expect(snapshot.files).toHaveLength(files);
    expect(result.errors).toEqual([]);
    expect(result.analysis?.sections).toHaveLength(groups);
    expect(result.analysis?.flags).toHaveLength(flags);
    expect(statistics(snapshot, result.units)).toEqual(statistics(snapshot));
    expect(inventoryText(snapshot)).toBe(
      readFileSync(join(dir, "diff.txt"), "utf8"),
    );
  },
);

it("preserves split fixture source coordinates, content, and flag ownership", () => {
  const dir = join(root, "split-block");
  const snapshot = loadCapture(dir);
  const result = readAnalysis(snapshot, join(dir, "analysis.yaml"));

  const patches = result.units.map((unit) =>
    unitDiff(snapshot.files[0], unit, indexChanges(snapshot), {
      before: Infinity,
      after: Infinity,
    }),
  );

  expect(patches.map((patch) => patch.additionLines.join(""))).toEqual([
    "  timeout: 5000,\n",
    "  retries: 3,\n",
  ]);
  expect(patches.map((patch) => patch.deletionLines.join(""))).toEqual([
    "  timeout: 1000,\n",
    "  retries: 1,\n",
  ]);
  expect(patches.map((patch) => patch.hunks[0].additionStart)).toEqual([2, 3]);
  expect(result.analysis?.flags[0]).toMatchObject({
    sectionId: "group-2",
    anchor: { side: "additions", start: 3, end: 3 },
  });
});

it("preserves metadata-only ownership without inventing changed lines", () => {
  const dir = join(root, "metadata-only");
  const snapshot = loadCapture(dir);
  const result = readAnalysis(snapshot, join(dir, "analysis.yaml"));

  expect(snapshot.inventory?.map((block) => block.kind)).toEqual([
    "metadata",
    "metadata",
    "metadata",
  ]);
  expect(result.analysis?.flags[0].anchor).toBeUndefined();
  expect(
    statistics(snapshot).every(
      (row) => row.additions === 0 && row.deletions === 0,
    ),
  ).toBe(true);
});
