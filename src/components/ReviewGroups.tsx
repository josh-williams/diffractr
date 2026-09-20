import { contextLayout } from "../core/context";
import { unitDiff } from "../core/review";
import { Flag } from "lucide-react";
import type {
  Analysis,
  Snapshot,
  ChangeUnit,
  Comment,
  Anchor,
  SourceFile,
} from "../core/review";
import Markdown from "./Markdown";
import DiffCard from "./DiffCard";

export default function ReviewGroups({
  snapshot,
  analysis,
  units,
  sourceUnits,
  comments,
  commentAt,
  onEditComment,
  editContainer,
  composerAnchor,
  composerOwner,
  setComposerContainer,
  setFullFile,
}: {
  snapshot: Snapshot;
  analysis: Analysis | null;
  units: ChangeUnit[];
  sourceUnits: ChangeUnit[];
  comments: Comment[];
  commentAt: (anchor: Anchor, owner: string) => void;
  editContainer: HTMLElement | null;
  onEditComment: (comment: Comment, container: HTMLElement) => void;
  composerAnchor: Anchor | null;
  composerOwner: string | null;
  setComposerContainer: (node: HTMLDivElement | null) => void;
  setFullFile: (file: SourceFile) => void;
}) {
  let composerPlaced = false;

  return (
    <>
      {(analysis?.sections ?? [null]).map((section, sectionIndex) => {
        const selected = section
          ? units.filter((unit) => section.unitIds.includes(unit.id))
          : units;

        const groups = [
          ...new Set(
            section ? section.fileIds : snapshot.files.map((file) => file.id),
          ),
        ].map((id) => ({
          file: snapshot.files.find((file) => file.id === id)!,
          metadata: !section || section.metadataFileIds.includes(id),
          units: selected.filter((unit) => unit.fileId === id),
        }));

        const flags =
          analysis?.flags.filter((flag) => flag.sectionId === section?.id) ??
          [];

        const id = section?.id ?? "files";

        return (
          <section
            key={id}
            id={`review-${id}`}
            data-review-part={id}
            aria-labelledby={`heading-${id}`}
            className="mt-8 scroll-mt-4 border-t border-mist-200 pt-5 dark:border-mist-800"
          >
            <div className="mb-1 text-sm text-mist-500 dark:text-mist-400">
              {section
                ? `Group ${sectionIndex + 1} of ${analysis!.sections.length}`
                : "All files"}
            </div>
            <h2 id={`heading-${id}`} className="text-2xl font-semibold">
              {section?.title ?? "All changed files"}
            </h2>
            {section ? (
              <div className="mt-2 max-w-5xl space-y-2 leading-6 text-mist-600 dark:text-mist-400">
                <Markdown text={section.description} />
              </div>
            ) : null}
            <div className="mt-4 mb-2 flex items-center justify-between [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2 [&_h2>span]:text-xs [&_h2>span]:font-normal [&_h2>span]:text-mist-500 [&_h2>span]:dark:text-mist-400">
              <h2>
                Code & context <span>{groups.length} files</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-mist-500 dark:text-mist-400">
                <Flag size={13} />
                {flags.length} {flags.length === 1 ? "flag" : "flags"}
              </span>
            </div>
            {groups.map((group) => {
              const owner = `${id}:${group.file.id}`;

              const matches =
                composerAnchor?.fileId === group.file.id &&
                (composerOwner === owner ||
                  (composerOwner === null &&
                    !composerPlaced &&
                    containsAnchor(
                      group.file,
                      group.units,
                      sourceUnits,
                      composerAnchor,
                    )));

              if (matches) composerPlaced = true;

              return (
                <DiffCard
                  key={`${id}:${group.file.id}`}
                  {...group}
                  allUnits={sourceUnits}
                  flags={flags.filter((f) => f.fileId === group.file.id)}
                  comments={comments.filter((c) => c.fileId === group.file.id)}
                  onEditComment={onEditComment}
                  editContainer={editContainer}
                  onComment={(anchor) => commentAt(anchor, owner)}
                  composerAnchor={matches ? composerAnchor : null}
                  revealComposer={composerOwner === null}
                  setComposerContainer={setComposerContainer}
                  onFullFile={setFullFile}
                />
              );
            })}
          </section>
        );
      })}
    </>
  );
}

function containsAnchor(
  file: SourceFile,
  units: ChangeUnit[],
  sourceUnits: ChangeUnit[],
  anchor: Anchor,
) {
  const expanded = Object.fromEntries(
    units.flatMap((unit) => [
      [`${unit.id}:before`, true],
      [`${unit.id}:after`, true],
    ]),
  );

  const layout = contextLayout(file, units, sourceUnits, expanded);

  return units.some((unit, index) =>
    unitDiff(file, unit, sourceUnits, layout[index]).hunks.some((hunk) => {
      const start =
        anchor.side === "additions" ? hunk.additionStart : hunk.deletionStart;

      const count =
        anchor.side === "additions" ? hunk.additionCount : hunk.deletionCount;

      return anchor.end >= start && anchor.end < start + count;
    }),
  );
}
