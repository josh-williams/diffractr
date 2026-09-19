import { afterEach, expect, it } from "vitest";
import { DiffHunksRenderer, disposeHighlighter } from "@pierre/diffs";
import { preloadReviewLanguages } from "./highlighting";
import { fileDiff, indexChanges, unitDiff, type Snapshot } from "./core/review";

afterEach(() => disposeHighlighter());

it.each([
  [
    "before.mjs",
    "after.ts",
    "const value = 1;\n",
    "const value: number = 2;\n",
  ],
  ["before.py", "after.js", "value = 1\n", "const value = 2;\n"],
])(
  "highlights both sides of %s → %s in full and projected diffs",
  async (oldPath, path, before, after) => {
    const snapshot: Snapshot = {
      id: "rename",
      repository: "test",
      branch: "feature",
      base: "main",
      files: [{ id: "file", oldPath, path, before, after, role: "production" }],
    };

    await preloadReviewLanguages(snapshot);
    const file = snapshot.files[0];
    const units = indexChanges(snapshot);

    for (const diff of [fileDiff(file), unitDiff(file, units[0], units)]) {
      const renderer = new DiffHunksRenderer({
        theme: "pierre-dark",
        diffStyle: "split",
      });

      try {
        const rendered = await renderer.asyncRender(diff);
        const html = renderer.renderFullHTML(rendered);
        expect(html).toContain("value");
        expect(html).toContain('data-line-type="change-deletion"');
        expect(html).toContain('data-line-type="change-addition"');
      } finally {
        renderer.cleanUp();
      }
    }
  },
);
