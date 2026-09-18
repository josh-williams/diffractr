import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { actionSchema } from "../src/core/github-feedback.mjs";
import { parsePullRequestUrl } from "./pull-request.mjs";

const execute = promisify(execFile);

export class GitHubValidationError extends Error {}

const graphqlFailure = z.object({
  errors: z.array(z.object({ type: z.string().optional() })).min(1),
});

function rejectedLocation(result) {
  const parsed = graphqlFailure.safeParse(result);

  return (
    parsed.success &&
    parsed.data.errors.every((error) =>
      ["UNPROCESSABLE", "VALIDATION_FAILED"].includes(error.type),
    )
  );
}

export async function githubRequest(method, endpoint, payload) {
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

  if (payload) child.child.stdin.end(JSON.stringify(payload));

  try {
    const { stdout } = await child;
    const result = stdout ? JSON.parse(stdout) : null;

    if (result?.errors) {
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
    let response;

    try {
      response = JSON.parse(error.stdout ?? "null");
    } catch {
      response = null;
    }

    if (rejectedLocation(response))
      throw new GitHubValidationError(
        "GitHub rejected this draft location. Save it in the summary instead.",
      );
    const status = error.stderr?.match(/HTTP (\d+)/)?.[1];
    const Failure = status === "422" ? GitHubValidationError : Error;
    throw new Failure(
      status === "422"
        ? "GitHub rejected this location or review state. Refresh, or save the comment in the summary."
        : "GitHub could not confirm the operation. Check gh authentication and refresh before retrying.",
    );
  }
}

const marker = (id) => `<!-- diffractr:${id} -->`;

export const cleanBody = (body) =>
  body.replace(/\n?<!-- diffractr:[a-f0-9-]+ -->/g, "");

// A location must be in a GitHub hunk, not merely in expanded local context.
export function inPatch(patch, side, start, end) {
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

export function createReviewService(snapshot, request = githubRequest) {
  const pr = parsePullRequestUrl(snapshot.pullRequest.url);
  const root = `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
  let tail = Promise.resolve();

  async function pages(path) {
    const all = [];

    for (let page = 1; ; page++) {
      const rows = await request("GET", `${path}?per_page=100&page=${page}`);
      all.push(...rows);

      if (rows.length < 100) return all;
    }
  }

  async function read() {
    const user = await request("GET", "user");
    const info = await request("GET", root);
    const reviews = await pages(`${root}/reviews`);

    const review =
      reviews.find(
        (r) => r.state === "PENDING" && r.user.login === user.login,
      ) ?? null;

    const comments = review
      ? await pages(`${root}/reviews/${review.id}/comments`)
      : [];

    return {
      user: user.login,
      author: info.user.login,
      head: info.head.sha,
      base: info.base.sha,
      state: info.state,
      review,
      comments,
      lastReview:
        reviews
          .filter((r) => r.user.login === user.login && r.state !== "PENDING")
          .at(-1) ?? null,
    };
  }

  async function pending(state) {
    if (state.review) return state.review;

    // On uncertain creation, the next read discovers the pending review.
    return request("POST", `${root}/reviews`, {
      commit_id: snapshot.head,
      body: "",
    });
  }

  async function verifySaved(state, tag) {
    const comment = state.comments.find((c) => c.body.includes(tag));

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

  async function mutate(input) {
    const action = actionSchema.parse(input);
    const state = await read();

    if (input.expectedUser !== state.user)
      throw new Error(
        "The signed-in GitHub account changed. Refresh before saving.",
      );

    if (action.action === "add") {
      const tag = marker(action.operationId);

      const saved = state.comments.find((c) => c.body.includes(tag));

      if (saved && cleanBody(saved.body) !== action.body)
        throw new Error(
          "An earlier version of this comment is already saved. Edit that draft in Finish review; your unsaved text is preserved here.",
        );

      if (saved) return verifySaved(state, tag);

      if (state.review?.body.includes(tag)) return state;

      if (state.lastReview) {
        const submittedComments = await pages(
          `${root}/reviews/${state.lastReview.id}/comments`,
        );

        if (
          state.lastReview.body.includes(tag) ||
          submittedComments.some((c) => c.body.includes(tag))
        )
          throw new Error(
            "This comment is already in a submitted review. Refresh to view that review before starting another comment.",
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

        const comparison = await request(
          "GET",
          `repos/${pr.owner}/${pr.repo}/compare/${state.base}...${snapshot.head}`,
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

      if (action.fallback) {
        const quote = content
          .split("\n")
          .slice(action.start - 1, action.end)
          .map((line) => `> ${line}`)
          .join("\n");

        const entry = `${tag}\n\n${file.path} · ${action.side === "additions" ? "New" : "Old"} lines ${action.start}–${action.end} · ${snapshot.head}\n\n${quote}\n\n${action.body}`;
        await request("PUT", `${root}/reviews/${review.id}`, {
          body: [review.body, entry].filter(Boolean).join("\n\n"),
        });
      } else {
        const side = action.side === "additions" ? "RIGHT" : "LEFT";

        const thread = {
          pullRequestReviewId: review.node_id,
          path: location.filename,
          body: `${action.body}\n${tag}`,
          side,
          line: action.end,
        };

        if (action.start < action.end) {
          thread.startLine = action.start;
          thread.startSide = side;
        }

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

          if (!savedState.comments.some((c) => c.body.includes(tag))) {
            if (error instanceof GitHubValidationError)
              return { ...savedState, fallback: error.message };
            throw error;
          }
        }

        return verifySaved(savedState, tag);
      }
    } else if (action.action === "summary") {
      if ((state.review?.body ?? "") !== action.expected)
        throw new Error(
          "The summary changed on GitHub. Refresh before saving; your text is still here.",
        );
      const review = await pending(state);
      const markers = review.body.match(/<!-- diffractr:[a-f0-9-]+ -->/g) ?? [];
      await request("PUT", `${root}/reviews/${review.id}`, {
        body: [cleanBody(action.body), ...markers].filter(Boolean).join("\n"),
      });
    } else {
      if (action.action === "submit") {
        const tag = action.operationId ? marker(action.operationId) : "";

        if (tag && state.lastReview?.body.includes(tag)) return state;

        const resumed =
          action.reviewId === null &&
          tag &&
          state.review?.body.includes(tag) &&
          cleanBody(state.review.body) === action.body &&
          !state.comments.length;

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

        if (!state.review && !tag)
          throw new Error("A submission ID is required to start a review.");
        let review = state.review;

        if (!review)
          review = await request("POST", `${root}/reviews`, {
            commit_id: snapshot.head,
            body: [action.body ?? "", tag].filter(Boolean).join("\n"),
          });

        const markers =
          review.body.match(/<!-- diffractr:[a-f0-9-]+ -->/g) ?? [];

        const body =
          action.body === undefined
            ? review.body
            : [cleanBody(action.body), ...markers].filter(Boolean).join("\n");

        await request("POST", `${root}/reviews/${review.id}/events`, {
          event: action.event,
          body,
        });
      } else {
        if (!state.review)
          throw new Error(
            "The pending review was submitted or deleted elsewhere. Refresh to see its current state.",
          );
        const comment = state.comments.find((c) => c.id === action.id);

        if (!comment || cleanBody(comment.body) !== action.expected)
          throw new Error(
            "The comment changed on GitHub. Refresh before editing it.",
          );

        if (action.action === "delete")
          await request(
            "DELETE",
            `repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}`,
          );
        else
          await request(
            "PATCH",
            `repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.id}`,
            {
              body:
                action.body +
                (comment.body.match(/\n?<!-- diffractr:[a-f0-9-]+ -->/)?.[0] ??
                  ""),
            },
          );
      }
    }

    return read();
  }

  return {
    read,
    mutate(input) {
      const operation = tail.then(() => mutate(input));
      tail = operation.catch(() => {});

      return operation;
    },
  };
}
