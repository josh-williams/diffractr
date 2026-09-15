import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

function Diagram({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false,
      revision = 0;
    async function render() {
      const current = ++revision;
      try {
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "base",
          themeVariables: {
            fontFamily: "IBM Plex Sans",
            primaryColor: document.documentElement.classList.contains("dark")
              ? "#272a34"
              : "#edeef1",
            primaryTextColor: document.documentElement.classList.contains(
              "dark",
            )
              ? "#e5e7eb"
              : "#181b23",
            primaryBorderColor: "#6b7280",
            lineColor: "#6b7280",
          },
        });
        const { svg } = await mermaid.render(
          `diagram-${crypto.randomUUID()}`,
          code,
        );
        if (!cancelled && current === revision && host.current) {
          host.current.innerHTML = svg;
          setError("");
        }
      } catch {
        if (!cancelled && current === revision) {
          if (host.current) host.current.replaceChildren();
          setError("Unable to render this diagram.");
        }
      }
    }
    void render();
    const observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [code]);
  return (
    <div className="my-3 rounded border border-mist-200 p-3 dark:border-mist-700">
      <div ref={host} className="overflow-x-auto [&_svg]:max-w-full" />
      {error && (
        <details role="status">
          <summary>{error}</summary>
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {code}
          </pre>
        </details>
      )}
    </div>
  );
}
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-xl [&_h2]:text-lg [&_h3]:font-semibold">
      <ReactMarkdown
        skipHtml
        components={{
          pre: ({ children }) => (
            <div className="overflow-x-auto whitespace-pre-wrap">
              {children}
            </div>
          ),
          code: ({ className, children }) =>
            className === "language-mermaid" ? (
              <Diagram code={String(children).trimEnd()} />
            ) : (
              <code className={className}>{children}</code>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
