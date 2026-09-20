import { readThreadLocations } from "./github-comment-locations.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Snapshot, Side } from "../src/core/review.ts";
import {
  remoteCommentSchema,
  remoteReviewSchema,
} from "../src/core/github-feedback.ts";
import { actionSchema } from "../src/core/github-feedback.ts";
import { parsePullRequestUrl } from "./pull-request.ts";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export interface ReviewThread {
  pullRequestReviewId: string;
  path: string;
  body: string;
  side: "LEFT" | "RIGHT";
  line: number;
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
}

export interface GitHubPayload {
  body?: string;
  commit_id?: string;
  event?: string;
  query?: string;
  variables?: { input: ReviewThread };
}

export type GitHubRequest = (
  method: string,
  endpoint: string,
  payload?: GitHubPayload,
) => Promise<JsonValue>;

const userSchema = z.object({ login: z.string() });

const reviewSchema = remoteReviewSchema.extend({
  node_id: z.string(),
  user: userSchema,
});

const prSchema = z.object({
  user: userSchema,
  head: z.object({ sha: z.string() }),
  base: z.object({ sha: z.string() }),
  state: z.string(),
});

const comparisonSchema = z.object({
  merge_base_commit: z.object({ sha: z.string() }).optional(),
  files: z
    .array(
      z.object({
        filename: z.string(),
        previous_filename: z.string().optional(),
        patch: z.string().optional(),
      }),
    )
    .optional(),
});

export type GitHubReview = z.infer<typeof reviewSchema>;

export type GitHubComment = z.infer<typeof remoteCommentSchema>;

export interface ReviewState {
  user: string;
  author: string;
  head: string;
  base: string;
  state: string;
  review: GitHubReview | null;
  comments: GitHubComment[];
  publishedComments: GitHubComment[];
  lastReview: GitHubReview | null;
  fallback?: string;
}

type ReviewAction = z.infer<typeof actionSchema>;

const execute = promisify(execFile);

export class GitHubValidationError extends Error {}

const graphqlFailure = z.object({
  errors: z.array(z.object({ type: z.string().optional() })).min(1),
});

function rejectedLocation(result: JsonValue) {
  const parsed = graphqlFailure.safeParse(result);

  return (
    parsed.success &&
    parsed.data.errors.every((error) =>
      ["UNPROCESSABLE", "VALIDATION_FAILED"].includes(error.type ?? ""),
    )
  );
}

export async function githubRequest(
  method: string,
  endpoint: string,
  payload?: GitHubPayload,
): Promise<JsonValue> {
  const args = [
    "api",
    "--hostname",
    "github.com",
    "--method",
    method,
    endpoint,
  ];

  if (payload) args.push("--input", "-");

  const child = execute("gh", args, {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
  });

  if (payload) child.child.stdin!.end(JSON.stringify(payload));

  try {
    const { stdout } = await child;
    const result = stdout ? z.json().parse(JSON.parse(stdout)) : null;

    if (graphqlFailure.safeParse(result).success) {
      if (rejectedLocation(result))
        throw new GitHubValidationError(
          "GitHub rejected this draft location. Save it in the summary instead.",
        );
      throw new Error(
        "GitHub could not complete the operation. Refresh to check its status.",
      );
    }

    return result;
  } catch (error) {
    if (error instanceof GitHubValidationError) throw error;

    const failure = z
      .object({ stdout: z.string().optional(), stderr: z.string().optional() })
      .safeParse(error);

    let response: JsonValue;

    try {
      response = z.json().parse(JSON.parse(failure.data?.stdout ?? "null"));
    } catch {
      response = null;
    }

    if (rejectedLocation(response))
      throw new GitHubValidationError(
        "GitHub rejected this draft location. Save it in the summary instead.",
      );
    const status = failure.data?.stderr?.match(/HTTP (\d+)/)?.[1];
    const Failure = status === "422" ? GitHubValidationError : Error;
    throw new Failure(
      status === "422"
        ? "GitHub rejected this location or review state. Refresh, or save the comment in the summary."
        : "GitHub could not confirm the operation. Check gh authentication and refresh before retrying.",
    );
  }
}

export const cleanBody = (body: string) =>
  body.replace(/\n?<!-- diffractr:[a-f0-9-]+ -->/g, "");

