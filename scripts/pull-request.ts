import type { Snapshot } from "../src/core/review.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { captureCommits } from "./capture.ts";

export interface PullRequestLocation {
  owner: string;
  repo: string;
  number: string;
  url: string;
}

export interface PullRequestCapture {
  directory: string;
  checkout: string;
  snapshot: Snapshot & { pullRequest: NonNullable<Snapshot["pullRequest"]> };
}

export function parsePullRequestUrl(input: string): PullRequestLocation {
  const url = new URL(input);

  const match = url.pathname.match(
    /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)\/?$/,
  );

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    !match ||
    !Number.isSafeInteger(Number(match[3]))
  )
    throw new Error(
      "Expected a GitHub PR URL: https://github.com/OWNER/REPO/pull/NUMBER",
    );
  const [, owner, repo, number] = match;

  return {
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

const commit = z.string().regex(/^[a-f0-9]{40}$/);

const ref = z.object({
  sha: commit,
  ref: z.string().min(1),
  label: z.string().min(1),
});

const metadata = z.object({ title: z.string(), base: ref, head: ref });

export function capturePullRequest(
  input: string,
  output?: string,
): PullRequestCapture {
  const pr = parsePullRequestUrl(input);
  let info: z.infer<typeof metadata>;

  try {
    info = metadata.parse(
      JSON.parse(
        execFileSync(
          "gh",
          [
            "api",
            "--hostname",
            "github.com",
            `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
          ],
          {
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      ),
    );
  } catch {
    throw new Error(
      "Cannot read this PR. Install GitHub CLI and run gh auth login with an account that can access the repository.",
    );
  }

  const directory = output
    ? resolve(output)
    : mkdtempSync(join(tmpdir(), "diffractr-pr-"));

  if (output) mkdirSync(directory, { recursive: false });
  const checkout = join(directory, "checkout");

  try {
    mkdirSync(checkout);
    const hooks = join(directory, "empty-hooks");
    mkdirSync(hooks);

    const git = (args: string[]): string =>
      execFileSync(
        "git",
        [
          "-c",
          `core.hooksPath=${hooks}`,
          "-c",
          "credential.helper=",
          "-c",
          "credential.helper=!gh auth git-credential",
          ...args,
        ],
        {
          cwd: checkout,
          encoding: "utf8",
          maxBuffer: 128 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: devNull,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
            GIT_LFS_SKIP_SMUDGE: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

    git(["init", "--quiet", "--template="]);
    git([
      "remote",
      "add",
      "origin",
      `https://github.com/${pr.owner}/${pr.repo}.git`,
    ]);
    git([
      "fetch",
      "--no-tags",
      "origin",
      info.base.sha,
      `refs/pull/${pr.number}/head:refs/remotes/origin/pr`,
    ]);

    if (git(["rev-parse", "refs/remotes/origin/pr"]).trim() !== info.head.sha)
      throw new Error(
        "PR head changed during capture. Run capture again for the new revision.",
      );
    git(["checkout", "--quiet", "--detach", info.head.sha]);
    const source = captureCommits(checkout, info.base.sha, info.head.sha);

    const pullRequest = {
      url: pr.url,
      number: Number(pr.number),
      title: info.title,
    };

    const repository = `${pr.owner}/${pr.repo}`;

    const id = createHash("sha256")
      .update(JSON.stringify({ repository, ...source, pullRequest }))
      .digest("hex");

    return {
      directory,
      checkout,
      snapshot: {
        ...source,
        id,
        repository,
        branch: info.head.label,
        base: info.base.ref,
        capturedAt: new Date().toISOString(),
        pullRequest,
      },
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });

    if (error instanceof Error && error.message.startsWith("PR head changed"))
      throw error;
    throw new Error(
      "Could not fetch or check out the PR revisions. Check repository access and network connectivity, then retry.",
      { cause: error },
    );
  }
}
