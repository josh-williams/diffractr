import { z } from "zod";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { preloadHighlighter } from "@pierre/diffs";
import App from "./App";
import {
  snapshot as exampleSnapshot,
  analysis as exampleAnalysis,
} from "./examples/invitations";
import { snapshotSchema } from "./core/snapshot";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

root.render(<p role="status">Loading review…</p>);

async function start() {
  const token = new URLSearchParams(location.hash.slice(1)).get("snapshot");

  if (!token && document.querySelector('meta[name="diffractr-local-review"]')) {
    throw new Error(
      "Open the complete review URL printed by the local command, including its snapshot fragment.",
    );
  }

  let snapshot = exampleSnapshot;
  let inputAnalysis: unknown = exampleAnalysis;
  let analysisErrors: string[] = [];

  if (token) {
    const response = await fetch("/api/review", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok)
      throw new Error(
        "Unable to load this snapshot. Restart the review command and open its URL.",
      );
    const review = await response.json();
    snapshot = snapshotSchema.parse(review.snapshot);
    inputAnalysis = review.analysis;
    analysisErrors = z.array(z.string()).catch([]).parse(review.errors);
  }

  await preloadHighlighter({
    themes: ["pierre-dark"],
    langs: ["typescript", "yaml"],
  });
  root.render(
    <StrictMode>
      <App
        key={snapshot.id}
        snapshot={snapshot}
        inputAnalysis={inputAnalysis}
        analysisErrors={analysisErrors}
        example={!token}
      />
    </StrictMode>,
  );
}

start().catch((error) =>
  root.render(
    <main role="alert" className="p-6">
      <h1>Unable to load the review</h1>
      <p>
        {error instanceof Error
          ? error.message
          : "Reload the page to try again."}
      </p>
    </main>,
  ),
);
