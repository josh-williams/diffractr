#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = resolve(
  dirname(realpathSync(fileURLToPath(import.meta.url))),
  "../../..",
);
const child = spawn(
  process.execPath,
  [resolve(root, "scripts/cli.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