// A location must be in a GitHub hunk, not merely in expanded local context.
export function inPatch(
  patch: string | undefined,
  side: Side,
  start: number,
  end: number,
) {
  let old = 0,
    next = 0,
    matched = new Set();

  for (const row of (patch ?? "").split("\n")) {
    const header = row.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

    if (header) {
      old = Number(header[1]);
      next = Number(header[2]);
      continue;
    }

    if (![" ", "+", "-"].includes(row[0]) || (!old && !next)) continue;
    const applicable = side === "additions" ? row[0] !== "-" : row[0] !== "+";
    const line = side === "additions" ? next : old;

    if (applicable && line >= start && line <= end) matched.add(line);

    if (row[0] !== "+") old++;

    if (row[0] !== "-") next++;
  }

  return end >= start && matched.size === end - start + 1;
}

export function createReviewService(
  snapshot: Snapshot,
  request: GitHubRequest = githubRequest,
) {
  if (!snapshot.pullRequest || !snapshot.head || !snapshot.mergeBase)
    throw new Error(
      "GitHub feedback requires a captured PR and its revisions.",
    );
  const pr = parsePullRequestUrl(snapshot.pullRequest.url);
  const root = `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
  let tail: Promise<ReviewState | void> = Promise.resolve();

  const additions = new Map<
    string,
    { body: string; reviewId: number; complete: boolean }
  >();

  const submissions = new Map<string, { id: number; signature: string }>();

  async function pages<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<z.output<T>[]> {
    const all: z.output<T>[] = [];

    for (let page = 1; ; page++) {
      const rows = z
        .array(schema)
        .parse(await request("GET", `${path}?per_page=100&page=${page}`));

      all.push(...rows);

      if (rows.length < 100) return all;
    }
  }

  async function read(): Promise<ReviewState> {
    const user = userSchema.parse(await request("GET", "user"));
    const info = prSchema.parse(await request("GET", root));
    const reviews = await pages(`${root}/reviews`, reviewSchema);

    const review =
      reviews.find(
        (r) => r.state === "PENDING" && r.user.login === user.login,
      ) ?? null;

    let comments = review
      ? await pages(
          `${root}/reviews/${review.id}/comments`,
          remoteCommentSchema,
        )
      : [];

    if (comments.some((comment) => !comment.side || !comment.original_line)) {
      const locations = await readThreadLocations(
        request,
        pr.owner,
        pr.repo,
        Number(pr.number),
      );

      comments = comments.map((comment) => ({
        ...comment,
        ...locations.get(comment.node_id ?? ""),
      }));
    }

    const publishedComments = (
      await pages(`${root}/comments`, remoteCommentSchema)
    ).filter((comment) => !comments.some((draft) => draft.id === comment.id));

    return {
      user: user.login,
      author: info.user.login,
      head: info.head.sha,
      base: info.base.sha,
      state: info.state,
      review,
      comments,
      publishedComments,
      lastReview:
        reviews
          .filter((r) => r.user.login === user.login && r.state !== "PENDING")
          .at(-1) ?? null,
    };
  }

  async function pending(state: ReviewState): Promise<GitHubReview> {
    if (state.review) return state.review;

    // On uncertain creation, the next read discovers the pending review.
    return reviewSchema.parse(
      await request("POST", `${root}/reviews`, {
        commit_id: snapshot.head,
        body: "",
      }),
    );
  }

  async function verifySaved(
    state: ReviewState,
    commentId: number,
  ): Promise<ReviewState> {
    const comment = state.comments.find((c) => c.id === commentId);

    if (!comment)
      throw new Error(
        "GitHub has not confirmed the draft comment yet. Refresh before retrying.",
      );

    if (comment.original_commit_id === snapshot.head) return state;
    await request(
      "DELETE",
      `repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}`,
    );

    return {
      ...(await read()),
      fallback:
        "GitHub placed the draft on another revision. It was removed; include the captured code in the summary instead.",
    };
  }

  async function addComment(
    action: Extract<ReviewAction, { action: "add" }>,
    state: ReviewState,
  ): Promise<ReviewState> {
    const previous = additions.get(action.operationId);

    if (previous) {
      if (previous.body !== action.body)
        throw new Error(
          "An earlier version of this comment was attempted. Check GitHub before starting a new comment.",
        );

      if (state.review?.id !== previous.reviewId)
        throw new Error(
          "This comment may already be in a submitted review. Refresh to check GitHub before starting another comment.",
        );

      if (previous.complete) return state;
      throw new Error(
        "The previous save could not be confirmed. Check GitHub before discarding this draft and starting a new comment.",
      );
    }

    const file = snapshot.files.find((f) => f.id === action.fileId);
    const content = action.side === "additions" ? file?.after : file?.before;

    if (
      !file ||
      content == null ||
      action.end < action.start ||
      action.end > content.split("\n").length
    )
      throw new Error("Comment is outside the captured source.");
    let location;

    if (!action.fallback) {
      // Existing drafts may belong to a different revision. Never reinterpret coordinates.
      if (state.review && state.review.commit_id !== snapshot.head)
        return {
          ...state,
          fallback:
            "This pending review belongs to another revision. Include this comment in its summary instead.",
        };

      const comparison = comparisonSchema.parse(
        await request(
          "GET",
          `repos/${pr.owner}/${pr.repo}/compare/${state.base}...${snapshot.head}`,
        ),
      );

      location = comparison.files?.find(
        (f) =>
          f.filename === file.path ||
          (action.side === "deletions" && f.previous_filename === file.path),
      );

      if (
        comparison.merge_base_commit?.sha !== snapshot.mergeBase ||
        !location ||
        !inPatch(location.patch, action.side, action.start, action.end)
      )
        return {
          ...state,
          fallback:
            "GitHub cannot place this range inline. Include the file, range, and quoted code in the review summary instead.",
        };
    }

    const review = await pending(state);
    const attempt = { body: action.body, reviewId: review.id, complete: false };
    additions.set(action.operationId, attempt);

    if (action.fallback) {
      const quote = content
        .split("\n")
        .slice(action.start - 1, action.end)
        .map((line) => `> ${line}`)
        .join("\n");

      const entry = `${file.path} · ${action.side === "additions" ? "New" : "Old"} lines ${action.start}–${action.end} · ${snapshot.head}\n\n${quote}\n\n${action.body}`;
      await request("PUT", `${root}/reviews/${review.id}`, {
        body: [cleanBody(review.body), entry].filter(Boolean).join("\n\n"),
      });
    } else {
      const side = action.side === "additions" ? "RIGHT" : "LEFT";

      if (!location) throw new Error("Missing validated GitHub location.");

      const thread: ReviewThread = {
        pullRequestReviewId: review.node_id,
        path: location.filename,
        body: cleanBody(action.body),
        side,
        line: action.end,
      };

      if (action.start < action.end) {
        thread.startLine = action.start;
        thread.startSide = side;
      }

      const existingIds = new Set(state.comments.map((comment) => comment.id));

      const findSaved = (next: ReviewState) =>
        next.comments.find(
          (comment) =>
            !existingIds.has(comment.id) &&
            comment.body === cleanBody(action.body) &&
            comment.path === location.filename &&
            comment.side === side &&
            comment.original_line === action.end &&
            (comment.original_start_line ?? comment.original_line) ===
              action.start,
        );

      let savedState;

      try {
        await request("POST", "graphql", {
          query:
            "mutation($input:AddPullRequestReviewThreadInput!){addPullRequestReviewThread(input:$input){thread{id}}}",
          variables: { input: thread },
        });
        savedState = await read();
      } catch (error) {
        savedState = await read();

        if (!findSaved(savedState)) {
          if (error instanceof GitHubValidationError) {
            additions.delete(action.operationId);

            return { ...savedState, fallback: error.message };
          }

          throw error;
        }
      }

      const saved = findSaved(savedState);

      if (!saved)
        throw new Error(
          "GitHub has not confirmed the draft comment yet. Check GitHub before retrying.",
        );
      const result = await verifySaved(savedState, saved.id);

      if (result.fallback) additions.delete(action.operationId);
      else attempt.complete = true;

      return result;
    }

    const result = await read();
    attempt.complete = true;

    return result;
  }

  async function updateSummary(
    action: Extract<ReviewAction, { action: "summary" }>,
    state: ReviewState,
  ): Promise<ReviewState> {
    if ((state.review?.body ?? "") !== action.expected)
      throw new Error(
        "The summary changed on GitHub. Refresh before saving; your text is still here.",
      );
    const review = await pending(state);
    await request("PUT", `${root}/reviews/${review.id}`, {
      body: cleanBody(action.body),
    });

    return read();
  }

  async function submitReview(
    action: Extract<ReviewAction, { action: "submit" }>,
    state: ReviewState,
  ): Promise<ReviewState> {
    const key = action.operationId ?? `review:${action.reviewId}`;
    const signature = JSON.stringify(action);
    const previous = submissions.get(key);

    if (previous && previous.signature !== signature)
      throw new Error(
        "This submission attempt changed. Refresh the review before trying again.",
      );
    const previousId = previous?.id;

    if (previousId !== undefined && state.lastReview?.id === previousId)
      return state;

    const resumed =
      previousId !== undefined &&
      state.review?.id === previousId &&
      action.reviewId === null &&
      cleanBody(state.review.body) === cleanBody(action.body ?? "") &&
      state.comments.length === 0;

    if (
      !resumed &&
      ((state.review?.id ?? null) !== action.reviewId ||
        JSON.stringify({
          body: state.review?.body ?? "",
          comments: state.comments.map((c) => [c.id, c.body]),
        }) !== action.expected)
    )
      throw new Error(
        "The review changed on GitHub. Reopen Finish review to check it before submitting.",
      );

    if (!state.review && !action.operationId)
      throw new Error("A submission ID is required to start a review.");
    let review = state.review;

    if (!review)
      review = reviewSchema.parse(
        await request("POST", `${root}/reviews`, {
          commit_id: snapshot.head,
          body: cleanBody(action.body ?? ""),
        }),
      );

    submissions.set(key, { id: review.id, signature });
    const body = cleanBody(action.body ?? review.body);

    await request("POST", `${root}/reviews/${review.id}/events`, {
      event: action.event,
      body,
    });

    return read();
  }

  function editableComment(
    action: Extract<ReviewAction, { action: "edit" | "delete" }>,
    state: ReviewState,
  ) {
    const comment =
      state.comments.find((c) => c.id === action.id) ??
      (action.action === "edit"
        ? state.publishedComments.find(
            (c) => c.id === action.id && c.user?.login === state.user,
          )
        : undefined);

    if (!comment || cleanBody(comment.body) !== action.expected)
      throw new Error(
        "The comment changed on GitHub. Refresh before editing it.",
      );

    return comment;
  }

  async function editComment(
    action: Extract<ReviewAction, { action: "edit" }>,
    state: ReviewState,
  ): Promise<ReviewState> {
    const comment = editableComment(action, state);

    const body = cleanBody(action.body);

    if (
      comment.node_id &&
      state.comments.some((draft) => draft.id === comment.id)
    ) {
      await request("POST", "graphql", {
        query: `mutation { updatePullRequestReviewComment(input: {pullRequestReviewCommentId: ${JSON.stringify(comment.node_id)}, body: ${JSON.stringify(body)}}) { pullRequestReviewComment { id } } }`,
      });
    } else {
      await request(
        "PATCH",
        `repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}`,
        { body },
      );
    }

    return read();
  }

  async function deleteComment(
    action: Extract<ReviewAction, { action: "delete" }>,
    state: ReviewState,
  ): Promise<ReviewState> {
    const comment = editableComment(action, state);
    await request(
      "DELETE",
      `repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}`,
    );

    return read();
  }

  async function mutate(input: JsonValue): Promise<ReviewState> {
    const action = actionSchema.parse(input);
    const state = await read();

    if (
      z.object({ expectedUser: z.string() }).parse(input).expectedUser !==
      state.user
    )
      throw new Error(
        "The signed-in GitHub account changed. Refresh before saving.",
      );

    switch (action.action) {
      case "add":
        return addComment(action, state);
      case "edit":
        return editComment(action, state);
      case "delete":
        return deleteComment(action, state);
      case "summary":
        return updateSummary(action, state);
      case "submit":
        return submitReview(action, state);
    }
  }

  return {
    read,
    mutate(input: JsonValue) {
      const operation = tail.then(() => mutate(input));
      tail = operation.catch(() => {});

      return operation;
    },
  };
}
