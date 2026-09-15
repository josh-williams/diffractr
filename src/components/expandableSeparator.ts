import type { HunkData } from "@pierre/diffs";

// The renderer owns full-file expansion; make the whole separator its control.
export function expandableSeparator(
  hunk: HunkData,
  instance: {
    expandHunk: (index: number, direction: "both", count?: number) => void;
  },
) {
  if (!hunk.expandable) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "block w-full border-y border-mist-800 bg-mist-900 px-3 py-1.5 text-left font-sans text-xs text-mist-400 hover:bg-mist-800 hover:text-mist-100";
  button.textContent = `${hunk.lines} unmodified lines · expand`;
  button.setAttribute("aria-label", `Expand ${hunk.lines} unmodified lines`);
  button.onclick = () =>
    instance.expandHunk(hunk.hunkIndex, "both", hunk.lines);

  return button;
}
