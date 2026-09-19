#!/usr/bin/env node
import { createReviewService } from "./github-review.ts";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Server } from "node:http";
import type { Snapshot } from "../src/core/review.ts";
import type { AuthoredAnalysis } from "../src/core/analysis.ts";

export interface ServerOptions {
  port?: number;
  analysis?: AuthoredAnalysis;
  errors?: string[];
  dist?: string;
}

export interface SnapshotServer {
  server: Server;
  url: string;
}

function listeningPort(server: Server): number {
  const address = server.address();

  // Node returns a string for Unix sockets; this server requires a TCP address.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (!address || typeof address === "string")
    throw new Error("Review server is not listening on a TCP port.");

  return address.port;
}

export function serveSnapshot(
  snapshot: Snapshot,
  {
    port = 0,
    analysis,
    errors = [],
    dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/viewer"),
  }: ServerOptions = {},
): Promise<SnapshotServer> {
  if (!existsSync(resolve(dist, "index.html")))
    throw new Error("Build the app first: npm run build");
  const token = randomBytes(24).toString("hex");

  const github = snapshot.pullRequest ? createReviewService(snapshot) : null;

  const mime = new Map<string, string>([
    [".html", "text/html"],
    [".js", "text/javascript"],
    [".css", "text/css"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
  ]);

  const server = createServer(async (req, res) => {
    const authority = `127.0.0.1:${listeningPort(server)}`;
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

    const url = new URL(req.url ?? "/", `http://${authority}`);

    if (url.pathname === "/api/github-review" && github) {
      if (
        req.headers.authorization !== `Bearer ${token}` ||
        (req.method !== "GET" && req.headers.origin !== `http://${authority}`)
      ) {
        res.writeHead(403).end();

        return;
      }

      res.setHeader("Content-Type", "application/json");

      try {
        if (req.method === "GET") res.end(JSON.stringify(await github.read()));
        else if (
          req.method === "POST" &&
          req.headers["content-type"] === "application/json"
        ) {
          let body = "";

          for await (const chunk of req) {
            body += chunk;

            if (Buffer.byteLength(body) > 256 * 1024)
              throw new Error("Review request is too large.");
          }

          res.end(JSON.stringify(await github.mutate(JSON.parse(body))));
        } else res.writeHead(405).end();
      } catch (error) {
        res.writeHead(400).end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "GitHub review request failed.",
          }),
        );
      }

      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405).end();

      return;
    }

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
        mime.get(extname(path)) ?? "application/octet-stream",
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
        url: `http://127.0.0.1:${listeningPort(server)}/#snapshot=${token}`,
      }),
    );
  });
}
