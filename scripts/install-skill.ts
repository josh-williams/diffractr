import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export function installSkill(
  destination = join(homedir(), ".agents/skills/diffractr"),
): string {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = resolve(destination);

  if (existsSync(target))
    throw new Error(
      `Skill destination already exists: ${target}. Choose a new --dest or remove the old installation first.`,
    );

  if (
    !existsSync(join(root, "dist/cli.mjs")) ||
    !existsSync(join(root, "dist/viewer/index.html"))
  )
    throw new Error(
      "Missing packaged runtime. Build the checkout or reinstall the CLI package.",
    );
  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), ".diffractr-install-"));

  try {
    cpSync(join(root, "skills/diffractr"), staging, { recursive: true });
    cpSync(join(root, "LICENSE"), join(staging, "runtime-LICENSE"));
    cpSync(join(root, "dist"), join(staging, "runtime/dist"), {
      recursive: true,
    });
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  return target;
}
