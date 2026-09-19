import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  MessageSquare,
  Maximize2,
} from "lucide-react";
import type { SelectedLineRange } from "@pierre/diffs";
import type { SourceFile, Anchor } from "../core/review";
import { fileLabel } from "../core/review";

export default function DiffHeader({
  file,
  collapsed,
  toggle,
  selection,
  onComment,
  onFullFile,
  added,
  removed,
  metadata,
}: {
  file: SourceFile;
  collapsed: boolean;
  toggle: () => void;
  selection: SelectedLineRange | null;
  onComment: (anchor: Anchor) => void;
  onFullFile: (file: SourceFile) => void;
  added: number;
  removed: number;
  metadata: boolean;
}) {
  return (
    <>
      <header className="flex items-center gap-2 border-b border-mist-800 bg-mist-950 px-2 py-1.5 text-mist-200">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left [&>svg]:shrink-0 [&>span]:truncate [&>span]:font-sans [&>span]:text-xs"
          onClick={() => toggle()}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${fileLabel(file)}`}
          title={fileLabel(file)}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <FileCode2 size={16} />
          <span>{fileLabel(file)}</span>
        </button>
        <span className="hidden text-xs text-mist-400 sm:inline">
          {file.role}
        </span>
        {!file.notice && (
          <span className="font-sans text-xs text-emerald-400">+{added}</span>
        )}
        {!file.notice && (
          <span className="font-sans text-xs text-red-400">−{removed}</span>
        )}
        <button
          className="inline-flex shrink-0 items-center justify-center rounded p-1 text-mist-400 hover:bg-mist-800 hover:text-white"
          disabled={
            !!file.notice || (!file.oldPath && file.before === file.after)
          }
          title="Open complete file diff"
          aria-label={`Open complete diff for ${fileLabel(file)}`}
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
      {metadata && file.oldPath && (
        <p className="border-b border-mist-800 px-3 py-1.5 text-xs text-mist-400">
          Renamed
          {file.renameSimilarity === undefined
            ? ""
            : ` · Git similarity ${file.renameSimilarity}%`}
        </p>
      )}
      {metadata &&
        file.oldMode !== undefined &&
        file.oldMode !== file.newMode && (
          <p className="border-b border-mist-800 px-3 py-1.5 text-xs text-mist-400">
            {file.oldMode === null
              ? "Added file"
              : file.newMode === null
                ? "Deleted file"
                : `Mode ${file.oldMode} → ${file.newMode}`}
          </p>
        )}
    </>
  );
}
