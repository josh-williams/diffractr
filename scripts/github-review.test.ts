import assert from "node:assert/strict";
import { z } from "zod";
import type { Snapshot } from "../src/core/review.ts";
import type {
  GitHubReview,
  GitHubComment,
  GitHubPayload,
  JsonValue,
  ReviewState,
} from "./github-review.ts";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReviewService,
  inPatch,
  GitHubValidationError,
  githubRequest,
} from "./github-review.ts";
import { serveSnapshot } from "./server.ts";
import { reviewStateSchema } from "../src/core/github-feedback.ts";

const snapshot = {
  id: "capture",
  branch: "feature",
  base: "main",
  repository: "acme/project",
  head: "a".repeat(40),
  mergeBase: "b".repeat(40),
  pullRequest: {
    url: "https://github.com/acme/project/pull/3",
    number: 3,
    title: "Change",
  },
  files: [
    {
      id: "f1",
      role: "production",
      path: "src/file.ts",
      before: "old\ncontext\nexpanded",
      after: "new\ncontext\nexpanded",
    },
  ],
} satisfies Snapshot;

const patch = "@@ -1,2 +1,2 @@\n-old\n+new\n context";

interface FixtureWorld {
  user: string;
  head: string;
  base: string;
  mergeBase: string;
  patch: string;
  filename: string;
  previousFilename?: string;
  failThread: boolean;
  uncertainThread: boolean;
  loseReply: boolean;
}

function fixture() {
  const reviews: GitHubReview[] = [];
  const comments: (GitHubComment & { pull_request_review_id: number })[] = [];
  const calls: { method: string; endpoint: string; body: GitHubPayload }[] = [];

  const world: FixtureWorld = {
    user: "reviewer",
    head: snapshot.head,
    base: "c".repeat(40),
    mergeBase: snapshot.mergeBase,
    patch,
    filename: "src/file.ts",
    previousFilename: undefined,
    failThread: false,
    uncertainThread: false,
    loseReply: false,
  };

  async function request(
    method: string,
    endpoint: string,
    body: GitHubPayload = {},
  ): Promise<JsonValue> {
    calls.push({ method, endpoint, body });
    const path = endpoint.split("?")[0];

    if (method === "GET") {
      if (path === "user") return { login: world.user };

      if (path.endsWith("/pulls/3"))
        return {
          user: { login: "author" },
          head: { sha: world.head },
          base: { sha: world.base },
          state: "open",
        };

      if (path.endsWith("/reviews")) return structuredClone(reviews);

      if (path.includes("/compare/"))
        return {
          merge_base_commit: { sha: world.mergeBase },
          files: [
            {
              filename: world.filename,
              previous_filename: world.previousFilename,
              patch: world.patch,
            },
          ],
        };

      if (path.endsWith("/comments"))
        return structuredClone(
          comments.filter(
            (c) => c.pull_request_review_id === Number(path.split("/").at(-2)),
          ),
        );
    }

    if (method === "POST" && path.endsWith("/reviews")) {
      assert(body.body !== undefined && body.commit_id);

      const review = {
        id: reviews.length + 1,
        node_id: `review-${reviews.length + 1}`,
        body: body.body,
        commit_id: body.commit_id,
        state: "PENDING",
        user: { login: world.user },
        html_url: "https://github.com/acme/project/pull/3#review",
      };

      reviews.push(review);

      return structuredClone(review);
    }

    if (method === "POST" && path === "graphql") {
      if (world.failThread)
        throw new GitHubValidationError("Location rejected");

      if (world.uncertainThread) throw new Error("Connection interrupted");
      assert(body.variables);
      const input = body.variables.input;

      const review = reviews.find(
        (r) => r.node_id === input.pullRequestReviewId,
      );

      assert(review);
      comments.push({
        id: comments.length + 1,
        pull_request_review_id: review.id,
        body: input.body,
        path: input.path,
        side: input.side,
        line: input.line,
        original_line: input.line,
        start_line: input.startLine ?? null,
        original_start_line: input.startLine ?? null,
        commit_id: review.commit_id,
        original_commit_id: review.commit_id,
      });

      if (world.loseReply) throw new Error("Connection interrupted");

      return {
        data: { addPullRequestReviewThread: { thread: { id: "thread" } } },
      };
    }

    if (method === "PUT") {
      const review = reviews.find(
        (r) => r.id === Number(path.split("/").at(-1)),
      );

      assert(review && body.body !== undefined);
      review.body = body.body;

      return {};
    }

    if (path.endsWith("/events")) {
      const review = reviews.find(
        (r) => r.id === Number(path.split("/").at(-2)),
      );

      assert(review && body.body !== undefined);
      review.body = body.body;
      review.state =
        body.event === "APPROVE"
          ? "APPROVED"
          : body.event === "COMMENT"
            ? "COMMENTED"
            : "CHANGES_REQUESTED";

      return structuredClone(review);
    }

    if (method === "PATCH") {
      const comment = comments.find(
        (c) => c.id === Number(path.split("/").at(-1)),
      );

      assert(comment && body.body !== undefined);
      comment.body = body.body;

      return {};
    }

    if (method === "DELETE") {
      comments.splice(
        comments.findIndex((c) => c.id === Number(path.split("/").at(-1))),
        1,
      );

      return null;
    }

    throw new Error(`Unexpected ${method} ${path}`);
  }

  const service = createReviewService(snapshot, request);

  const add = {
    action: "add",
    expectedUser: "reviewer",
    operationId: randomUUID(),
    fileId: "f1",
    side: "additions",
    start: 1,
    end: 1,
    body: "Check this behavior",
  };

  return { service, request, world, reviews, comments, calls, add };
}

