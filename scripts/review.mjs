#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capture } from "./capture.mjs";
import { serveSnapshot } from "./server.mjs";

export { serveSnapshot } from "./server.mjs";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log(
      "Usage: npm run review -- [--repo <path>] [--base <ref>] [--port <port>]\n\nCaptures all net local changes since the merge base. Does not fetch or modify Git.",
    );

    return;
  }

  let repository = process.cwd(),
    base,
    port = 5174;

  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = args.slice(i, i + 2);

    if (
      !["--repo", "--base", "--port"].includes(key) ||
      !value ||
      value.startsWith("--")
    )
      throw new Error(
        "Expected --repo <path>, --base <ref>, or --port <port>.",
      );

    if (key === "--repo") repository = resolve(value);

    if (key === "--base") base = value;

    if (key === "--port") {
      port = Number(value);

      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error("Port must be between 0 and 65535.");
    }
  }

  console.log("Capturing local changes…");
  const snapshot = capture(repository, { base });
  const { server, url } = await serveSnapshot(snapshot, { port });
  console.log(
    `${snapshot.repository} · ${snapshot.branch} ← ${snapshot.base}\n${snapshot.files.length} changed files · snapshot ${snapshot.id.slice(0, 12)}\n\n${url}\n\nThis snapshot is fixed. Run again to capture subsequent edits. Press Ctrl+C to stop.`,
  );

  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`diffractr: ${error.message}`);
    process.exitCode = 1;
  });
}
