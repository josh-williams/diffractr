import SavedComment from "./SavedComment";
import DiffHeader from "./DiffHeader";
import {
  Fragment,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import { Flag as FlagIcon } from "lucide-react";
import Markdown from "./Markdown";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { contextLayout } from "../core/context";
import {
  unitDiff,
  lines,
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
  editContainer: HTMLElement | null;
  onEditComment: (comment: Comment, container: HTMLElement) => void;
  composerAnchor: Anchor | null;
  revealComposer: boolean;
  setComposerContainer: (node: HTMLDivElement | null) => void;
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
  onEditComment,
  editContainer,
  composerAnchor,
  revealComposer,
  setComposerContainer,
  onFullFile,
  metadata = true,
}: Props) {
  const [collapsed, setCollapsed] = useState(file.role === "generated");

  const hoveredLine = useRef<{
    line: number;
    side: Anchor["side"];
    element: HTMLElement;
  } | null>(null);

  function updateCommentButton() {
    const hovered = hoveredLine.current;

    if (!hovered) return;

    const occupied = [
      ...comments,
      ...(composerAnchor ? [composerAnchor] : []),
    ].some(
      (anchor) =>
        anchor.side === hovered.side &&
        hovered.line >= anchor.start &&
        hovered.line <= anchor.end,
    );

    hovered.element.style.setProperty(
      "--comment-button-visibility",
      occupied ? "hidden" : "visible",
    );
  }

  // Update the hovered row when a draft opens/closes without rebuilding the diff.
  useLayoutEffect(updateCommentButton, [comments, composerAnchor]);

  const [expandedContext, setExpandedContext] = useState<
    Record<string, boolean>
  >({});

  const context = useMemo(() => {
    const expanded = { ...expandedContext };

    const allExpanded = Object.fromEntries(
      units.flatMap((unit) => [
        [`${unit.id}:before`, true],
        [`${unit.id}:after`, true],
      ]),
    );

    const full = contextLayout(file, units, allUnits, allExpanded);

    const anchors = [
      ...comments,
      ...(composerAnchor && revealComposer ? [composerAnchor] : []),
    ];

    units.forEach((unit, index) => {
      for (const anchor of anchors) {
        const start =
          anchor.side === "additions" ? unit.newStart : unit.oldStart;

        const count =
          anchor.side === "additions" ? unit.newCount : unit.oldCount;

        if (anchor.end > start - full[index].before && anchor.end <= start)
          expanded[full[index].beforeGap.key] = true;

        if (
          anchor.end > start + count &&
          anchor.end <= start + count + full[index].after
        )
          expanded[full[index].afterGap.key] = true;
      }
    });

    return contextLayout(file, units, allUnits, expanded);
  }, [
    file,
    units,
    allUnits,
    expandedContext,
    comments,
    composerAnchor,
    revealComposer,
  ]);

  const diffs = useMemo(
    () =>
      units.map((unit, index) =>
        unitDiff(file, unit, allUnits, context[index]),
      ),
    [file, units, allUnits, context],
  );

  const numberWidth = `${Math.max(
    2,
    String(Math.max(lines(file.before).length, lines(file.after).length))
      .length,
  )}ch`;

  const gutterStyle: CSSProperties & {
    "--diffs-min-number-column-width": string;
  } = { "--diffs-min-number-column-width": numberWidth };

  const added = units.reduce((n, u) => n + u.newCount, 0),
    removed = units.reduce((n, u) => n + u.oldCount, 0);

  function commentOnRange(range: SelectedLineRange) {
    if (range.endSide && range.side !== range.endSide) return;
    onComment({
      fileId: file.id,
      side: range.side ?? "additions",
      start: Math.min(range.start, range.end),
      end: Math.max(range.start, range.end),
    });
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
    <article
      className="mb-3 overflow-hidden rounded-lg border border-mist-200 bg-mist-950 text-mist-200 dark:border-mist-700"
      style={gutterStyle}
    >
      <DiffHeader
        file={file}
        collapsed={collapsed}
        toggle={() => setCollapsed(!collapsed)}
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
      ) : collapsed && !composerAnchor ? (
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
                  className="diff-context-separator"
                  onClick={() =>
                    setExpandedContext((current) => ({
                      ...current,
                      [gap.key]: true,
                    }))
                  }
                  aria-label={`Expand ${gap.hidden} unmodified lines in ${file.path}`}
                >
                  <span className="diff-context-icon" aria-hidden="true">
                    <Icon size={14} />
                  </span>
                  <span className="diff-context-label">
                    {gap.hidden} unmodified lines
                  </span>
                </button>
              ) : null;
            };

            const annotations: DiffLineAnnotation<
              Flag | Comment | { composer: true }
            >[] = [
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

            if (
              composerAnchor &&
              visible(composerAnchor, index) &&
              !diffs
                .slice(0, index)
                .some((_, earlier) => visible(composerAnchor, earlier))
            ) {
              annotations.push({
                side: composerAnchor.side,
                lineNumber: composerAnchor.end,
                metadata: { composer: true },
              });
            }

            return (
              <Fragment key={unit.id}>
                {contextButton(context[index].beforeGap)}
                <FileDiff<Flag | Comment | { composer: true }>
                  key={units[index].id}
                  fileDiff={diff}
                  selectedLines={null}
                  options={{
                    theme: "pierre-dark",
                    themeType: "dark",
                    diffStyle: "unified",
                    disableFileHeader: true,
                    overflow: "wrap",
                    enableLineSelection: true,
                    enableGutterUtility: true,
                    onLineEnter: ({
                      lineNumber,
                      annotationSide,
                      numberElement,
                    }) => {
                      hoveredLine.current = {
                        line: lineNumber,
                        side: annotationSide,
                        element: numberElement,
                      };
                      updateCommentButton();
                    },
                    onLineLeave: () => {
                      hoveredLine.current = null;
                    },
                    unsafeCSS:
                      "[data-utility-button] { background-color: var(--diffs-comment-bg); color: white; visibility: var(--comment-button-visibility, visible); }",
                    onGutterUtilityClick: commentOnRange,
                    hunkSeparators: "simple",
                  }}
                  lineAnnotations={annotations}
                  renderAnnotation={({ metadata }) =>
                    "composer" in metadata ? (
                      <div
                        ref={setComposerContainer}
                        className="mx-3 my-2 rounded-md bg-mist-50 font-sans text-sm text-mist-800 dark:bg-mist-900 dark:text-mist-200"
                      />
                    ) : "text" in metadata ? (
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
                      <SavedComment
                        comment={metadata}
                        editContainer={editContainer}
                        onEdit={onEditComment}
                      />
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
