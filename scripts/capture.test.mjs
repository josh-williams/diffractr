import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { capture } from "./capture.mjs";
import { serveSnapshot } from "./review.mjs";
import { snapshotSchema } from "../src/core/snapshot";
import { indexChanges, unitDiff, exportFeedback } from "../src/core/review";
const roots = [];
const git = (root, ...args) =>
  execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
function write(root, path, data) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "diffraction-test-"));
  roots.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.invalid");
  write(root, ".gitignore", "*.ignored\n");
  write(root, "src/file.ts", "const first = 1;\nconst second = 2;\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture");
  git(root, "switch", "-c", "feature");
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("local snapshot capture", () => {
  it("combines committed, staged, unstaged and untracked changes without touching the index", () => {
    const root = fixture();
    write(root, "src/committed.ts", "export const value = 1;\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "feature");
    write(root, "src/file.ts", "staged\n");
    git(root, "add", ".");
    write(root, "src/file.ts", "working\n");
    write(root, "test/new.test.ts", "test\n");
    write(root, "secret.ignored", "excluded");
    const index = readFileSync(join(root, ".git/index"));
    const result = snapshotSchema.parse(capture(root));
    expect(result.files.map((f) => f.path)).toEqual([
      "src/committed.ts",
      "src/file.ts",
      "test/new.test.ts",
    ]);
    expect(result.files.find((f) => f.path === "src/file.ts")).toMatchObject({
      before: "const first = 1;\nconst second = 2;\n",
      after: "working\n",
    });
    expect(result.files.at(-1).role).toBe("tests");
    expect(readFileSync(join(root, ".git/index"))).toEqual(index);
    expect(capture(root).id).toBe(result.id);
    const units = indexChanges(result);
    for (const unit of units)
      expect(
        unitDiff(
          result.files.find((f) => f.id === unit.fileId),
          unit,
          units,
        ).hunks.length,
      ).toBeGreaterThan(0);
    const file = result.files.find((f) => f.path === "src/file.ts");
    expect(
      exportFeedback(result, [
        {
          id: "comment",
          snapshotId: result.id,
          fileId: file.id,
          side: "additions",
          start: 1,
          end: 1,
          body: "Please check this.",
        },
      ]),
    ).toContain("> working");
  });
  it("captures deletions, empty additions, modes, and renames as delete/add without losing files", () => {
    const root = fixture();
    git(root, "mv", "src/file.ts", "src/renamed.ts");
    write(root, "empty", "");
    chmodSync(join(root, ".gitignore"), 0o755);
    const result = capture(root);
    expect(result.files.map((f) => f.path)).toEqual([
      ".gitignore",
      "empty",
      "src/file.ts",
      "src/renamed.ts",
    ]);
    expect(result.files.find((f) => f.path === "empty")).toMatchObject({
      before: null,
      after: "",
    });
    expect(result.files.find((f) => f.path === ".gitignore")).toMatchObject({
      oldMode: "100644",
      newMode: "100755",
    });
  });
  it("omits staged changes that are reverted on disk and retains ignored tracked files", () => {
    const root = fixture();
    const original = readFileSync(join(root, "src/file.ts"));
    write(root, "src/file.ts", "staged");
    git(root, "add", ".");
    write(root, "src/file.ts", original);
    write(root, "tracked.ignored", "included");
    git(root, "add", "-f", "tracked.ignored");
    expect(capture(root).files.map((f) => f.path)).toEqual(["tracked.ignored"]);
  });
  it("reports binary, invalid encoding, large files and links without reading link targets", () => {
    const root = fixture();
    write(root, "binary", Buffer.from([1, 0, 2]));
    write(root, "encoding", Buffer.from([255]));
    write(root, "large", Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    symlinkSync("/does/not/exist", join(root, "link"));
    const result = capture(root);
    expect(result.files).toHaveLength(4);
    expect(
      result.files.every(
        (f) => f.notice && f.before === null && f.after === null,
      ),
    ).toBe(true);
    expect(indexChanges(result)).toEqual([]);
    const first = result.id;
    rmSync(join(root, "link"));
    symlinkSync("/different", join(root, "link"));
    expect(capture(root).id).not.toBe(first);
  });
  it("uses the merge base, excluding unrelated changes added on main", () => {
    const root = fixture();
    write(root, "feature.txt", "feature");
    git(root, "add", ".");
    git(root, "commit", "-m", "feature");
    git(root, "switch", "main");
    write(root, "main.txt", "main");
    git(root, "add", ".");
    git(root, "commit", "-m", "main");
    git(root, "switch", "feature");
    expect(capture(root).files.map((f) => f.path)).toEqual(["feature.txt"]);
  });
  it("prefers origin default metadata and requires an override for ambiguous local defaults", () => {
    const root = fixture();
    git(root, "branch", "master");
    expect(() => capture(root)).toThrow("Specify --base");
    expect(capture(root, { base: "main" }).files).toEqual([]);
    git(root, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    git(
      root,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/trunk",
    );
    expect(capture(root).base).toBe("origin/trunk");
    expect(() => capture(root, { base: "missing" })).toThrow(
      "does not resolve",
    );
  });
  it("retries a concurrent edit and rejects a continuously changing capture", () => {
    const root = fixture();
    let changed = false;
    const result = capture(root, {
      afterRead: () => {
        if (!changed) {
          write(root, "src/file.ts", "new\n");
          changed = true;
        }
      },
    });
    expect(result.files[0].after).toBe("new\n");
    expect(() =>
      capture(root, {
        afterRead: (attempt) => write(root, "src/file.ts", `${attempt}\n`),
      }),
    ).toThrow("changed during capture");
  });
  it("supports detached HEAD, worktrees and unusual filenames", () => {
    const root = fixture();
    const worktree = join(root, "..", basenameForTest(root));
    roots.push(worktree);
    git(root, "worktree", "add", "--detach", worktree, "HEAD");
    write(worktree, 'odd\nname\t".ts', "hello\n");
    const result = capture(worktree);
    expect(result.branch).toContain("detached");
    const units = indexChanges(result);
    expect(unitDiff(result.files[0], units[0], units).name).toBe(
      'odd\nname\t".ts',
    );
  });
  it("rejects unresolved conflicts", () => {
    const root = fixture();
    write(root, "src/file.ts", "feature");
    git(root, "add", ".");
    git(root, "commit", "-m", "feature");
    git(root, "switch", "main");
    write(root, "src/file.ts", "main");
    git(root, "add", ".");
    git(root, "commit", "-m", "main");
    git(root, "switch", "feature");
    try {
      git(root, "merge", "main");
    } catch {}
    expect(() => capture(root)).toThrow("Resolve merge conflicts");
  });
});
function basenameForTest(root) {
  return root.split("/").at(-1) + "-worktree";
}
it("serves a fixed snapshot only with its token and same-origin host", async () => {
  const root = fixture();
  write(root, "src/file.ts", "captured\n");
  const snapshot = capture(root);
  const dist = join(root, "ui");
  write(dist, "index.html", "<html>review</html>");
  const { server, url } = await serveSnapshot(snapshot, { dist });
  try {
    const parsed = new URL(url),
      token = new URLSearchParams(parsed.hash.slice(1)).get("snapshot");
    expect((await fetch(parsed.origin)).status).toBe(200);
    expect((await fetch(parsed.origin + "/api/snapshot")).status).toBe(403);
    expect(
      (
        await fetch(parsed.origin + "/api/snapshot", {
          headers: {
            authorization: `Bearer ${token}`,
            origin: "https://other.invalid",
          },
        })
      ).status,
    ).toBe(403);
    write(root, "src/file.ts", "later\n");
    const response = await fetch(parsed.origin + "/api/snapshot", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await response.json()).files[0].after).toBe("captured\n");
    expect((await fetch(parsed.origin + "/.git/config")).status).toBe(404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
