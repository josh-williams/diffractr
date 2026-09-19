import { describe, expect, it } from "vitest";
import {
  analysisSchema,
  inventory,
  inventoryText,
  parseAnalysis,
  selectRows,
  validateAnalysis,
  type AuthoredAnalysis,
} from "./analysis.ts";
import { indexChanges, unitDiff, type Snapshot } from "./review.ts";

const source: Snapshot = {
  id: "snapshot",
  repository: "repo",
  branch: "feature",
  base: "main",
  files: [
    {
      id: "file",
      path: "src/settings.ts",
      role: "production",
      before: "context\nold A\nold B\nend\n",
      after: "context\nnew A\nnew B\nend\n",
    },
  ],
};

function documentFor(snapshot = source): AuthoredAnalysis {
  return {
    version: 1,
    snapshotId: snapshot.id,
    title: "Review",
    description: "Overview",
    groups: [
      {
        title: "Behavior",
        description: "Explanation",
        changes: inventory(snapshot).map((b) => ({ block: b.id })),
      },
    ],
    flags: [],
  };
}

describe("block inventory and row selectors", () => {
  it("numbers source rows once, showing old/new coordinates and context", () => {
    const block = inventory(source)[0];
    expect(block.rows.map((r) => [r.n, r.op, r.oldLine, r.newLine])).toEqual([
      [1, " ", 1, 1],
      [2, "-", 2, undefined],
      [3, "-", 3, undefined],
      [4, "+", undefined, 2],
      [5, "+", undefined, 3],
      [6, " ", 4, 4],
    ]);
    expect(selectRows(block).map((r) => r.n)).toEqual([2, 3, 4, 5]);
    expect(selectRows(block, "1-4, 6").map((r) => r.n)).toEqual([2, 3, 4]);
    expect(inventoryText(source)).toContain("2 - old A");
  });
  it.each([
    "0",
    "7",
    "3-2",
    "2, 2",
    "2-4, 4-5",
    "2-999999999999999999",
    "1, 6",
    "-2",
    "2-",
    "2.5",
    "2,,3",
  ])("rejects invalid selector %s", (rows) =>
    expect(() => selectRows(inventory(source)[0], rows)).toThrow(),
  );
  it("gives metadata changes explicit whole-block ownership", () => {
    const snapshot: Snapshot = {
      ...source,
      files: [
        { ...source.files[0], oldMode: "100644", newMode: "100755" },
        {
          id: "image",
          path: "image.png",
          before: null,
          after: null,
          role: "other",
          notice: "Binary content",
        },
        { id: "empty", path: "empty", before: null, after: "", role: "other" },
      ],
    };

    const blocks = inventory(snapshot);
    expect(blocks.filter((b) => b.kind === "metadata")).toHaveLength(3);
    const doc = documentFor(snapshot);
    expect(validateAnalysis(snapshot, doc).errors).toEqual([]);
    const metadata = blocks.find((b) => b.kind === "metadata")!;
    expect(() => selectRows(metadata, "1")).toThrow("does not accept rows");
    doc.groups[0].changes = doc.groups[0].changes.filter(
      (c) => c.block !== metadata.id,
    );
    expect(validateAnalysis(snapshot, doc).errors.join()).toContain(
      "Unassigned",
    );
  });
});

