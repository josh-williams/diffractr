#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));

const installed = resolve(here, "../runtime/dist/cli.mjs");

const cli = existsSync(installed)
  ? installed
  : resolve(here, "../../../dist/cli.mjs");

if (!existsSync(cli))
  throw new Error(
    "diffractr runtime is missing. Install the skill using the CLI's install-skill command, or run npm run build in the source checkout.",
  );

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
