#!/usr/bin/env node
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {import('../src/core/review').Snapshot} snapshot
 * @param {{port?: number, analysis?: unknown, errors?: string[], dist?: string}} options
 * @returns {Promise<{server: import('node:http').Server, url: string}>}
 */
export function serveSnapshot(
  snapshot,
  {
    port = 0,
    analysis,
    errors = [],
    dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/viewer"),
  } = {},
) {
  if (!existsSync(resolve(dist, "index.html")))
    throw new Error("Build the app first: npm run build");
  const token = randomBytes(24).toString("hex");

  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  const server = createServer((req, res) => {
    const authority = `127.0.0.1:${server.address().port}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (
      req.headers.host !== authority ||
      (req.headers.origin && req.headers.origin !== `http://${authority}`)
    ) {
      res.writeHead(403).end();

      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405).end();

      return;
    }

    const url = new URL(req.url, `http://${authority}`);

    if (["/api/snapshot", "/api/review"].includes(url.pathname)) {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403).end();

        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          url.pathname === "/api/snapshot"
            ? snapshot
            : { snapshot, analysis, errors },
        ),
      );

      return;
    }

    try {
      const path = resolve(
        dist,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );

      if (!path.startsWith(dist + sep)) {
        res.writeHead(404).end();

        return;
      }

      res.setHeader(
        "Content-Type",
        mime[extname(path)] ?? "application/octet-stream",
      );
      const bytes = readFileSync(path);
      res.end(
        extname(path) === ".html"
          ? bytes
              .toString()
              .replace(
                "<head>",
                '<head><meta name="diffractr-local-review" content="true">',
              )
          : bytes,
      );
    } catch {
      res.writeHead(404).end();
    }
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolveServer({
        server,
        url: `http://127.0.0.1:${server.address().port}/#snapshot=${token}`,
      }),
    );
  });
}
