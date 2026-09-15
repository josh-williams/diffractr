import { useTheme } from "./hooks/useTheme";
import { useFeedbackStorage } from "./hooks/useFeedbackStorage";
import { useReviewNavigation } from "./hooks/useReviewNavigation";
import ReviewOverview from "./components/ReviewOverview";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Clipboard,
  Download,
  GitBranch,
  MessageSquare,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";

import {
  exportFeedback,
  indexChanges,
  statistics,
  type Anchor,
  type SourceFile,
  type Snapshot,
} from "./core/review";
import { analysisSchema, validateAnalysis } from "./core/analysis";
import ReviewGroups from "./components/ReviewGroups";
import Dialog from "./components/Dialog";
import ReviewSidebar from "./components/ReviewSidebar";
import FullFileDiff from "./components/FullFileDiff";

export default function App({
  snapshot,
  inputAnalysis,
  example = false,
  analysisErrors = [],
}: {
  snapshot: Snapshot;
  inputAnalysis?: unknown;
  example?: boolean;
  analysisErrors?: string[];
}) {
  const validation = useMemo(() => {
    if (!inputAnalysis) return { analysis: null, units: [], errors: [] };
    const parsed = analysisSchema.safeParse(inputAnalysis);

    return parsed.success
      ? validateAnalysis(snapshot, parsed.data)
      : {
          analysis: null,
          units: [],
          errors: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        };
  }, [snapshot, inputAnalysis]);

  const analysis = validation.analysis;
  const sourceUnits = useMemo(() => indexChanges(snapshot), [snapshot]);
  const units = analysis ? validation.units : sourceUnits;

  const stats = useMemo(
    () => statistics(snapshot, sourceUnits),
    [snapshot, sourceUnits],
  );

  const [theme, setTheme] = useTheme();
  const { comments, setComments, storageError } = useFeedbackStorage(snapshot);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fullFile, setFullFile] = useState<SourceFile | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const { mainScrollRef, navigate } = useReviewNavigation();

  function commentAt(a: Anchor) {
    setAnchor(a);
    setDraft("");
  }

  function saveComment() {
    if (!anchor || !draft.trim()) return;
    setComments([
      ...comments,
      {
        ...anchor,
        id: crypto.randomUUID(),
        snapshotId: snapshot.id,
        body: draft.trim(),
      },
    ]);
    setAnchor(null);
  }

  async function copyFeedback() {
    try {
      await navigator.clipboard.writeText(exportFeedback(snapshot, comments));
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Clipboard unavailable. Use Download instead.");
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([exportFeedback(snapshot, comments)], { type: "text/markdown" }),
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "diffractr-feedback.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen md:flex md:h-screen md:overflow-hidden md:overscroll-none bg-mist-50 dark:bg-mist-900 bg-linear-to-br from-violet-500/3 via-transparent to-cyan-500/3 text-sm text-mist-800 dark:text-mist-200">
      <ReviewSidebar
        analysis={analysis}
        units={units}
        mainScrollRef={mainScrollRef}
        navigate={navigate}
      />
      <div className="min-w-0 md:h-full md:min-h-0 md:min-w-0 md:flex-1 md:flex md:flex-col">
        <header className="flex min-h-12 flex-none flex-wrap items-center justify-between gap-2 border-b border-mist-200 bg-mist-50/95 px-4 py-2 backdrop-blur dark:border-mist-800 dark:bg-mist-900/95 md:px-6">
          <div className="flex items-center gap-2 text-mist-500 dark:text-mist-400 [&_strong]:font-medium [&_strong]:text-mist-800 [&_strong]:dark:text-mist-200">
            <span>Reviews</span>
            <ChevronRight size={14} />
            <strong>
              {example ? "Team invitations" : snapshot.repository}
            </strong>
            <span
              className="rounded border border-mist-300 dark:border-mist-700 px-1.5 py-0.5 text-xs text-mist-500 dark:text-mist-400"
              title={
                example
                  ? "Bundled example"
                  : `Snapshot ${snapshot.id.slice(0, 12)}`
              }
            >
              {example ? "Example" : "Local snapshot"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-mist-200 bg-white p-2 text-mist-500 hover:bg-mist-100 dark:border-mist-700 dark:bg-mist-900 dark:text-mist-300 dark:hover:bg-mist-800"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded border border-mist-300 dark:border-mist-700 bg-white dark:bg-mist-900 px-2.5 py-1.5 hover:bg-mist-100 hover:dark:bg-mist-900 [&_span]:text-mist-500 [&_span]:dark:text-mist-400"
              onClick={() => {
                setFeedbackOpen(true);
                setCopyStatus("");
              }}
            >
              <MessageSquare size={16} />
              Your feedback<span>{comments.length}</span>
            </button>
          </div>
        </header>
        {storageError && (
          <div
            className="border-b border-mist-300 dark:border-mist-700 bg-mist-100 dark:bg-mist-900 px-4 py-2 text-sm text-mist-700 dark:text-mist-300"
            role="status"
          >
            Browser storage is unavailable. Export your feedback before closing
            this page.
          </div>
        )}
        <main
          ref={mainScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2 font-sans text-xs text-mist-500 dark:text-mist-400">
            <GitBranch size={14} />
            <span>{snapshot.branch}</span>
            <span className="text-mist-400 dark:text-mist-500">←</span>
            <span title={snapshot.mergeBase}>{snapshot.base}</span>
            <span className="rounded bg-mist-200 dark:bg-mist-800 px-1.5 py-0.5 font-sans text-mist-600 dark:text-mist-400">
              Local changes
            </span>
          </div>
          <ReviewOverview
            snapshot={snapshot}
            analysis={analysis}
            units={units}
            stats={stats}
            hasAnalysis={inputAnalysis != null}
            errors={[...analysisErrors, ...validation.errors]}
            navigate={navigate}
          />
          <ReviewGroups
            snapshot={snapshot}
            analysis={analysis}
            units={units}
            sourceUnits={sourceUnits}
            comments={comments}
            commentAt={commentAt}
            setFullFile={setFullFile}
          />
        </main>
      </div>
      {anchor && (
        <Dialog title="Leave feedback" onClose={() => setAnchor(null)}>
          <form
            className="p-3 [&>label]:mb-2 [&>label]:block [&>textarea]:w-full [&>textarea]:rounded [&>textarea]:border [&>textarea]:border-mist-300 [&>textarea]:dark:border-mist-700 [&>textarea]:bg-white [&>textarea]:dark:bg-mist-900 [&>textarea]:p-2 [&>textarea]:outline-mist-500"
            onSubmit={(e) => {
              e.preventDefault();
              saveComment();
            }}
          >
            <div className="mb-3 rounded bg-mist-100 dark:bg-mist-900 p-2 font-sans text-xs leading-5 text-mist-600 dark:text-mist-400 wrap-anywhere">
              {snapshot.files.find((f) => f.id === anchor.fileId)?.path}
              <br />
              {anchor.side === "additions" ? "New" : "Old"} lines {anchor.start}
              –{anchor.end}
            </div>
            <label htmlFor="comment">What should change?</label>
            <textarea
              id="comment"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe the behavior or decision you want revisited…"
              rows={5}
            />
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-mist-200 dark:border-mist-800 p-3 [&>button]:inline-flex [&>button]:items-center [&>button]:gap-2 [&>span]:mr-auto [&>span]:text-xs [&>span]:text-mist-500 [&>span]:dark:text-mist-400">
              <button type="button" onClick={() => setAnchor(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
                disabled={!draft.trim()}
              >
                Save feedback
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {feedbackOpen && (
        <Dialog
          title={`Your feedback (${comments.length})`}
          onClose={() => setFeedbackOpen(false)}
        >
          {comments.length ? (
            <>
              <div className="max-h-[45vh] space-y-2 overflow-auto p-3 [&_article]:flex [&_article]:justify-between [&_article]:gap-2 [&_article]:rounded [&_article]:border [&_article]:border-mist-200 [&_article]:dark:border-mist-800 [&_article]:p-2 [&_strong]:block [&_strong]:font-sans [&_strong]:text-xs [&_strong]:wrap-anywhere [&_span]:text-xs [&_span]:text-mist-500 [&_span]:dark:text-mist-400 [&_p]:mt-2 [&_p]:whitespace-pre-wrap [&_p]:wrap-anywhere">
                {comments.map((c) => (
                  <article key={c.id}>
                    <div>
                      <strong>
                        {snapshot.files.find((f) => f.id === c.fileId)?.path}
                      </strong>
                      <span>
                        {c.side === "additions" ? "New" : "Old"} lines {c.start}
                        –{c.end}
                      </span>
                      <p>{c.body}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center justify-center rounded p-1 text-mist-500 dark:text-mist-400 hover:bg-mist-200 hover:dark:bg-mist-800 hover:text-mist-900 hover:dark:text-mist-100"
                      aria-label={`Delete comment on line ${c.start}`}
                      onClick={() =>
                        setComments(comments.filter((x) => x.id !== c.id))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-mist-200 dark:border-mist-800 p-3 [&>button]:inline-flex [&>button]:items-center [&>button]:gap-2 [&>span]:mr-auto [&>span]:text-xs [&>span]:text-mist-500 [&>span]:dark:text-mist-400">
                <span role="status">{copyStatus}</span>
                <button type="button" onClick={download}>
                  <Download size={15} />
                  Download
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
                  onClick={copyFeedback}
                >
                  {copyStatus === "Copied" ? (
                    <Check size={15} />
                  ) : (
                    <Clipboard size={15} />
                  )}
                  Copy for Codex
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-mist-500 dark:text-mist-400">
              <MessageSquare size={30} />
              <h3>No feedback yet</h3>
            </div>
          )}
        </Dialog>
      )}
      {fullFile && (
        <Dialog wide title={fullFile.path} onClose={() => setFullFile(null)}>
          <FullFileDiff file={fullFile} />
        </Dialog>
      )}
    </div>
  );
}
