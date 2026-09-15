import { useEffect, useState, type RefObject } from "react";
import type { Analysis, ChangeUnit } from "../core/review";
import Brand from "./Brand";

// Scroll tracking owns only navigation state, keeping the diff tree out of scroll updates.
export default function ReviewSidebar({
  analysis,
  units,
  mainScrollRef,
  navigate,
}: {
  analysis: Analysis | null;
  units: ChangeUnit[];
  mainScrollRef: RefObject<HTMLElement | null>;
  navigate: (id: string) => void;
}) {
  const [page, setPage] = useState("overview");
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
  }, [mainScrollRef, analysis]);

  return (
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
  );
}
