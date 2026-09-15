import { build } from "esbuild";
import { chmodSync } from "node:fs";

await build({
  entryPoints: ["scripts/standalone.ts"],
  outfile: "dist/cli.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  legalComments: "linked",
});

chmodSync("dist/cli.mjs", 0o755);
