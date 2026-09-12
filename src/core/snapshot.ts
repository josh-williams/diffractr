import { z } from "zod";

export const snapshotSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  base: z.string().min(1),
  mergeBase: z.string().optional(),
  head: z.string().optional(),
  capturedAt: z.string().optional(),
  files: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      before: z.string().nullable(),
      after: z.string().nullable(),
      role: z.enum(["production", "tests", "generated", "other"]),
      notice: z.string().optional(),
      oldMode: z.string().nullable().optional(),
      newMode: z.string().nullable().optional(),
    }),
  ),
});
