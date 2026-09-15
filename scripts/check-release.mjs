import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const tag = process.argv[2] ?? process.env.RELEASE_TAG;

assert(tag, "Pass the release tag, e.g. npm run release:check -- v0.1.0");

assert.match(
  manifest.version,
  /^\d+\.\d+\.\d+$/,
  "Only stable releases are supported",
);

assert.equal(
  tag,
  `v${manifest.version}`,
  "Release tag must match package.json",
);

assert.equal(lock.version, manifest.version, "Lockfile version must match");

assert.equal(
  lock.packages[""].version,
  manifest.version,
  "Lockfile root version must match",
);

assert.equal(manifest.name, "diffractr");

assert(!manifest.private, "Package must be publishable");

console.log(`Release metadata verified: ${tag}`);
