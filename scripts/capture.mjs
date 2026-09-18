import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const decode = (bytes) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

const hash = (value) => createHash("sha256").update(value).digest("hex");

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function optional(root, args) {
  try {
    return git(root, args).toString().trim();
  } catch {
    return null;
  }
}

function commit(root, ref) {
  return optional(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
}

export function resolveBase(root, explicit) {
  if (explicit) {
    const oid = commit(root, explicit);

    if (!oid) throw new Error(`Base ${explicit} does not resolve to a commit.`);

    return { ref: explicit, oid };
  }

  const remoteDefaults = git(root, [
    "for-each-ref",
    "--format=%(symref)",
    "refs/remotes",
  ])
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);

  const origin = remoteDefaults.find((ref) =>
    ref.startsWith("refs/remotes/origin/"),
  );

  const defaults = origin ? [origin] : [...new Set(remoteDefaults)];

  if (defaults.length === 1) {
    const oid = commit(root, defaults[0]);

    if (oid) return { ref: defaults[0].replace("refs/remotes/", ""), oid };
  }

  if (defaults.length > 1)
    throw new Error("Multiple remote default branches. Specify --base <ref>.");

  const candidates = ["main", "master"].flatMap((name) => {
    const remote = `origin/${name}`;

    if (commit(root, remote))
      return [{ ref: remote, oid: commit(root, remote) }];
    const oid = commit(root, `refs/heads/${name}`);

    return oid ? [{ ref: name, oid }] : [];
  });

  if (candidates.length !== 1)
    throw new Error(
      "Cannot determine the comparison branch. Specify --base <ref>.",
    );

  return candidates[0];
}

export function classify(path, text = "") {
  if (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$/.test(
      path,
    ) ||
    /(^|\/)(__generated__|generated)(\/|$)|\.generated\./i.test(path) ||
    /@generated|auto[- ]generated|do not edit/i.test(text.slice(0, 1000))
  )
    return "generated";

  if (
    /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\.|(^|\/)test_|_test\./i.test(
      path,
    )
  )
    return "tests";

  if (
    /\.(tsx?|jsx?|mjs|cjs|py|rs|go|java|kt|swift|c|h|cpp|cs|rb|php|vue|svelte|css|scss|sql|sh)$/.test(
      path,
    )
  )
    return "production";

  return "other";
}

function textContent(bytes) {
  if (bytes.length > MAX_FILE_BYTES)
    return { reason: "File exceeds the 2 MiB text limit" };

  if (bytes.includes(0)) return { reason: "Binary content" };

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { reason: "Non-UTF-8 content" };
  }
}

function workingFile(root, path) {
  // Check each path component; link targets are outside the captured scope.
  const parts = path.split("/");
  let full = root;

  for (let i = 0; i < parts.length; i++) {
    full = join(full, parts[i]);
    let stat;

    try {
      stat = lstatSync(full);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    }

    if (stat.isSymbolicLink())
      return {
        mode: "120000",
        digest: hash(readlinkSync(full)),
        reason: "Symbolic link; target is not read",
      };

    if (i < parts.length - 1 && !stat.isDirectory()) return null;

    if (i === parts.length - 1) {
      if (!stat.isFile())
        return {
          mode: "040000",
          reason: "Directory or special file; content is not read",
        };
      const resolved = realpathSync(full);
      const rel = relative(root, resolved);

      if (rel === ".." || rel.startsWith(`..${sep}`))
        throw new Error(`Path escaped repository: ${path}`);
      const mode = stat.mode & 0o111 ? "100755" : "100644";

      if (stat.size > MAX_FILE_BYTES)
        return {
          mode,
          reason: "File exceeds the 2 MiB text limit",
          digest: `${stat.size}:${stat.mtimeNs ?? stat.mtimeMs}:${stat.ctimeMs}`,
        };
      const bytes = readFileSync(full);

      const blob = Buffer.concat([
        Buffer.from(`blob ${bytes.length}\0`),
        bytes,
      ]);

      const objectId = Object.fromEntries(
        ["sha1", "sha256"].map((algorithm) => [
          algorithm,
          createHash(algorithm).update(blob).digest("hex"),
        ]),
      );

      return { mode, digest: hash(bytes), objectId, ...textContent(bytes) };
    }
  }
}