describe("group resolution and projection", () => {
  it("splits adjacent replacements without leaking code, losing counts or changing line coordinates", () => {
    const doc = documentFor();
    doc.groups = [
      {
        title: "A",
        description: "A",
        changes: [{ block: "B1", rows: "2, 4" }],
      },
      {
        title: "B",
        description: "B",
        changes: [{ block: "B1", rows: "3, 5" }],
      },
    ];
    const result = validateAnalysis(source, doc);
    expect(result.errors).toEqual([]);
    expect(
      result.units.map((u) => [u.oldStart, u.newStart, u.oldCount, u.newCount]),
    ).toEqual([
      [1, 1, 1, 1],
      [2, 2, 1, 1],
    ]);

    for (const [i, unit] of result.units.entries()) {
      const patch = unitDiff(source.files[0], unit, indexChanges(source), {
        before: Infinity,
        after: Infinity,
      });

      expect(patch.deletionLines.join("")).toBe(i ? "old B\n" : "old A\n");
      expect(patch.additionLines.join("")).toBe(i ? "new B\n" : "new A\n");
      expect(patch.hunks[0].additionStart).toBe(i + 2);
    }
  });
  it("rejects missing, overlapping, invented, stale and model-generated identity fields", () => {
    const doc = documentFor();
    doc.groups[0].changes[0].rows = "2, 4";
    expect(validateAnalysis(source, doc).errors.join()).toContain(
      "Unassigned B1",
    );
    const duplicated = documentFor();
    duplicated.groups.push(duplicated.groups[0]);
    expect(validateAnalysis(source, duplicated).errors.join()).toContain(
      "more than once",
    );
    const unknown = documentFor();
    unknown.groups[0].changes[0].block = "B999";
    expect(validateAnalysis(source, unknown).errors.join()).toContain(
      "Unknown block",
    );
    expect(
      validateAnalysis(source, { ...documentFor(), snapshotId: "stale" })
        .analysis,
    ).toBeNull();
    expect(
      analysisSchema.safeParse({ ...documentFor(), id: "invented" }).success,
    ).toBe(false);
  });
  it("combines separate selectors for the same group before projection", () => {
    const doc = documentFor();
    doc.groups[0].changes = [
      { block: "B1", rows: "2-3" },
      { block: "B1", rows: "4-5" },
    ];
    const result = validateAnalysis(source, doc);
    expect(result.errors).toEqual([]);
    expect(result.units).toEqual(indexChanges(source));
  });
  it("handles disjoint pure insertions, deletions and missing final newline", () => {
    for (const [before, after] of [
      [null, "a\nb\nc"],
      ["a\nb\nc", null],
    ] as const) {
      const snapshot = {
        ...source,
        files: [{ ...source.files[0], before, after }],
      };

      const doc = documentFor(snapshot);
      doc.groups = [
        {
          title: "Outer",
          description: "Outer",
          changes: [{ block: "B1", rows: "1, 3" }],
        },
        {
          title: "Middle",
          description: "Middle",
          changes: [{ block: "B1", rows: "2" }],
        },
      ];
      const result = validateAnalysis(snapshot, doc);
      expect(result.errors).toEqual([]);

      const texts = result.units.map((u) =>
        unitDiff(snapshot.files[0], u, indexChanges(snapshot), {
          before: 100,
          after: 100,
        }),
      );

      expect(
        texts
          .map((p) => (after ? p.additionLines : p.deletionLines).join(""))
          .sort(),
      ).toEqual(["a\n", "b\n", "c"]);
    }
  });
  it("allows a clean snapshot with no groups", () =>
    expect(
      validateAnalysis(
        { ...source, files: [] },
        { ...documentFor(), groups: [] },
      ).errors,
    ).toEqual([]));
});

