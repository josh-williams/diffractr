import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  FileCode2,
  Flag,
  GitBranch,
  Layers3,
  MessageSquare,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import { z } from "zod";

import {
  anchorSchema,
  exportFeedback,
  indexChanges,
  statistics,
  type Anchor,
  type Comment,
  type SourceFile,
  type Snapshot,
} from "./core/review";
import { validateAnalysis } from "./core/analysis";
import Markdown from "./components/Markdown";
import DiffCard from "./components/DiffCard";
import Dialog from "./components/Dialog";
import Brand from "./components/Brand";
import FullFileDiff from "./components/FullFileDiff";

const roleColors = {
  production: "bg-violet-500",
  tests: "bg-blue-500",
  generated: "bg-cyan-400",
  other: "bg-amber-400",
};
function loadTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("diffraction:theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage is optional. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
const roleLabels = {
  production: "Production",
  tests: "Tests",
  generated: "Generated",
  other: "Other",
};
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
  const validation = useMemo(
    () =>
      inputAnalysis
        ? validateAnalysis(snapshot, inputAnalysis)
        : { analysis: null, units: [], errors: [] },
    [snapshot, inputAnalysis],
  );
  const analysis = validation.analysis;
  const sourceUnits = useMemo(() => indexChanges(snapshot), [snapshot]);
  const units = analysis ? validation.units : sourceUnits;
  const stats = useMemo(
    () => statistics(snapshot, sourceUnits),
    [snapshot, sourceUnits],
  );
  const storageKey = `diffraction:feedback:${snapshot.id}`;
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
        .safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
      if (!result.success) return [];
      exportFeedback(snapshot, result.data);
      return result.data;
    } catch {
      return [];
    }
  }

  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("diffraction:theme", theme);
    } catch {
      /* Keep the switch usable without storage. */
    }
  }, [theme]);
  const [page, setPage] = useState("overview");
  const [comments, setComments] = useState<Comment[]>(loadComments);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fullFile, setFullFile] = useState<SourceFile | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(comments));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [comments]);
  const total = stats.reduce((n, s) => n + s.additions + s.deletions, 0);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const scrollContainer = mainScrollRef.current;
    if (!scrollContainer) return;
    const parts = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>("[data-review-part]"),
    );
    let frame = 0;
    const update = () => {
      frame = 0;
      let active: HTMLElement | undefined = parts[0];
      for (const part of parts) {
        if (part.getBoundingClientRect().top <= 120) active = part;
      }
      if (
        scrollContainer.scrollTop > 0 &&
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - 2
      ) {
        active = parts.at(-1);
      }
      if (active) setPage(active.dataset.reviewPart!);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scrollContainer.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(scrollContainer);
    update();
    return () => {
      scrollContainer.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const scrollFrame = useRef(0);
  useEffect(() => {
    const cancel = () => cancelAnimationFrame(scrollFrame.current);
    const onKey = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        cancel();
    };
    mainScrollRef.current?.addEventListener("wheel", cancel, { passive: true });
    mainScrollRef.current?.addEventListener("touchstart", cancel, {
      passive: true,
    });
    window.addEventListener("keydown", onKey);
    return () => {
      cancel();
      mainScrollRef.current?.removeEventListener("wheel", cancel);
      mainScrollRef.current?.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  function navigate(id: string) {
    cancelAnimationFrame(scrollFrame.current);
    const target = document.getElementById(`review-${id}`);
    if (!target) return;
    const container = mainScrollRef.current;
    if (!container) return;
    const start = container.scrollTop;
    const end =
      id === "overview"
        ? 0
        : Math.max(
            0,
            Math.min(
              start +
                target.getBoundingClientRect().top -
                container.getBoundingClientRect().top -
                16,
              container.scrollHeight - container.clientHeight,
            ),
          );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      container.scrollTo({ top: end, behavior: "instant" });
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - started) / 300, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      container.scrollTo({
        top: start + (end - start) * eased,
        behavior: "instant",
      });
      if (progress < 1) scrollFrame.current = requestAnimationFrame(step);
    };
    scrollFrame.current = requestAnimationFrame(step);
  }
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
    link.download = "diffraction-feedback.md";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="min-h-screen md:flex md:h-screen md:overflow-hidden md:overscroll-none bg-mist-50 dark:bg-mist-900 bg-linear-to-br from-violet-500/3 via-transparent to-cyan-500/3 text-sm text-mist-800 dark:text-mist-200">
      <aside className="border-b border-mist-200 dark:border-mist-800 bg-mist-100/80 dark:bg-mist-950/30 p-2 md:overflow-y-auto md:h-full md:min-h-0 md:shrink-0 md:w-60 md:border-r md:border-b-0">
        <Brand />
        <nav aria-label="Review navigation" className="space-y-1 text-sm">
          <button
            className={`sidebar-item flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left ${page === "overview" ? "text-mist-950 dark:text-mist-100" : "text-mist-600 dark:text-mist-400 hover:bg-mist-200/60 dark:hover:bg-mist-800/70"}`}
            aria-current={page === "overview" ? "location" : undefined}
            onClick={() => navigate("overview")}
          >
            <span className="font-medium text-mist-950 dark:text-mist-100">
              Overview
            </span>
          </button>
          {analysis?.sections.map((s) => {
            const owned = units.filter((unit) => s.unitIds.includes(unit.id));
            const fileCount = s.fileIds.length;
            const lineCount = owned.reduce(
              (n, unit) => n + unit.newCount + unit.oldCount,
              0,
            );
            const flagCount = analysis.flags.filter(
              (flag) => flag.sectionId === s.id,
            ).length;
            return (
              <button
                key={s.id}
                className={`sidebar-item flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left ${page === s.id ? "text-mist-950 dark:text-mist-100" : "text-mist-600 dark:text-mist-400 hover:bg-mist-200/60 dark:hover:bg-mist-800/70"}`}
                aria-current={page === s.id ? "location" : undefined}
                onClick={() => navigate(s.id)}
              >
                <span className="flex-1">
                  <span className="block font-medium text-mist-950 dark:text-mist-100">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-xs text-mist-500 dark:text-mist-400">
                    {fileCount} files · {lineCount} lines · {flagCount}{" "}
                    {flagCount === 1 ? "flag" : "flags"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
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
          <section
            id="review-overview"
            data-review-part="overview"
            aria-label="Overview"
          >
            <h1>
              {analysis?.title ??
                (snapshot.files.length ? "Local changes" : "No local changes")}
            </h1>
            <div className="mt-2 max-w-5xl leading-6 text-mist-600 dark:text-mist-400">
              <Markdown
                text={
                  analysis?.summary ??
                  (inputAnalysis
                    ? "Analysis could not be validated. All changed files are available below."
                    : `${snapshot.repository} · ${snapshot.files.length} changed files`)
                }
              />
            </div>
            {!analysis &&
              (inputAnalysis != null || analysisErrors.length > 0) && (
                <div
                  className="my-3 rounded border border-mist-300 dark:border-mist-700 bg-mist-100 dark:bg-mist-900 p-3 [&_button]:underline"
                  role="alert"
                >
                  <strong>Analysis unavailable</strong>
                  <ul>
                    {[...analysisErrors, ...validation.errors].map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <button onClick={() => navigate("files")}>
                    Open all files
                  </button>
                </div>
              )}
            <div className="my-4 flex flex-wrap gap-4 text-xs text-mist-500 dark:text-mist-400 [&>span]:flex [&>span]:items-center [&>span]:gap-1.5">
              <span>
                <FileCode2 size={15} />
                {snapshot.files.length} files
              </span>
              <span>
                <Layers3 size={15} />
                {analysis?.sections.length ?? 0} change groups
              </span>
              <span>
                <Flag size={15} />
                {analysis?.flags.length ?? 0} flags
              </span>
            </div>
            <section
              className="mb-5 rounded-lg border border-mist-200 dark:border-mist-700 bg-white/80 dark:bg-mist-800/40 p-4"
              aria-label="Change size breakdown"
            >
              <div className="flex items-center justify-between gap-4 [&_p]:mt-1 [&_p]:text-xs [&_p]:text-mist-500 [&_p]:dark:text-mist-400 [&>strong]:flex [&>strong]:items-baseline [&>strong]:gap-2 [&>strong]:text-xl [&>strong>span]:text-xs [&>strong>span]:font-normal [&>strong>span]:text-mist-500 [&>strong>span]:dark:text-mist-400">
                <div>
                  <h2>Change size</h2>
                </div>
                <strong>
                  {total}
                  <span>changed lines</span>
                </strong>
              </div>
              <div className="my-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {stats
                  .filter((s) => s.additions + s.deletions > 0)
                  .map((s) => (
                    <div
                      key={s.role}
                      className={roleColors[s.role]}
                      style={{ flex: s.additions + s.deletions }}
                      title={`${roleLabels[s.role]}: ${s.additions + s.deletions} lines`}
                    />
                  ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 [&>div]:flex [&>div]:items-center [&>div]:gap-2 [&_strong]:ml-auto [&_strong]:font-medium [&_small]:text-xs [&_small]:text-mist-500 [&_small]:dark:text-mist-400">
                {stats.map((s) => (
                  <div key={s.role}>
                    <span
                      className={`size-2.5 rounded-full ${roleColors[s.role]}`}
                    />
                    <span>{roleLabels[s.role]}</span>
                    <strong>{s.additions + s.deletions}</strong>
                    <small>
                      +{s.additions} / −{s.deletions}
                    </small>
                  </div>
                ))}
              </div>
            </section>
            {analysis && (
              <div className="mb-2 flex items-center justify-between gap-3 [&_p]:mt-1 [&_p]:text-xs [&_p]:text-mist-500 [&_p]:dark:text-mist-400 [&>span]:text-xs [&>span]:text-mist-500 [&>span]:dark:text-mist-400">
                <div>
                  <h2>Change groups</h2>
                </div>
                <span>{analysis?.sections.length ?? 0} groups</span>
              </div>
            )}
            <div className="space-y-2">
              {analysis?.sections.map((s, i) => {
                const owned = units.filter((u) => s.unitIds.includes(u.id));
                return (
                  <button
                    key={s.id}
                    className="flex w-full items-start gap-3 rounded-lg border border-mist-200 bg-white/80 p-3 text-left transition-colors dark:border-mist-700 dark:bg-mist-800/40 hover:bg-mist-100 hover:dark:bg-mist-900 [&>div]:min-w-0 [&>div]:flex-1 [&_p]:mt-1 [&_p]:text-sm [&_p]:leading-5 [&_p]:text-mist-600 [&_p]:dark:text-mist-400 [&>svg]:mt-1 [&>svg]:shrink-0 [&>svg]:text-mist-400 [&>svg]:dark:text-mist-500"
                    onClick={() => navigate(s.id)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-mist-200 bg-mist-100 font-medium text-mist-600 tabular-nums dark:border-mist-700 dark:bg-mist-800 dark:text-mist-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      <Markdown text={s.description.split("\n\n")[0]} />
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-mist-500 dark:text-mist-400">
                        <span>{s.fileIds.length} files</span>
                        <span>
                          {owned.reduce(
                            (n, u) => n + u.newCount + u.oldCount,
                            0,
                          )}{" "}
                          changed lines
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-mist-500 dark:text-mist-400">
                          <Flag size={12} />
                          {
                            analysis.flags.filter((f) => f.sectionId === s.id)
                              .length
                          }{" "}
                          flag
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={19} />
                  </button>
                );
              })}
            </div>
          </section>
          {(analysis?.sections ?? [null]).map((section, sectionIndex) => {
            const selected = section
              ? units.filter((unit) => section.unitIds.includes(unit.id))
              : units;
            const groups = [
              ...new Set(
                section
                  ? section.fileIds
                  : snapshot.files.map((file) => file.id),
              ),
            ].map((id) => ({
              file: snapshot.files.find((file) => file.id === id)!,
              metadata: !section || section.metadataFileIds.includes(id),
              units: selected.filter((unit) => unit.fileId === id),
            }));
            const flags =
              analysis?.flags.filter(
                (flag) => flag.sectionId === section?.id,
              ) ?? [];
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
                {groups.map((group) => (
                  <DiffCard
                    key={`${id}:${group.file.id}`}
                    {...group}
                    allUnits={sourceUnits}
                    flags={flags.filter((f) => f.fileId === group.file.id)}
                    comments={comments.filter(
                      (c) => c.fileId === group.file.id,
                    )}
                    onComment={commentAt}
                    onFullFile={setFullFile}
                  />
                ))}
              </section>
            );
          })}
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
                <button onClick={download}>
                  <Download size={15} />
                  Download
                </button>
                <button
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
