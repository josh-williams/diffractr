import { describe, expect, it } from "vitest";
import { analysis, snapshot } from "../examples/invitations";
import {
  exportFeedback,
  indexChanges,
  statistics,
  unitDiff,
  validateAnalysis,
  type Snapshot,
} from "./review";

function sample(before: string | null, after: string | null): Snapshot {
  return {
    id: "test",
    repository: "test",
    base: "main",
    branch: "feature",
    files: [
      { id: "file", path: "src/file.ts", role: "production", before, after },
    ],
  };
}
describe("analysis integrity", () => {
  it("accepts the complete example and places one source file in two behaviors", () => {
    expect(validateAnalysis(snapshot, analysis).errors).toEqual([]);
    expect(
      analysis.sections.every((s) =>
        s.unitIds.some((id) => id.startsWith("service:")),
      ),
    ).toBe(true);
  });
  it("rejects missing, duplicate, invented, and stale assignments", () => {
    const missing = structuredClone(analysis);
    missing.sections[0].unitIds.pop();
    expect(validateAnalysis(snapshot, missing).errors.join()).toContain(
      "Unassigned",
    );
    const duplicate = structuredClone(analysis);
    duplicate.sections[1].unitIds.push(duplicate.sections[0].unitIds[0]);
    expect(validateAnalysis(snapshot, duplicate).errors.join()).toContain(
      "more than once",
    );
    const invented = structuredClone(analysis);
    invented.sections[0].unitIds.push("invented");
    expect(validateAnalysis(snapshot, invented).errors.join()).toContain(
      "Unknown",
    );
    expect(
      validateAnalysis(snapshot, { ...analysis, snapshotId: "old" }).analysis,
    ).toBeNull();
  });
  it("rejects flags on another behavior, nonexistent files, and out-of-bounds lines", () => {
    const wrongSection = structuredClone(analysis);
    wrongSection.flags[0].sectionId = "resend";
    expect(validateAnalysis(snapshot, wrongSection).analysis).toBeNull();
    for (const anchor of [
      { ...analysis.flags[0].anchor, fileId: "missing" },
      { ...analysis.flags[0].anchor, end: 1000000 },
      { ...analysis.flags[0].anchor, start: 0 },
    ]) {
      const input = structuredClone(analysis);
      input.flags[0].anchor = anchor;
      expect(validateAnalysis(snapshot, input).analysis).toBeNull();
    }
  });
  it("rejects malformed output and duplicate section or flag identities", () => {
    expect(validateAnalysis(snapshot, {}).analysis).toBeNull();
    const input = structuredClone(analysis);
    input.sections[1].id = input.sections[0].id;
    input.flags.push(input.flags[0]);
    expect(validateAnalysis(snapshot, input).errors.join()).toContain(
      "Duplicate section",
    );
    expect(validateAnalysis(snapshot, input).errors.join()).toContain(
      "Duplicate flag",
    );
  });
});
describe("deterministic diff projection", () => {
  it.each([
    ["a\nb\nc\n", "a\nB\nc\n"],
    [null, "new\nfile\n"],
    ["deleted\nfile\n", null],
    ["a\n", "first\na\nlast\n"],
    ["first\na\nlast\n", "a\n"],
    ["same", "same\n"],
    ["before", "after"],
    ["", "one\n"],
  ])(
    "preserves source line numbers and counts for %j → %j",
    (before, after) => {
      const source = sample(before, after);
      const units = indexChanges(source);
      for (const unit of units) {
        const projected = unitDiff(source.files[0], unit, units, 0);
        expect(projected.hunks.reduce((n, h) => n + h.additionLines, 0)).toBe(
          unit.newCount,
        );
        expect(projected.hunks.reduce((n, h) => n + h.deletionLines, 0)).toBe(
          unit.oldCount,
        );
        if (unit.newCount)
          expect(projected.hunks[0].additionStart).toBe(unit.newStart + 1);
        if (unit.oldCount)
          expect(projected.hunks[0].deletionStart).toBe(unit.oldStart + 1);
      }
    },
  );
  it("separates nearby edits and prevents context expansion from showing another behavior", () => {
    const source = sample(
      "one\nold A\nshared\nold B\nend\n",
      "one\nnew A\nshared\nnew B\nend\n",
    );
    const units = indexChanges(source);
    expect(units).toHaveLength(2);
    const first = unitDiff(source.files[0], units[0], units, 100);
    expect(first.additionLines.join("")).toContain("new A");
    expect(first.additionLines.join("")).not.toContain("new B");
    expect(first.deletionLines.join("")).not.toContain("old B");
  });
  it("counts additions and deletions once, independently of semantic membership", () => {
    const source = sample(
      "one\nold A\nshared\nold B\nend\n",
      "one\nnew A\nshared\nnew B\nend\n",
    );
    expect(statistics(source)[0]).toEqual({
      role: "production",
      additions: 2,
      deletions: 2,
    });
    expect(indexChanges(sample("unchanged\n", "unchanged\n"))).toEqual([]);
  });
});
describe("feedback export", () => {
  it("includes snapshot, old-side anchors, and quoted removed code", () => {
    const source = sample("old\n", "new\n");
    const feedback = exportFeedback(source, [
      {
        id: "c",
        snapshotId: "test",
        fileId: "file",
        side: "deletions",
        start: 1,
        end: 1,
        body: "Keep this behavior.",
      },
    ]);
    expect(feedback).toContain("Snapshot: test");
    expect(feedback).toContain("old lines 1–1");
    expect(feedback).toContain("> old");
    expect(feedback).toContain("Keep this behavior.");
  });
  it("refuses stale snapshots and invalid line references", () => {
    const source = sample("old\n", "new\n");
    const c = {
      id: "c",
      snapshotId: "test",
      fileId: "file",
      side: "additions" as const,
      start: 1,
      end: 1,
      body: "Check",
    };
    expect(() => exportFeedback(source, [{ ...c, snapshotId: "old" }])).toThrow(
      "another snapshot",
    );
    expect(() => exportFeedback(source, [{ ...c, end: 20 }])).toThrow(
      "Invalid comment anchor",
    );
  });
});

describe("directional context expansion", () => {
  it("expands each side independently without changing source coordinates", () => {
    const source = sample(
      "a\nb\nc\nd\ne\nold\nf\ng\nh\ni\nj\n",
      "a\nb\nc\nd\ne\nnew\nf\ng\nh\ni\nj\n",
    );
    const units = indexChanges(source);
    const leading = unitDiff(source.files[0], units[0], units, {
      before: Infinity,
      after: 0,
    });
    expect(leading.hunks[0].additionStart).toBe(1);
    expect(leading.additionLines.join("")).toBe("a\nb\nc\nd\ne\nnew\n");
    const trailing = unitDiff(source.files[0], units[0], units, {
      before: 0,
      after: Infinity,
    });
    expect(trailing.hunks[0].additionStart).toBe(6);
    expect(trailing.additionLines.join("")).toBe("new\nf\ng\nh\ni\nj\n");
  });
});
