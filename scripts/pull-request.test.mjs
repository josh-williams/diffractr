import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { capturePullRequest, parsePullRequestUrl } from "./pull-request.mjs";
import { exportFeedback } from "../src/core/review.ts";
import { captureCommits } from "./capture.mjs";
import { saveCapture, loadCapture } from "./workflow.ts";

const roots = [];

const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

afterEach(() => {
  vi.unstubAllEnvs();

  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "diffractr-pr-test-"));
  roots.push(root);
  const remote = join(root, "remote");
  mkdirSync(remote);
  git(remote, "init", "-b", "main");
  git(remote, "config", "user.name", "Test");
  git(remote, "config", "user.email", "test@example.invalid");
  writeFileSync(join(remote, "file.txt"), "before\n");
  writeFileSync(join(remote, "removed.txt"), "remove me\n");
  git(remote, "add", ".");
  git(remote, "commit", "-qm", "initial");
  const mergeBase = git(remote, "rev-parse", "HEAD");
  git(remote, "switch", "-c", "feature");
  writeFileSync(join(remote, "file.txt"), "after\n");
  writeFileSync(join(remote, "empty.txt"), "");
  writeFileSync(join(remote, "image.png"), Buffer.from([0, 1, 2]));
  rmSync(join(remote, "removed.txt"));
  git(remote, "add", ".");
  git(remote, "commit", "-qm", "feature");
  const head = git(remote, "rev-parse", "HEAD");
  git(remote, "update-ref", "refs/pull/7/head", head);
  git(remote, "switch", "main");
  writeFileSync(join(remote, "base-only.txt"), "not in the PR\n");
  git(remote, "add", ".");
  git(remote, "commit", "-qm", "base advanced");
  const base = git(remote, "rev-parse", "HEAD");

  const info = {
    title: "A fork PR",
    base: { sha: base, ref: "main", label: "example:main" },
    head: { sha: head, ref: "feature", label: "contributor:feature" },
  };

  const bin = join(root, "bin");
  mkdirSync(bin);
  // A fake API boundary with real Git transport and object capture underneath.
  writeFileSync(
    join(bin, "gh"),
    "#!/usr/bin/env node\nprocess.stdout.write(process.env.DIFFRACTR_TEST_PR);\n",
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH}`);
  vi.stubEnv("DIFFRACTR_TEST_PR", JSON.stringify(info));
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", `url.${remote}.insteadOf`);
  vi.stubEnv("GIT_CONFIG_VALUE_0", "https://github.com/example/repo.git");

  return { root, remote, head, base, mergeBase, info };
}

it.each([
  "http://github.com/example/repo/pull/7",
  "https://other.example/example/repo/pull/7",
  "https://user@github.com/example/repo/pull/7",
  "https://github.com/example/repo/issues/7",
  "https://github.com/example/repo/pull/0",
])("rejects unsupported PR input %s", (url) =>
  expect(() => parsePullRequestUrl(url)).toThrow(),
);

it("canonicalizes PR links with a trailing slash and discussion fragment", () => {
  expect(
    parsePullRequestUrl("https://github.com/example/repo/pull/7/#discussion")
      .url,
  ).toBe("https://github.com/example/repo/pull/7");
});

it("captures fork head against the merge base, persists metadata, and reopens without the checkout", () => {
  const { root, head, base, mergeBase } = fixture();

  const result = capturePullRequest(
    "https://github.com/example/repo/pull/7",
    join(root, "review"),
  );

  expect(git(result.checkout, "rev-parse", "HEAD")).toBe(head);
  expect(readFileSync(join(result.checkout, "file.txt"), "utf8")).toBe(
    "after\n",
  );
  expect(result.snapshot).toMatchObject({
    head,
    baseCommit: base,
    mergeBase,
    branch: "contributor:feature",
    pullRequest: { number: 7, title: "A fork PR" },
  });
  expect(result.snapshot.files.map((file) => file.path)).toEqual([
    "empty.txt",
    "file.txt",
    "image.png",
    "removed.txt",
  ]);
  expect(
    result.snapshot.files.find((file) => file.path === "file.txt"),
  ).toMatchObject({ before: "before\n", after: "after\n" });
  expect(
    result.snapshot.files.find((file) => file.path === "image.png").notice,
  ).toBe("Binary content");
  const feedback = exportFeedback(result.snapshot, []);
  expect(feedback).toContain("https://github.com/example/repo/pull/7");
  expect(feedback).toContain(`Head: ${head}`);
  expect(feedback).toContain(`Base commit: ${base}`);
  saveCapture(result.snapshot, result.directory);
  writeFileSync(join(result.checkout, "file.txt"), "subsequent edit\n");
  expect(captureCommits(result.checkout, base, head).files).toEqual(
    result.snapshot.files,
  );
  rmSync(result.checkout, { recursive: true });
  expect(loadCapture(result.directory)).toMatchObject(result.snapshot);
});

it("refuses existing output without overwriting it", () => {
  const { root } = fixture();
  expect(() =>
    capturePullRequest("https://github.com/example/repo/pull/7", root),
  ).toThrow();
  expect(existsSync(join(root, "remote"))).toBe(true);
});

it("fails and removes partial output when the PR moves during capture", () => {
  const { root, info, base } = fixture();
  vi.stubEnv(
    "DIFFRACTR_TEST_PR",
    JSON.stringify({ ...info, head: { ...info.head, sha: base } }),
  );
  const output = join(root, "review");
  expect(() =>
    capturePullRequest("https://github.com/example/repo/pull/7", output),
  ).toThrow("head changed");
  expect(existsSync(output)).toBe(false);
});

it("explains API access failures without creating output", () => {
  const { root } = fixture();
  vi.stubEnv("DIFFRACTR_TEST_PR", "not API JSON");
  const output = join(root, "review");
  expect(() =>
    capturePullRequest("https://github.com/example/repo/pull/7", output),
  ).toThrow("gh auth login");
  expect(existsSync(output)).toBe(false);
});
