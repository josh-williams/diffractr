import { ArrowRight, FileCode2, Layers3, Flag } from "lucide-react";
import {
  statistics,
  type Snapshot,
  type Analysis,
  type ChangeUnit,
} from "../core/review";
import Markdown from "./Markdown";

const roleColors = {
  production: "bg-violet-500",
  tests: "bg-blue-500",
  generated: "bg-cyan-400",
  other: "bg-amber-400",
};

const roleLabels = {
  production: "Production",
  tests: "Tests",
  generated: "Generated",
  other: "Other",
};

export default function ReviewOverview({
  snapshot,
  analysis,
  units,
  stats,
  hasAnalysis,
  errors,
  navigate,
}: {
  snapshot: Snapshot;
  analysis: Analysis | null;
  units: ChangeUnit[];
  stats: ReturnType<typeof statistics>;
  hasAnalysis: boolean;
  errors: string[];
  navigate: (id: string) => void;
}) {
  const total = stats.reduce((n, s) => n + s.additions + s.deletions, 0);

  return (
    <section
      id="review-overview"
      data-review-part="overview"
      aria-label="Overview"
    >
      <h1>
        {analysis?.title ??
          snapshot.pullRequest?.title ??
          (snapshot.files.length ? "Local changes" : "No local changes")}
      </h1>
      <div className="mt-2 max-w-5xl leading-6 text-mist-600 dark:text-mist-400">
        <Markdown
          text={
            analysis?.summary ??
            (hasAnalysis
              ? "Analysis could not be validated. All changed files are available below."
              : `${snapshot.repository} · ${snapshot.files.length} changed files`)
          }
        />
      </div>
      {!analysis && (hasAnalysis || errors.length > 0) && (
        <div
          className="my-3 rounded border border-mist-300 dark:border-mist-700 bg-mist-100 dark:bg-mist-900 p-3 [&_button]:underline"
          role="alert"
        >
          <strong>Analysis unavailable</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button type="button" onClick={() => navigate("files")}>
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
              <span className={`size-2.5 rounded-full ${roleColors[s.role]}`} />
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
              type="button"
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
                    {owned.reduce((n, u) => n + u.newCount + u.oldCount, 0)}{" "}
                    changed lines
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-mist-500 dark:text-mist-400">
                    <Flag size={12} />
                    {
                      analysis.flags.filter((f) => f.sectionId === s.id).length
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
  );
}
