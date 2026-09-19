import { z } from "zod";

const blockSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  path: z.string(),
  kind: z.enum(["text", "metadata"]),
  rows: z.array(
    z.object({
      n: z.number().int().positive(),
      op: z.enum([" ", "+", "-"]),
      text: z.string(),
      oldLine: z.number().int().positive().optional(),
      newLine: z.number().int().positive().optional(),
    }),
  ),
  unit: z
    .object({
      id: z.string().min(1),
      fileId: z.string().min(1),
      oldStart: z.number().int().nonnegative(),
      oldCount: z.number().int().nonnegative(),
      newStart: z.number().int().nonnegative(),
      newCount: z.number().int().nonnegative(),
      split: z.boolean().optional(),
    })
    .optional(),
  notice: z.string().optional(),
});

export const snapshotSchema = z.object({
  inventory: z.array(blockSchema).optional(),
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  base: z.string().min(1),
  mergeBase: z.string().optional(),
  head: z.string().optional(),
  capturedAt: z.string().optional(),
  baseCommit: z.string().optional(),
  pullRequest: z
    .object({
      url: z
        .string()
        .regex(
          /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/,
        ),
      number: z.number().int().positive(),
      title: z.string(),
    })
    .optional(),
  files: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      oldPath: z.string().min(1).optional(),
      renameSimilarity: z.number().int().min(0).max(100).optional(),
      before: z.string().nullable(),
      after: z.string().nullable(),
      role: z.enum(["production", "tests", "generated", "other"]),
      notice: z.string().optional(),
      oldMode: z.string().nullable().optional(),
      newMode: z.string().nullable().optional(),
    }),
  ),
});
