import { z } from "zod";

export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    operationId: z.string().uuid(),
    body: z.string().trim().min(1).max(60000),
    fileId: z.string(),
    side: z.enum(["additions", "deletions"]),
    start: z.number().int().positive(),
    end: z.number().int().positive(),
    fallback: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("edit"),
    id: z.number().int().positive(),
    body: z.string().trim().min(1).max(60000),
    expected: z.string(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.number().int().positive(),
    expected: z.string(),
  }),
  z.object({
    action: z.literal("summary"),
    body: z.string().max(60000),
    expected: z.string(),
  }),
  z.object({
    action: z.literal("submit"),
    reviewId: z.number().int().positive().nullable(),
    operationId: z.string().uuid().optional(),
    body: z.string().max(60000).optional(),
    event: z.enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"]),
    expected: z.string(),
  }),
]);

export const remoteCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  path: z.string(),
  side: z.enum(["LEFT", "RIGHT"]).optional(),
  line: z.number().nullable().optional(),
  original_line: z.number().nullable().optional(),
  start_line: z.number().nullable().optional(),
  original_start_line: z.number().nullable().optional(),
  commit_id: z.string().nullable(),
  original_commit_id: z.string().nullable(),
});

export const remoteReviewSchema = z.object({
  id: z.number(),
  body: z.string(),
  commit_id: z.string(),
  html_url: z.string(),
  state: z.string(),
});

export const reviewStateSchema = z.object({
  user: z.string(),
  author: z.string(),
  head: z.string(),
  state: z.string(),
  review: remoteReviewSchema.nullable(),
  comments: z.array(remoteCommentSchema),
  lastReview: remoteReviewSchema.nullable(),
  fallback: z.string().optional(),
});

export const apiErrorSchema = z.object({ error: z.string() });