const version = (state: ReviewState) =>
  JSON.stringify({
    body: state.review?.body ?? "",
    comments: state.comments.map((c) => [c.id, c.body]),
  });

describe("GitHub pending reviews", () => {
  it("saves draft threads immediately and reuses one pending review", async () => {
    const f = fixture();
    await f.service.mutate(f.add);

    const state = await f.service.mutate({
      ...f.add,
      operationId: randomUUID(),
      side: "deletions",
      end: 2,
    });

    expect(f.reviews).toHaveLength(1);
    expect(f.reviews[0].state).toBe("PENDING");
    expect(state.comments).toHaveLength(2);
    expect(reviewStateSchema.safeParse(state).success).toBe(true);
    expect(
      f.calls.filter((c) => c.endpoint === "graphql")[1].body.variables?.input,
    ).toMatchObject({ side: "LEFT", startSide: "LEFT", startLine: 1, line: 2 });
  });
  it("does not duplicate a saved comment when its response is lost or the server reopens", async () => {
    const f = fixture();
    f.world.loseReply = true;
    expect((await f.service.mutate(f.add)).comments).toHaveLength(1);
    await createReviewService(snapshot, f.request).mutate(f.add);
    expect(f.comments).toHaveLength(1);
    await expect(
      f.service.mutate({ ...f.add, body: "Changed locally" }),
    ).rejects.toThrow("earlier version");
  });
  it("does not offer fallback for an uncertain write that cannot be reconciled", async () => {
    const f = fixture();
    f.world.uncertainThread = true;
    await expect(f.service.mutate(f.add)).rejects.toThrow(
      "Connection interrupted",
    );
  });
  it("serializes concurrent additions so they share one pending review", async () => {
    const f = fixture();
    await Promise.all([
      f.service.mutate(f.add),
      f.service.mutate({ ...f.add, operationId: randomUUID() }),
    ]);
    expect(f.reviews).toHaveLength(1);
    expect(f.comments).toHaveLength(2);
  });
  it("preserves existing summary and requires explicit fallback for expanded context", async () => {
    const f = fixture();
    await f.service.mutate({
      action: "summary",
      expectedUser: "reviewer",
      expected: "",
      body: "Written on GitHub",
    });
    const action = { ...f.add, start: 3, end: 3 };
    expect((await f.service.mutate(action)).fallback).toContain("cannot place");
    expect(f.reviews[0].body).toBe("Written on GitHub");
    await f.service.mutate({ ...action, fallback: true });
    expect(f.reviews[0].body).toContain("Written on GitHub");
    expect(f.reviews[0].body).toContain("> expanded");
    const body = f.reviews[0].body;
    await f.service.mutate({ ...action, fallback: true });
    expect(f.reviews[0].body).toBe(body);
  });
  it("offers summary placement if GitHub rejects the location", async () => {
    const f = fixture();
    f.world.failThread = true;
    expect((await f.service.mutate(f.add)).fallback).toContain(
      "Location rejected",
    );
    expect(f.comments).toHaveLength(0);
  });
  it("maps old-side rename comments to GitHub's current path", async () => {
    const f = fixture();
    f.world.filename = "src/renamed.ts";
    f.world.previousFilename = "src/file.ts";
    await f.service.mutate({ ...f.add, side: "deletions" });
    expect(f.comments[0].path).toBe("src/renamed.ts");
    expect(f.comments[0].side).toBe("LEFT");
  });
  it("does not reuse coordinates when the pending review or comparison base differs", async () => {
    const f = fixture();
    f.world.mergeBase = "d".repeat(40);
    expect((await f.service.mutate(f.add)).fallback).toBeTruthy();
    expect(f.reviews).toHaveLength(0);
    f.world.mergeBase = snapshot.mergeBase;
    await f.service.mutate(f.add);
    f.reviews[0].commit_id = "e".repeat(40);
    expect(
      (await f.service.mutate({ ...f.add, operationId: randomUUID() }))
        .fallback,
    ).toContain("another revision");
  });
  it.each(["COMMENT", "APPROVE", "REQUEST_CHANGES"])(
    "submits one %s review even after new commits arrive",
    async (event) => {
      const f = fixture();
      const state = await f.service.mutate(f.add);
      f.world.head = "f".repeat(40);

      const result = await f.service.mutate({
        action: "submit",
        expectedUser: "reviewer",
        reviewId: state.review!.id,
        event,
        expected: version(state),
      });

      expect(result.review).toBeNull();
      expect(result.lastReview!.commit_id).toBe(snapshot.head);
      expect(
        f.calls.filter((c) => c.endpoint.endsWith("/events")),
      ).toHaveLength(1);
      await expect(f.service.mutate(f.add)).rejects.toThrow(
        "already in a submitted review",
      );
    },
  );
  it("edits and deletes only comments in the signed-in user's pending review", async () => {
    const f = fixture();
    await f.service.mutate(f.add);
    await expect(
      f.service.mutate({
        action: "edit",
        expectedUser: "reviewer",
        id: 99,
        expected: "",
        body: "oops",
      }),
    ).rejects.toThrow("changed on GitHub");
    await f.service.mutate({
      action: "edit",
      expectedUser: "reviewer",
      id: 1,
      expected: f.add.body,
      body: "Updated",
    });
    expect(f.comments[0].body).toContain("Updated\n<!-- diffractr:");
    await f.service.mutate({
      action: "delete",
      expectedUser: "reviewer",
      id: 1,
      expected: "Updated",
    });
    expect(f.comments).toHaveLength(0);
  });
  it("rejects stale summary, submission, and account state without writing", async () => {
    const f = fixture();
    const state = await f.service.mutate(f.add);
    f.reviews[0].body = "Changed externally";
    await expect(
      f.service.mutate({
        action: "summary",
        expectedUser: "reviewer",
        body: "Overwrite",
        expected: "",
      }),
    ).rejects.toThrow("summary changed");
    await expect(
      f.service.mutate({
        action: "submit",
        expectedUser: "reviewer",
        reviewId: 1,
        event: "APPROVE",
        expected: version(state),
      }),
    ).rejects.toThrow("review changed");
    f.world.user = "someone-else";
    await expect(f.service.mutate(f.add)).rejects.toThrow("account changed");
  });
  it("loads all pages and comments outside the captured files", async () => {
    const f = fixture();
    await f.service.mutate(f.add);

    const many = Array.from({ length: 101 }, (_, i) => ({
      ...f.comments[0],
      id: i + 1,
      path: "outside.ts",
    }));

    const service = createReviewService(
      snapshot,
      async (method, endpoint, body) => {
        if (method === "GET" && endpoint.includes("/reviews/1/comments")) {
          const page = Number(
            new URLSearchParams(endpoint.split("?")[1]).get("page"),
          );

          return many.slice((page - 1) * 100, page * 100);
        }

        return f.request(method, endpoint, body);
      },
    );

    expect((await service.read()).comments).toHaveLength(101);
  });
});

