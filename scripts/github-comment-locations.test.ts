import { expect, it } from "vitest";
import { readThreadLocations } from "./github-comment-locations.ts";

it("reads pending locations across thread and comment pages", async () => {
  const queries: string[] = [];

  const result = await readThreadLocations(
    async (_method, _endpoint, payload) => {
      queries.push(payload?.query ?? "");

      if (queries.length === 2)
        return {
          data: {
            node: {
              comments: {
                nodes: [{ id: "reply" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      const second = queries.length === 3;

      return {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: second ? "thread-2" : "thread-1",
                    diffSide: second ? "LEFT" : "RIGHT",
                    line: 55,
                    originalLine: 53,
                    startLine: 54,
                    originalStartLine: 52,
                    comments: {
                      nodes: [{ id: second ? "other" : "draft" }],
                      pageInfo: {
                        hasNextPage: !second,
                        endCursor: second ? null : "comment-cursor",
                      },
                    },
                  },
                ],
                pageInfo: {
                  hasNextPage: !second,
                  endCursor: second ? null : "thread-cursor",
                },
              },
            },
          },
        },
      };
    },
    "owner",
    "repo",
    1,
  );

  expect(queries[1]).toContain('after: "comment-cursor"');
  expect(queries[2]).toContain('after: "thread-cursor"');
  expect(result.get("draft")).toEqual({
    side: "RIGHT",
    line: 55,
    original_line: 53,
    start_line: 54,
    original_start_line: 52,
  });
  expect(result.get("reply")).toEqual(result.get("draft"));
  expect(result.get("other")?.side).toBe("LEFT");
});
