import DiffHeader from "./DiffHeader";
import { Fragment, useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import { Flag as FlagIcon, MessageSquare } from "lucide-react";
import Markdown from "./Markdown";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { contextLayout } from "../core/context";
import {
  unitDiff,
  type Anchor,
  type ChangeUnit,
  type Comment,
  type Flag,
  type SourceFile,
} from "../core/review";

interface Props {
  file: SourceFile;
  units: ChangeUnit[];
  allUnits: ChangeUnit[];
  flags: Flag[];
  comments: Comment[];
  onComment: (anchor: Anchor) => void;
  onFullFile: (file: SourceFile) => void;
  metadata?: boolean;
}

export default function DiffCard({
  file,
  units,
  allUnits,
  flags,
  comments,
  onComment,
  onFullFile,
  metadata = true,
}: Props) {
  const [collapsed, setCollapsed] = useState(file.role === "generated");
  const [selection, setSelection] = useState<SelectedLineRange | null>(null);

  const [expandedContext, setExpandedContext] = useState<
    Record<string, boolean>
  >({});

  const context = useMemo(
    () => contextLayout(file, units, allUnits, expandedContext),
    [file, units, allUnits, expandedContext],
  );

  const diffs = useMemo(
    () =>
      units.map((unit, index) =>
        unitDiff(file, unit, allUnits, context[index]),
      ),
    [file, units, allUnits, context],
  );

  const added = units.reduce((n, u) => n + u.newCount, 0),
    removed = units.reduce((n, u) => n + u.oldCount, 0);

  function selected(range: SelectedLineRange | null) {
    // A review comment always refers to one side of the diff.
    setSelection(
      range && (!range.endSide || range.side === range.endSide) ? range : null,
    );
  }

  const visible = (a: Anchor, index: number) => {
    const diff = diffs[index];

    return diff.hunks.some((h) => {
      const start = a.side === "additions" ? h.additionStart : h.deletionStart;
      const count = a.side === "additions" ? h.additionCount : h.deletionCount;

      return a.end >= start && a.end < start + count;
    });
  };

  return (
    <article className="mb-3 overflow-hidden rounded-lg border border-mist-200 bg-mist-950 text-mist-200 dark:border-mist-700">
      <DiffHeader
        file={file}
        collapsed={collapsed}
        toggle={() => setCollapsed(!collapsed)}
        selection={selection}
        onComment={onComment}
        onFullFile={onFullFile}
        added={added}
        removed={removed}
        metadata={metadata}
      />
      {flags
        .filter((f) => !f.anchor)
        .map((f) => (
          <div
            key={f.id}
            className="m-2 rounded border border-mist-600 bg-mist-800 p-2"
          >
            <Markdown text={f.text} />
          </div>
        ))}
      {file.notice || units.length === 0 ? (
        <p className="px-3 py-2 text-xs text-mist-400">
          {file.notice ?? "No changed text lines"}
        </p>
      ) : collapsed ? (
        <button
          className="w-full px-3 py-2 text-left text-xs text-mist-400 hover:text-mist-200"
          onClick={() => setCollapsed(false)}
        >
          {file.role === "generated" ? "Generated output" : "Collapsed diff"} ·
          expand to inspect {added + removed} changed lines
        </button>
      ) : (
        <>
          {diffs.map((diff, index) => {
            const unit = units[index];

            const contextButton = (
              gap: (typeof context)[number]["beforeGap"],
            ) => {
              const Icon =
                gap.direction === "both"
                  ? ChevronsUpDown
                  : gap.direction === "before"
                    ? ChevronUp
                    : ChevronDown;

              return gap.hidden > 0 ? (
                <button
                  className="flex w-full items-center border-y border-mist-800 bg-mist-900 text-left font-sans text-xs text-mist-400 hover:bg-mist-800 hover:text-mist-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mist-300"
                  onClick={() =>
                    setExpandedContext((current) => ({
                      ...current,
                      [gap.key]: true,
                    }))
                  }
                  aria-label={`Expand ${gap.hidden} unmodified lines in ${file.path}`}
                >
                  <span
                    className="flex w-16 shrink-0 justify-center border-r border-mist-800 py-1.5"
                    aria-hidden="true"
                  >
                    <Icon size={14} />
                  </span>
                  <span className="px-3">{gap.hidden} unmodified lines</span>
                </button>
              ) : null;
            };

            const annotations: DiffLineAnnotation<Flag | Comment>[] = [
              ...flags
                .filter((f) => f.anchor && visible(f.anchor, index))
                .map((f) => ({
                  side: f.anchor!.side,
                  lineNumber: f.anchor!.end,
                  metadata: f,
                })),
              ...comments
                .filter((c) => visible(c, index))
                .map((c) => ({ side: c.side, lineNumber: c.end, metadata: c })),
            ];

            return (
              <Fragment key={unit.id}>
                {contextButton(context[index].beforeGap)}
                <FileDiff<Flag | Comment>
                  key={units[index].id}
                  fileDiff={diff}
                  options={{
                    theme: "pierre-dark",
                    themeType: "dark",
                    diffStyle: "unified",
                    disableFileHeader: true,
                    overflow: "wrap",
                    enableLineSelection: true,
                    onLineSelected: selected,
                    hunkSeparators: "simple",
                  }}
                  lineAnnotations={annotations}
                  renderAnnotation={({ metadata }) =>
                    "text" in metadata ? (
                      <div
                        className="m-2 flex gap-2 rounded border border-mist-600 bg-mist-800 p-2 font-sans text-sm leading-5 text-mist-200 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-mist-300 [&_button]:mt-1 [&_button]:text-xs [&_button]:underline [&_button]:underline-offset-2"
                        id={`flag-${metadata.id}`}
                      >
                        <FlagIcon size={15} />
                        <div>
                          <Markdown text={metadata.text} />
                          <button
                            onClick={() =>
                              metadata.anchor && onComment(metadata.anchor)
                            }
                          >
                            Leave feedback here
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="m-2 flex gap-2 rounded border border-mist-600 bg-mist-800 p-2 font-sans text-sm leading-5 text-mist-200 [&>svg]:shrink-0 [&_strong]:font-medium [&_p]:mt-1 [&_p]:whitespace-pre-wrap">
                        <MessageSquare size={15} />
                        <div>
                          <strong>Your feedback</strong>
                          <p>{metadata.body}</p>
                        </div>
                      </div>
                    )
                  }
                />
                {contextButton(context[index].afterGap)}
              </Fragment>
            );
          })}
        </>
      )}
    </article>
  );
}