it("removes an incorrectly placed draft and offers fallback, including after a lost response", async () => {
  const f = fixture();

  const service = createReviewService(
    snapshot,
    async (method, endpoint, body) => {
      const result = await f.request(method, endpoint, body);

      if (endpoint === "graphql") {
        f.comments[0].original_commit_id = "d".repeat(40);
        throw new Error("Lost response");
      }

      return result;
    },
  );

  expect((await service.mutate(f.add)).fallback).toContain("another revision");
  expect(f.comments).toHaveLength(0);
});

it("preserves fallback recovery markers when editing the summary", async () => {
  const f = fixture();
  const state = await f.service.mutate({ ...f.add, fallback: true });

  const next = await f.service.mutate({
    action: "summary",
    expectedUser: "reviewer",
    body: "Revised summary",
    expected: state.review!.body,
  });

  expect(next.review!.body).toContain(f.add.operationId);
  await f.service.mutate({ ...f.add, fallback: true });
  expect(f.reviews[0].body).toBe(next.review!.body);
});

it("can start an empty draft for an approval without inline comments", async () => {
  const f = fixture();

  const state = await f.service.mutate({
    action: "summary",
    expectedUser: "reviewer",
    body: "",
    expected: "",
  });

  const result = await f.service.mutate({
    action: "submit",
    expectedUser: "reviewer",
    reviewId: state.review!.id,
    event: "APPROVE",
    expected: version(state),
  });

  expect(result.lastReview!.state).toBe("APPROVED");
});

