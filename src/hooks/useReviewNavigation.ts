import { useEffect, useRef } from "react";

export function useReviewNavigation() {
  const mainScrollRef = useRef<HTMLElement | null>(null);
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

    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, {
      passive: true,
    });
    window.addEventListener("keydown", onKey);

    return () => {
      cancel();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function navigate(id: string) {
    cancelAnimationFrame(scrollFrame.current);
    const target = document.getElementById(`review-${id}`);

    if (!target) return;

    const container = window.matchMedia("(min-width: 768px)").matches
      ? mainScrollRef.current
      : document.scrollingElement;

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
                (container === document.scrollingElement
                  ? 0
                  : container.getBoundingClientRect().top) -
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

  return { mainScrollRef, navigate };
}
