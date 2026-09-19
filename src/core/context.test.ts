import { describe, expect, it } from "vitest";
import { contextLayout } from "./context.ts";
import { indexChanges, unitDiff, type SourceFile } from "./review.ts";

function fixture(gap: number) {
  const before = Array.from({ length: gap + 12 }, (_, i) => `line ${i}\n`);
  const after = [...before];
  after[4] = "changed first\n";
  after[gap + 5] = "changed second\n";

  const file: SourceFile = {
    id: "file",
    path: "file.ts",
    role: "production",
    before: before.join(""),
    after: after.join(""),
  };

  const units = indexChanges({
    id: "test",
    repository: "test",
    branch: "test",
    base: "main",
    files: [file],
  });

  return { file, units };
}

describe("shared diff context", () => {
  it.each([1, 3, 5, 6, 20])(
    "shows the %i-line middle gap once, including after expansion",
    (gap) => {
      const { file, units } = fixture(gap);

      for (const expanded of [{}, { [`${units[0].id}:after`]: true }]) {
        const layout = contextLayout(file, units, units, expanded);
        expect(layout[1].beforeGap.hidden).toBe(0);
        expect(
          layout[0].after + layout[0].afterGap.hidden + layout[1].before,
        ).toBe(gap);
        expect(layout[0].afterGap.hidden).toBe(
          Object.keys(expanded).length ? 0 : Math.max(0, gap - 6),
        );
        const first = unitDiff(file, units[0], units, layout[0]).hunks[0];
        const second = unitDiff(file, units[1], units, layout[1]).hunks[0];
        expect(
          first.additionStart + first.additionCount + layout[0].afterGap.hidden,
        ).toBe(second.additionStart);
        expect(
          first.deletionStart + first.deletionCount + layout[0].afterGap.hidden,
        ).toBe(second.deletionStart);
      }
    },
  );

  it("keeps file-edge controls and context bounded by changes in other groups", () => {
    const { file, units } = fixture(20);
    const layout = contextLayout(file, [units[0]], units, {});
    expect(layout[0].beforeGap.hidden).toBe(1);
    expect(layout[0].afterGap.hidden).toBe(17);

    const expanded = contextLayout(file, [units[0]], units, {
      [layout[0].afterGap.key]: true,
    });

    const diff = unitDiff(file, units[0], units, expanded[0]);
    expect(diff.additionLines.join("")).not.toContain("changed second");
  });

  it("does not add context to split fragments", () => {
    const { file, units } = fixture(20);
    units[1].split = true;
    const layout = contextLayout(file, units, units, {});
    expect(layout[1].before).toBe(0);
    expect(layout[1].after).toBe(0);
    expect(layout[1].beforeGap.hidden + layout[1].afterGap.hidden).toBe(0);
  });
});