describe("GitHub hunk coordinates", () => {
  it("accepts context and deleted/added ranges but not expanded or disjoint context", () => {
    expect(inPatch(patch, "deletions", 1, 2)).toBe(true);
    expect(inPatch(patch, "additions", 1, 2)).toBe(true);
    expect(inPatch(patch, "additions", 1, 3)).toBe(false);
    expect(inPatch(patch + "\n@@ -8 +8 @@\n last", "additions", 2, 8)).toBe(
      false,
    );
    expect(inPatch("@@ -0,0 +1 @@\n+new", "additions", 1, 1)).toBe(true);
  });
});

it("protects GitHub write routes with the session token and exact origin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-api-"));
  writeFileSync(join(dir, "index.html"), "<head></head>");
  const { server, url } = await serveSnapshot(snapshot, { dist: dir });
  const address = new URL(url);
  const token = new URLSearchParams(address.hash.slice(1)).get("snapshot");

  try {
    const endpoint = `${address.origin}/api/github-review`;
    expect((await fetch(endpoint, { method: "POST" })).status).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: "https://other.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);

    const invalid = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: address.origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "arbitrary-endpoint" }),
    });

    expect(invalid.status).toBe(400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

it("passes authenticated API payloads through gh stdin and recognizes validation failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "diffractr-gh-"));
  const oldPath = process.env.PATH;
  writeFileSync(
    join(dir, "gh"),
    `#!/usr/bin/env node
let input='';for await(const chunk of process.stdin)input+=chunk;
if(process.argv.includes('invalid-graphql')){process.stdout.write(JSON.stringify({errors:[{type:'UNPROCESSABLE'}]}));process.exit(1);}
if(process.argv.includes('invalid')){process.stderr.write('HTTP 422');process.exit(1);}
process.stdout.write(JSON.stringify({args:process.argv.slice(2),body:JSON.parse(input)}));`,
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}:${oldPath}`;

  try {
    const result = await githubRequest("POST", "graphql", {
      query: "mutation",
      variables: {
        input: {
          body: "Literal $(text) `code`",
          pullRequestReviewId: "review",
          path: "file.ts",
          side: "RIGHT",
          line: 1,
        },
      },
    });

    const response = z
      .object({
        args: z.array(z.string()),
        body: z.object({
          variables: z.object({ input: z.object({ body: z.string() }) }),
        }),
      })
      .parse(result);

    expect(response.args).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      "graphql",
      "--input",
      "-",
    ]);
    expect(response.body.variables.input.body).toBe("Literal $(text) `code`");
    await expect(githubRequest("POST", "invalid", {})).rejects.toBeInstanceOf(
      GitHubValidationError,
    );
    await expect(
      githubRequest("POST", "invalid-graphql", {}),
    ).rejects.toBeInstanceOf(GitHubValidationError);
  } finally {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

it("submits a new review in one step and reconciles a lost submission response", async () => {
  const f = fixture();

  const service = createReviewService(
    snapshot,
    async (method, endpoint, body) => {
      const result = await f.request(method, endpoint, body);

      if (endpoint.endsWith("/events")) throw new Error("Lost response");

      return result;
    },
  );

  const action = {
    action: "submit",
    expectedUser: "reviewer",
    reviewId: null,
    operationId: randomUUID(),
    body: "Looks good",
    event: "APPROVE",
    expected: JSON.stringify({ body: "", comments: [] }),
  };

  await expect(service.mutate(action)).rejects.toThrow("Lost response");
  const state = await service.mutate(action);
  expect(state.lastReview!.state).toBe("APPROVED");
  expect(state.lastReview!.body).toContain("Looks good");
  expect(f.calls.filter((c) => c.endpoint.endsWith("/events"))).toHaveLength(1);
});

it("submits an edited summary with an existing pending review", async () => {
  const f = fixture();
  const state = await f.service.mutate(f.add);

  const result = await f.service.mutate({
    action: "submit",
    expectedUser: "reviewer",
    reviewId: state.review!.id,
    body: "Please adjust this",
    event: "REQUEST_CHANGES",
    expected: version(state),
  });

  expect(result.lastReview!.body).toBe("Please adjust this");
  expect(f.reviews).toHaveLength(1);
});
