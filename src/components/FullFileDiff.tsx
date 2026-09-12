import { useEffect, useRef } from "react";
import { FileDiff } from "@pierre/diffs";
import { fileDiff, type SourceFile } from "../core/review";
import { expandableSeparator } from "./expandableSeparator";

export default function FullFileDiff({ file }: { file: SourceFile }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = container.current!;
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
  return <div ref={container} />;
}
