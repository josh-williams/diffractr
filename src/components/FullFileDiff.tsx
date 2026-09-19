import { useEffect, useRef } from "react";
import { FileDiff } from "@pierre/diffs";
import { fileDiff, type SourceFile } from "../core/review";
import { expandableSeparator } from "./expandableSeparator";

export default function FullFileDiff({ file }: { file: SourceFile }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = container.current!;

    if (file.before === file.after) return;

    // Custom separator slots are owned by the imperative renderer.
    const viewer = new FileDiff({
      theme: "pierre-dark",
      themeType: "dark",
      diffStyle: "unified",
      disableFileHeader: true,
      overflow: "wrap",
      hunkSeparators: expandableSeparator,
    });

    viewer.render({ fileDiff: fileDiff(file), containerWrapper: host });

    return () => {
      viewer.cleanUp();
      host.replaceChildren();
    };
  }, [file]);

  if (file.before === file.after)
    return (
      <pre className="overflow-auto whitespace-pre-wrap bg-mist-950 p-3 font-mono text-xs text-mist-200">
        {file.after || "Empty file"}
      </pre>
    );

  return <div ref={container} />;
}
