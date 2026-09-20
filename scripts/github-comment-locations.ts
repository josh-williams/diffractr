import { z } from "zod";
import type { GitHubRequest } from "./github-review.ts";

const pageInfo = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const commentsSchema = z.object({
  nodes: z.array(z.object({ id: z.string() })),
  pageInfo,
});

const threadSchema = z.object({
  id: z.string(),
  diffSide: z.enum(["LEFT", "RIGHT"]),
  line: z.number().nullable(),
  originalLine: z.number().nullable(),
  startLine: z.number().nullable(),
  originalStartLine: z.number().nullable(),
  comments: commentsSchema,
});

const responseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({ nodes: z.array(threadSchema), pageInfo }),
      }),
    }),
  }),
});

// Pending review REST comments omit source coordinates. Threads retain them.
export async function readThreadLocations(
  request: GitHubRequest,
  owner: string,
  repo: string,
  number: number,
) {
  const locations = new Map<
    string,
    {
      side: "LEFT" | "RIGHT";
      line: number | null;
      original_line: number | null;
      start_line: number | null;
      original_start_line: number | null;
    }
  >();

  let cursor: string | null = null;

  do {
    const result = responseSchema.parse(
      await request("POST", "graphql", {
        query: `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { pullRequest(number: ${number}) { reviewThreads(first: 100, after: ${JSON.stringify(cursor)}) { nodes { id diffSide line originalLine startLine originalStartLine comments(first: 100) { nodes { id } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } } } }`,
      }),
    );

    const threads = result.data.repository.pullRequest.reviewThreads;

    for (const thread of threads.nodes) {
      let page = thread.comments;

      while (true) {
        for (const comment of page.nodes)
          locations.set(comment.id, {
            side: thread.diffSide,
            line: thread.line,
            original_line: thread.originalLine,
            start_line: thread.startLine,
            original_start_line: thread.originalStartLine,
          });

        if (!page.pageInfo.hasNextPage) break;

        if (!page.pageInfo.endCursor)
          throw new Error("GitHub returned an incomplete comment page.");

        const next = z
          .object({
            data: z.object({ node: z.object({ comments: commentsSchema }) }),
          })
          .parse(
            await request("POST", "graphql", {
              query: `query { node(id: ${JSON.stringify(thread.id)}) { ... on PullRequestReviewThread { comments(first: 100, after: ${JSON.stringify(page.pageInfo.endCursor)}) { nodes { id } pageInfo { hasNextPage endCursor } } } } }`,
            }),
          );

        page = next.data.node.comments;
      }
    }

    if (threads.pageInfo.hasNextPage && !threads.pageInfo.endCursor)
      throw new Error("GitHub returned an incomplete thread page.");
    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
  } while (cursor);

  return locations;
}
