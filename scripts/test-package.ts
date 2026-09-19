import { z } from "zod";
import type { ChildProcess } from "node:child_process";
import { snapshotSchema } from "../src/core/snapshot.ts";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

const temp = mkdtempSync(join(tmpdir(), "diffractr-package-"));

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const run = (command: string, args: string[], cwd = temp): string =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

let server: ChildProcess | undefined;

try {
  const suppliedTarball = process.argv[2];

  const [packed] = suppliedTarball
    ? [
        {
          filename: basename(suppliedTarball),
          size: statSync(resolve(suppliedTarball)).size,
          files: run("tar", ["-tzf", resolve(suppliedTarball)])
            .trim()
            .split("\n")
            .map((path) => ({ path: path.replace(/^package\//, "") })),
        },
      ]
    : z
        .array(
          z.object({
            filename: z.string(),
            size: z.number(),
            files: z.array(z.object({ path: z.string() })),
          }),
        )
        .parse(
          JSON.parse(
            run(
              npm,
              [
                "pack",
                "--ignore-scripts",
                "--json",
                "--pack-destination",
                temp,
              ],
              root,
            ),
          ),
        );

  const tarball = suppliedTarball
    ? resolve(suppliedTarball)
    : resolve(temp, packed.filename);

  assert(packed.files.some((file) => file.path === "dist/viewer/index.html"));
  assert(
    !packed.files.some(
      (file) =>
        file.path.startsWith("src/") || file.path.startsWith("node_modules/"),
    ),
  );
  writeFileSync(join(temp, "package.json"), '{"private":true}');
  run(npm, ["install", "--offline", "--ignore-scripts", "--omit=dev", tarball]);

  const manifest = z
    .object({ name: z.string(), version: z.string() })
    .parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));

  const installed = join(temp, "node_modules", manifest.name);

  const packagedManifest = z
    .object({ name: z.string(), version: z.string() })
    .parse(JSON.parse(readFileSync(join(installed, "package.json"), "utf8")));

  assert.equal(packagedManifest.name, manifest.name);
  assert.equal(packagedManifest.version, manifest.version);
  const cli = join(installed, "dist/cli.mjs");
  assert.match(
    run(npm, ["exec", "--offline", "--", "diffractr", "--help"]),
    /install-skill/,
  );
  const skill = join(temp, "skill");
  run(process.execPath, [cli, "install-skill", "--dest", skill]);
  assert.throws(() =>
    run(process.execPath, [cli, "install-skill", "--dest", skill]),
  );
  // Remove the package: the installed skill must own a complete runtime.
  rmSync(installed, { recursive: true });
  const helper = join(skill, "scripts/run.mjs");
  run("git", ["init", "-q"]);
  writeFileSync(
    join(temp, ".gitignore"),
    "node_modules/\nskill/\nreview/\n*.tgz\npackage*.json\n",
  );
  writeFileSync(join(temp, "example.txt"), "before\n");
  run("git", ["add", ".gitignore", "example.txt"]);
  run("git", [
    "-c",
    "user.name=Package test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-qm",
    "fixture",
  ]);
  writeFileSync(join(temp, "example.txt"), "after\n");
  const capture = join(temp, "review");
  run(process.execPath, [
    helper,
    "capture",
    "--repo",
    temp,
    "--base",
    "HEAD",
    "--out",
    capture,
  ]);

  const { snapshot } = z
    .object({
      snapshot: snapshotSchema.extend({
        inventory: snapshotSchema.shape.inventory.unwrap(),
      }),
    })
    .parse(JSON.parse(readFileSync(join(capture, "capture.json"), "utf8")));

  assert.equal(snapshot.files.length, 1);
  writeFileSync(
    join(capture, "analysis.yaml"),
    JSON.stringify({
      version: 1,
      snapshotId: snapshot.id,
      title: "Update example",
      description: "A packaged review.",
      groups: [
        {
          title: "Update content",
          description: "Replace the original line.",
          changes: snapshot.inventory.map((block) => ({ block: block.id })),
        },
      ],
      flags: [],
    }),
  );
  assert.match(
    run(process.execPath, [helper, "validate", capture]),
    /Valid: 1 groups/,
  );
  assert.match(
    run(process.execPath, [helper, "inspect", capture, "--block", "B1"]),
    /example.txt/,
  );

  const runningServer = spawn(
    process.execPath,
    [join(skill, "runtime/dist/cli.mjs"), "open", capture, "--port", "0"],
    { cwd: temp, stdio: ["ignore", "pipe", "pipe"] },
  );

  server = runningServer;

  const address = await new Promise<string>((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Server startup timed out"));
    }, 10000);

    let output = "";
    runningServer.stdout.on("data", (chunk) => {
      output += chunk;

      const match = output.match(
        /http:\/\/127\.0\.0\.1:\d+\/#snapshot=[a-f0-9]+/,
      );

      if (match) {
        clearTimeout(timeout);
        resolveUrl(match[0]);
      }
    });
    runningServer.once("error", reject);
    runningServer.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited: ${code}`));
    });
  });

  const url = new URL(address);
  const html = await (await fetch(url.origin)).text();
  assert.match(html, /diffractr-local-review/);
  const assetMatch = html.match(/src="([^"]+\.js)"/);
  assert(assetMatch, "Viewer HTML must include a JavaScript asset");
  const asset = assetMatch[1];
  assert.equal((await fetch(new URL(asset, url.origin))).status, 200);
  assert.equal((await fetch(`${url.origin}/api/review`)).status, 403);

  const response = await fetch(`${url.origin}/api/review`, {
    headers: { Authorization: `Bearer ${url.hash.slice("#snapshot=".length)}` },
  });

  const review = z
    .object({ analysis: z.object({ title: z.string() }) })
    .parse(await response.json());

  assert.equal(review.analysis.title, "Update example");
  console.log(
    `Package smoke test passed: ${packed.filename}, ${packed.size} bytes packed. Offline install, skill runtime, capture, inspect, validate, authenticated review and viewer assets verified.`,
  );
} finally {
  if (server && server.exitCode === null) {
    const closingServer = server;
    closingServer.kill();
    await new Promise<void>((resolveExit) =>
      closingServer.once("exit", () => resolveExit()),
    );
  }

  rmSync(temp, { recursive: true, force: true });
}