function readPass(root, baseRef) {
  const head = commit(root, "HEAD");

  if (!head)
    throw new Error(
      "Repository needs an initial commit before it can be reviewed.",
    );

  if (git(root, ["ls-files", "--unmerged", "-z"]).length)
    throw new Error("Resolve merge conflicts before capturing a review.");
  const base = resolveBase(root, baseRef);

  const mergeBases = git(root, ["merge-base", "--all", head, base.oid])
    .toString()
    .trim()
    .split("\n");

  if (mergeBases.length !== 1 || !mergeBases[0])
    throw new Error(
      "Comparison needs a single merge base. Specify --base <ref>.",
    );
  const mergeBase = mergeBases[0];

  const branch =
    optional(root, ["symbolic-ref", "--short", "-q", "HEAD"]) ??
    `detached ${head.slice(0, 12)}`;

  const tree = new Map(
    decode(git(root, ["ls-tree", "-rz", "--full-tree", mergeBase]))
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf("\t");
        const [mode, type, oid] = entry.slice(0, tab).split(" ");

        return [entry.slice(tab + 1), { mode, type, oid }];
      }),
  );

  const listed = decode(
    git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]),
  )
    .split("\0")
    .filter(Boolean);

  const changedPaths = new Set(
    git(root, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--name-only",
      "--no-renames",
      "--ignore-submodules=none",
      "-z",
      mergeBase,
      "--",
    ])
      .toString()
      .split("\0"),
  );

  const files = [];

  const objectFormat = git(root, ["rev-parse", "--show-object-format"])
    .toString()
    .trim();

  for (const path of [...new Set([...tree.keys(), ...listed])].sort()) {
    const after = workingFile(root, path);
    const entry = tree.get(path);

    if (
      entry &&
      after?.objectId?.[objectFormat] === entry.oid &&
      after.mode === entry.mode
    )
      continue;

    if (
      entry &&
      after?.reason === "File exceeds the 2 MiB text limit" &&
      after.mode === entry.mode &&
      !changedPaths.has(path)
    )
      continue;
    let before = null;

    if (entry) {
      if (entry.mode === "160000") {
        if (changedPaths.has(path))
          files.push({
            id: hash(path).slice(0, 24),
            path,
            before: null,
            after: null,
            role: "other",
            notice: "Submodule change; nested repository is not captured",
            oldMode: entry.mode,
            newMode: entry.mode,
          });
        continue;
      }

      const size = Number(git(root, ["cat-file", "-s", entry.oid]).toString());

      const bytes =
        size > MAX_FILE_BYTES
          ? null
          : git(root, ["cat-file", "blob", entry.oid]);

      before =
        bytes === null
          ? {
              mode: entry.mode,
              digest: entry.oid,
              reason: "File exceeds the 2 MiB text limit",
            }
          : {
              mode: entry.mode,
              digest: hash(bytes),
              ...(entry.mode === "120000"
                ? { reason: "Symbolic link; target is not read" }
                : textContent(bytes)),
            };
    }

    if (!before && !after) continue;

    if (
      before &&
      after &&
      before.digest &&
      before.digest === after.digest &&
      before.mode === after.mode
    )
      continue;

    // Unchanged links remain outside the review without following their target.
    if (
      entry?.mode === "120000" &&
      after?.mode === "120000" &&
      !changedPaths.has(path)
    )
      continue;
    const notice = before?.reason || after?.reason;

    const file = {
      id: hash(path).slice(0, 24),
      path,
      before: notice ? null : (before?.text ?? null),
      after: notice ? null : (after?.text ?? null),
      role: classify(path, after?.text ?? before?.text),
      oldMode: before?.mode ?? null,
      newMode: after?.mode ?? null,
      fingerprint: [before?.digest, after?.digest],
    };

    if (notice) file.notice = notice;
    files.push(file);
  }

  return {
    repository: basename(root),
    branch,
    base: base.ref,
    mergeBase,
    baseCommit: base.oid,
    head,
    files,
  };
}

export function capture(repository, { base, afterRead } = {}) {
  let root;

  try {
    root = realpathSync(
      git(repository, ["rev-parse", "--show-toplevel"]).toString().trim(),
    );
  } catch {
    throw new Error("Run inside a Git working tree or pass --repo <path>.");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const first = readPass(root, base);
    afterRead?.(attempt);
    const second = readPass(root, base);

    if (JSON.stringify(first) !== JSON.stringify(second)) continue;
    const id = hash(root + "\0" + JSON.stringify(second));

    return {
      ...second,
      id,
      capturedAt: new Date().toISOString(),
      files: second.files.map(({ fingerprint: _fingerprint, ...file }) => file),
    };
  }

  throw new Error(
    "Repository changed during capture. Stop edits briefly and run the command again.",
  );
}

// PR snapshots read Git objects, independent of checkout filters or later edits.
export function captureCommits(root, base, head) {
  const mergeBases = git(root, ["merge-base", "--all", base, head])
    .toString()
    .trim()
    .split("\n");

  if (mergeBases.length !== 1 || !mergeBases[0])
    throw new Error("PR comparison requires a single merge base.");
  const mergeBase = mergeBases[0];

  function tree(ref) {
    return new Map(
      decode(git(root, ["ls-tree", "-rz", "--full-tree", ref]))
        .split("\0")
        .filter(Boolean)
        .map((entry) => {
          const tab = entry.indexOf("\t");
          const [mode, , oid] = entry.slice(0, tab).split(" ");

          return [entry.slice(tab + 1), { mode, oid }];
        }),
    );
  }

  function content(entry) {
    if (!entry) return {};

    if (entry.mode === "160000")
      return { reason: "Submodule change; nested repository is not captured" };

    if (entry.mode === "120000")
      return { reason: "Symbolic link; target is not read" };

    if (
      Number(git(root, ["cat-file", "-s", entry.oid]).toString()) >
      MAX_FILE_BYTES
    )
      return { reason: "File exceeds the 2 MiB text limit" };

    return textContent(git(root, ["cat-file", "blob", entry.oid]));
  }

  const beforeTree = tree(mergeBase);
  const afterTree = tree(head);
  const files = [];

  for (const path of [
    ...new Set([...beforeTree.keys(), ...afterTree.keys()]),
  ].sort()) {
    const old = beforeTree.get(path);
    const next = afterTree.get(path);

    if (old?.oid === next?.oid && old?.mode === next?.mode) continue;
    const before = content(old);
    const after = content(next);
    const notice = before.reason || after.reason;

    const file = {
      id: hash(path).slice(0, 24),
      path,
      before: notice ? null : (before.text ?? null),
      after: notice ? null : (after.text ?? null),
      role: classify(path, after.text ?? before.text),
      oldMode: old?.mode ?? null,
      newMode: next?.mode ?? null,
    };

    if (notice) file.notice = notice;
    files.push(file);
  }

  return { mergeBase, baseCommit: base, head, files };
}
