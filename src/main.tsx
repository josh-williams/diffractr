import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { preloadHighlighter } from "@pierre/diffs";
import App from "./App";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<p role="status">Loading review…</p>);
// Initialize before mounting diff viewers so their first render has a highlighter.
preloadHighlighter({ themes: ["pierre-dark"], langs: ["typescript", "yaml"] })
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch(() =>
    root.render(
      <main role="alert">
        <h1>Unable to load the review</h1>
        <p>Reload the page to try again.</p>
      </main>,
    ),
  );
