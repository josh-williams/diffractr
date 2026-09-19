import { getFiletypeFromFileName, preloadHighlighter } from "@pierre/diffs";
import type { Snapshot } from "./core/review";

export async function preloadReviewLanguages(
  snapshot: Snapshot,
): Promise<void> {
  // Pierre highlights each side by its filename, but its automatic loader
  // checks only the destination. Load both before mounting any diff panels.
  const languages = new Set(
    snapshot.files.flatMap((file) =>
      file.notice
        ? []
        : [file.oldPath ?? file.path, file.path].map(getFiletypeFromFileName),
    ),
  );

  await preloadHighlighter({ themes: ["pierre-dark"], langs: [...languages] });
}
