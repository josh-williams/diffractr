import { Fragment, useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Flag as FlagIcon,
  MessageSquare,
  Maximize2,
} from "lucide-react";
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
  onFullFile: (file: SourceFile) => void;
}
export default function DiffCard({
  file,
  units,
  allUnits,
  flags,
  comments,
  onComment,
  onFullFile,
}: Props) {
  const [collapsed, setCollapsed] = useState(file.role === "generated");
  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const [expandedContext, setExpandedContext] = useState<
    Record<string, boolean>
  >({});
  const diffs = useMemo(
    () =>
      units.map((u) =>
        unitDiff(file, u, allUnits, {
          before: expandedContext[`${u.id}:before`] ? Infinity : 3,
          after: expandedContext[`${u.id}:after`] ? Infinity : 3,
        }),
      ),
    [file, units, allUnits, expandedContext],
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
      <header className="flex items-center gap-2 border-b border-mist-800 bg-mist-950 px-2 py-1.5 text-mist-200">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left [&>svg]:shrink-0 [&>span]:truncate [&>span]:font-sans [&>span]:text-xs"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${file.path}`}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <FileCode2 size={16} />
          <span>{file.path}</span>
        </button>
        <span className="hidden text-xs text-mist-400 sm:inline">
          {file.role}
        </span>
        <span className="font-sans text-xs text-emerald-400">+{added}</span>
        <span className="font-sans text-xs text-red-400">−{removed}</span>
        <button
          className="inline-flex shrink-0 items-center justify-center rounded p-1 text-mist-400 hover:bg-mist-800 hover:text-white"
          title="Open complete file diff"
          aria-label={`Open complete diff for ${file.path}`}
          onClick={() => onFullFile(file)}
        >
          <Maximize2 size={15} />
        </button>
        {!collapsed && selection && (
          <button
            className="inline-flex items-center gap-1.5 rounded border border-mist-700 px-2 py-1 text-xs text-mist-200 hover:bg-mist-800"
            onClick={() =>
              onComment({
                fileId: file.id,
                side: selection.side ?? "additions",
                start: Math.min(selection.start, selection.end),
                end: Math.max(selection.start, selection.end),
              })
            }
          >
            <MessageSquare size={13} /> Comment on lines{" "}
            {Math.min(selection.start, selection.end)}–
            {Math.max(selection.start, selection.end)}
          </button>
        )}
      </header>
      {collapsed ? (
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
            const siblings = allUnits.filter((u) => u.fileId === file.id);
            const position = siblings.findIndex((u) => u.id === unit.id);
            const previous = siblings[position - 1];
            const next = siblings[position + 1];
            const beforeAvailable = Math.min(
              unit.oldStart -
                (previous ? previous.oldStart + previous.oldCount : 0),
              unit.newStart -
                (previous ? previous.newStart + previous.newCount : 0),
            );
            const afterAvailable = Math.min(
              (next?.oldStart ?? lines(file.before).length) -
                unit.oldStart -
                unit.oldCount,
              (next?.newStart ?? lines(file.after).length) -
                unit.newStart -
                unit.newCount,
            );
            const contextButton = (
              side: "before" | "after",
              available: number,
            ) => {
              const hidden = expandedContext[`${unit.id}:${side}`]
                ? 0
                : Math.max(0, available - 3);
              return hidden > 0 ? (
                <button
                  className="block w-full border-y border-mist-800 bg-mist-900 px-3 py-1.5 text-left font-sans text-xs text-mist-400 hover:bg-mist-800 hover:text-mist-100"
                  onClick={() =>
                    setExpandedContext((current) => ({
                      ...current,
                      [`${unit.id}:${side}`]: true,
                    }))
                  }
                  aria-label={`Expand ${hidden} unmodified lines ${side} change in ${file.path}`}
                >
                  {hidden} unmodified lines · expand
                </button>
              ) : null;
            };
            const annotations: DiffLineAnnotation<Flag | Comment>[] = [
              ...flags
                .filter((f) => visible(f.anchor, index))
                .map((f) => ({
                  side: f.anchor.side,
                  lineNumber: f.anchor.end,
                  metadata: f,
                })),
              ...comments
                .filter((c) => visible(c, index))
                .map((c) => ({ side: c.side, lineNumber: c.end, metadata: c })),
            ];
            return (
              <Fragment key={unit.id}>
                {contextButton("before", beforeAvailable)}
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
                    "anchor" in metadata ? (
                      <div
                        className="m-2 flex gap-2 rounded border border-mist-600 bg-mist-800 p-2 font-sans text-sm leading-5 text-mist-200 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-mist-300 [&_button]:mt-1 [&_button]:text-xs [&_button]:underline [&_button]:underline-offset-2"
                        id={`flag-${metadata.id}`}
                      >
                        <FlagIcon size={15} />
                        <div>
                          <strong>{metadata.title}</strong>
                          <p>{metadata.body}</p>
                          <button onClick={() => onComment(metadata.anchor)}>
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
                {contextButton("after", afterAvailable)}
              </Fragment>
            );
          })}
        </>
      )}
    </article>
  );
}
