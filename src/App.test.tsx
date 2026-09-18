import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import App from "./App";
import type { Snapshot } from "./core/review";

const snapshot: Snapshot = {
  id: "local-snapshot",
  repository: "actual-repository",
  branch: "feature",
  base: "origin/trunk",
  files: [
    {
      id: "mode",
      path: "script.sh",
      before: "echo hello\n",
      after: "echo hello\n",
      role: "production",
      oldMode: "100644",
      newMode: "100755",
    },
    {
      id: "binary",
      path: "image.png",
      before: null,
      after: null,
      role: "other",
      notice: "Binary content",
    },
    {
      id: "empty",
      path: "empty.txt",
      before: null,
      after: "",
      role: "other",
      oldMode: null,
      newMode: "100644",
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

it("renders all metadata-only local files without example data or analysis errors", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const html = renderToString(<App snapshot={snapshot} />);

  for (const text of [
    "actual-repository",
    "origin/trunk",
    "script.sh",
    "image.png",
    "empty.txt",
    "Binary content",
    "100755",
  ])
    expect(html).toContain(text);

  for (const text of [
    "Team invitations",
    "Analysis unavailable",
    "Change groups",
  ])
    expect(html).not.toContain(text);
});

it("renders a clean repository as an empty review", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const html = renderToString(<App snapshot={{ ...snapshot, files: [] }} />);
  expect(html).toContain("No local changes");
  expect(html).not.toContain("Analysis unavailable");
});

it("shows PR identity and pinned revisions without labeling it as local changes", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });

  const html = renderToString(
    <App
      snapshot={{
        ...snapshot,
        head: "a".repeat(40),
        baseCommit: "b".repeat(40),
        mergeBase: "c".repeat(40),
        pullRequest: {
          url: "https://github.com/example/repo/pull/7",
          number: 7,
          title: "Update startup assets",
        },
      }}
    />,
  );

  expect(html).toContain("https://github.com/example/repo/pull/7");
  expect(html).toContain("Update startup assets");
  expect(html).toContain("aaaaaaaaaaaa");
  expect(html).toContain("bbbbbbbbbbbb");
  expect(html).toContain("cccccccccccc");
  expect(html).toContain("PR snapshot");
  expect(html).not.toContain("Local changes");
});
