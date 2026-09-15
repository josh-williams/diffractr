import { z } from "zod";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { capture } from "./capture.mjs";
import { serveSnapshot } from "./review.mjs";
import { snapshotSchema } from "../src/core/snapshot.ts";
import {
  inventory,
  inventoryText,
  parseAnalysis,
  validateAnalysis,
} from "../src/core/analysis.ts";
import { stringify } from "yaml";
import type { Snapshot } from "../src/core/review.ts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";

  if (value instanceof Object)
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );

  return JSON.stringify(value);
}

const digest = (snapshot: Snapshot) =>
  createHash("sha256")
    .update(canonical(z.json().parse(JSON.parse(JSON.stringify(snapshot)))))
    .digest("hex");

export function saveCapture(snapshot: Snapshot, directory: string) {
  snapshot = snapshotSchema.parse(snapshot);
  snapshot = { ...snapshot, inventory: inventory(snapshot) };

  if (
    ["capture.json", "diff.txt", "analysis.yaml"].some((name) =>
      existsSync(join(directory, name)),
    )
  )
    throw new Error("Capture output already exists; choose a fresh directory.");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "capture.json"),
    JSON.stringify(
      { version: 2, snapshot, digest: digest(snapshot) },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  writeFileSync(join(directory, "diff.txt"), inventoryText(snapshot), {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(
    join(directory, "analysis.yaml"),
    stringify({
      version: 1,
      snapshotId: snapshot.id,
      title: "Local changes",
      description: "",
      groups: [],
      flags: [],
    }),
    { flag: "wx", mode: 0o600 },
  );
}

export function loadCapture(directory: string): Snapshot {
  const envelope = JSON.parse(
    readFileSync(join(directory, "capture.json"), "utf8"),
  );

  if (envelope.version !== 2)
    throw new Error(
      "Unsupported capture version. Create a new capture with a saved block inventory.",
    );

  if (envelope.digest !== digest(envelope.snapshot))
    throw new Error(
      "Capture checksum does not match. Create a new capture; do not edit captured source.",
    );

  return snapshotSchema
    .extend({ inventory: snapshotSchema.shape.inventory.unwrap() })
    .parse(envelope.snapshot);
}

export function readAnalysis(snapshot: Snapshot, path: string) {
  try {
    const input = parseAnalysis(readFileSync(path, "utf8"));

    return { input, ...validateAnalysis(snapshot, input) };
  } catch (error) {
    return {
      input: undefined,
      analysis: null,
      units: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function main(args: string[]) {
  const [command, ...rest] = args;

  if (!command || command === "--help" || rest.includes("--help")) {
    console.log(
      `Usage: diffraction <command>\n\n  capture [--repo PATH] [--base REF] [--out DIRECTORY]\n  inspect DIRECTORY [--block B7]\n  validate DIRECTORY [--analysis FILE]\n  open DIRECTORY [--analysis FILE] [--port 5174]\n\nCapture writes an immutable capture.json, numbered diff.txt, and analysis.yaml template.\nEdit analysis.yaml, validate it, then open the saved review. No Git writes or agent calls.`,
    );

    return;
  }

  if (!["capture", "inspect", "validate", "open"].includes(command))
    throw new Error(`Unknown command ${command}`);

  const parsedCommand = z
    .enum(["capture", "inspect", "validate", "open"])
    .parse(command);

  const directory = command === "capture" ? undefined : rest.shift();

  if (command !== "capture" && (!directory || directory.startsWith("--")))
    throw new Error(`${command} requires a capture directory`);

  const allowed = {
    capture: ["--repo", "--base", "--out"],
    inspect: ["--block"],
    validate: ["--analysis"],
    open: ["--analysis", "--port"],
  };

  const options: Record<string, string> = {};

  for (let i = 0; i < rest.length; i += 2) {
    if (
      !allowed[parsedCommand].includes(rest[i]) ||
      !rest[i + 1] ||
      rest[i + 1].startsWith("--")
    )
      throw new Error(`Unexpected argument ${rest[i]}`);

    if (options[rest[i]]) throw new Error(`Repeated argument ${rest[i]}`);
    options[rest[i]] = rest[i + 1];
  }

  if (command === "capture") {
    const snapshot = snapshotSchema.parse(
      capture(resolve(options["--repo"] ?? process.cwd()), {
        base: options["--base"],
      }),
    );

    const out = options["--out"]
      ? resolve(options["--out"])
      : mkdtempSync(join(tmpdir(), "diffraction-"));

    saveCapture(snapshot, out);
    console.log(
      `Captured ${snapshot.files.length} files, ${inventory(snapshot).length} blocks.\n${out}\n\nRead ${join(out, "diff.txt")} and edit ${join(out, "analysis.yaml")}.`,
    );

    return;
  }

  const snapshot = loadCapture(resolve(directory!));

  if (command === "inspect") {
    const blocks = inventory(snapshot);

    if (options["--block"]) {
      const block = blocks.find((b) => b.id === options["--block"]);

      if (!block) throw new Error(`Unknown block ${options["--block"]}`);
      console.log(JSON.stringify(block, null, 2));
    } else console.log(inventoryText(snapshot));

    return;
  }

  const result = readAnalysis(
    snapshot,
    options["--analysis"]
      ? resolve(options["--analysis"])
      : join(resolve(directory!), "analysis.yaml"),
  );

  if (command === "validate") {
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    console.log(
      `Valid: ${result.analysis!.sections.length} groups, ${result.analysis!.flags.length} flags, complete change coverage.`,
    );

    return;
  }

  const port = Number(options["--port"] ?? 5174);

  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port must be between 0 and 65535");

  if (result.errors.length)
    console.error(
      `Analysis unavailable; opening the complete diff.\n${result.errors.join("\n")}`,
    );

  const { server, url } = await serveSnapshot(snapshot, {
    port,
    analysis: result.errors.length ? undefined : result.input,
    errors: result.errors,
  });

  console.log(
    `${url}\nFixed snapshot ${snapshot.id.slice(0, 12)}. Press Ctrl+C to stop.`,
  );

  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
}