describe("flag anchors", () => {
  it("derives ownership and anchors new-side or deleted rows", () => {
    const doc = documentFor();
    doc.flags = [{ text: "Check this", anchor: { block: "B1", rows: "2, 4" } }];
    const result = validateAnalysis(source, doc);
    expect(result.analysis?.flags[0]).toMatchObject({
      text: "Check this",
      sectionId: "group-1",
      anchor: { side: "additions", start: 2, end: 2 },
    });
    doc.flags[0].anchor.rows = "2";
    expect(validateAnalysis(source, doc).analysis?.flags[0].anchor?.side).toBe(
      "deletions",
    );
  });
  it("rejects a flag spanning groups or only context", () => {
    const doc = documentFor();
    doc.groups = [
      {
        title: "A",
        description: "A",
        changes: [{ block: "B1", rows: "2, 4" }],
      },
      {
        title: "B",
        description: "B",
        changes: [{ block: "B1", rows: "3, 5" }],
      },
    ];
    doc.flags = [{ text: "Check", anchor: { block: "B1" } }];
    expect(validateAnalysis(source, doc).errors.join()).toContain(
      "exactly one group",
    );
    doc.flags[0].anchor.rows = "1";
    expect(validateAnalysis(source, doc).errors.join()).toContain(
      "no changed rows",
    );
  });
  it("anchors non-text flags without inventing source lines", () => {
    const snapshot = {
      ...source,
      files: [
        {
          ...source.files[0],
          before: null,
          after: null,
          notice: "Binary content",
        },
      ],
    };

    const doc = documentFor(snapshot);
    doc.flags = [{ text: "Check image", anchor: { block: "B1" } }];
    const result = validateAnalysis(snapshot, doc);
    expect(result.errors).toEqual([]);
    expect(result.analysis?.flags[0].anchor).toBeUndefined();
  });
});

it("parses YAML markdown while rejecting duplicate keys and aliases", () => {
  expect(
    parseAnalysis(
      "version: 1\nsnapshotId: snapshot\ntitle: Review\ngroups: []\ndescription: |\n  **Behavior**\n  ```mermaid\n  graph LR\n  A --> B\n  ```\n",
    ),
  ).toMatchObject({ description: expect.stringContaining("```mermaid") });
  expect(() => parseAnalysis("title: A\ntitle: B")).toThrow();
  expect(() => parseAnalysis("a: &x [1]\nb: *x")).toThrow();
});

it("requires rename ownership independently of edits and preserves mode metadata", () => {
  const snapshot: Snapshot = {
    ...source,
    files: [
      {
        ...source.files[0],
        oldPath: "src/settings.js",
        renameSimilarity: 75,
        oldMode: "100644",
        newMode: "100755",
      },
    ],
  };

  const blocks = inventory(snapshot);
  expect(blocks.map((block) => block.kind)).toEqual(["text", "metadata"]);
  expect(blocks[1].notice).toContain(
    'Renamed "src/settings.js" → "src/settings.ts"',
  );
  expect(blocks[1].notice).toContain("Git similarity 75%");
  expect(blocks[1].notice).toContain("Mode 100644 → 100755");
  const authored = documentFor(snapshot);
  authored.groups[0].changes = [{ block: blocks[0].id }];
  expect(validateAnalysis(snapshot, authored).errors).toContainEqual(
    expect.stringContaining(`Unassigned ${blocks[1].id}`),
  );
  authored.groups.push({
    title: "Rename",
    description: "Move the file",
    changes: [{ block: blocks[1].id }],
  });
  const resolved = validateAnalysis(snapshot, authored);
  expect(resolved.errors).toEqual([]);
  expect(resolved.analysis?.sections[0].metadataFileIds).toEqual([]);
  expect(resolved.analysis?.sections[1].metadataFileIds).toEqual(["file"]);
  authored.groups[0].changes.push({ block: blocks[1].id });
  expect(validateAnalysis(snapshot, authored).errors).toContainEqual(
    expect.stringContaining("assigned more than once"),
  );
  expect(inventoryText(snapshot)).toContain(
    '"src/settings.js" → "src/settings.ts"',
  );
});

it("keeps unchanged and empty renames visible with no text changes", () => {
  for (const text of ["", "unchanged\n"]) {
    const snapshot: Snapshot = {
      ...source,
      files: [
        { ...source.files[0], oldPath: "old.ts", before: text, after: text },
      ],
    };

    expect(indexChanges(snapshot)).toEqual([]);
    expect(inventory(snapshot)).toMatchObject([
      {
        kind: "metadata",
        rows: [],
        notice: expect.stringContaining("Renamed"),
      },
    ]);
    expect(validateAnalysis(snapshot, documentFor(snapshot)).errors).toEqual(
      [],
    );
  }
});
