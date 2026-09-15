import { useState } from "react";
import { z } from "zod";
import {
  anchorSchema,
  exportFeedback,
  type Comment,
  type Snapshot,
} from "../core/review";

// App is keyed by snapshot ID; each review owns its initial feedback state.
export function useFeedbackStorage(snapshot: Snapshot) {
  const storageKey = `diffractr:feedback:${snapshot.id}`;

  const commentSchema = anchorSchema.and(
    z.object({
      id: z.string(),
      snapshotId: z.literal(snapshot.id),
      body: z.string().min(1),
    }),
  );

  function loadComments(): Comment[] {
    try {
      const result = z
        .array(commentSchema)
        .safeParse(
          JSON.parse(
            localStorage.getItem(storageKey) ??
              localStorage.getItem(`diffraction:feedback:${snapshot.id}`) ??
              "[]",
          ),
        );

      if (!result.success) return [];
      exportFeedback(snapshot, result.data);

      return result.data;
    } catch {
      return [];
    }
  }

  const [comments, updateComments] = useState<Comment[]>(loadComments);
  const [storageError, setStorageError] = useState(false);

  function setComments(next: Comment[]) {
    updateComments(next);

    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  return { comments, setComments, storageError };
}
