import { parseDiffFromFile, parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { z } from "zod";

export type FileRole = "production" | "tests" | "generated" | "other";
export interface SourceFile {
  id: string;
  path: string;
  before: string | null;
  after: string | null;
  role: FileRole;
  notice?: string;
  oldMode?: string | null;
  newMode?: string | null;
}
export interface Snapshot {
  id: string;
  repository: string;
  branch: string;
  base: string;
  files: SourceFile[];
  mergeBase?: string;
  head?: string;
  capturedAt?: string;
}
export interface ChangeUnit {
  id: string;
  fileId: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}
export type Side = "additions" | "deletions";
export interface Anchor {
  fileId: string;
  side: Side;
  start: number;
  end: number;
}
export interface Comment extends Anchor {
  id: string;
  snapshotId: string;
  body: string;
}
export const anchorSchema = z
  .object({
    fileId: z.string().min(1),
    side: z.enum(["additions", "deletions"]),
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((a) => a.end >= a.start, "Range ends before it starts");
const flowSchema = z.object({
  caption: z.string(),
  steps: z.array(z.string().min(1)).min(2).max(8),
});
export const analysisSchema = z.object({
  version: z.literal(1),
  snapshotId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        unitIds: z.array(z.string()).min(1),
        diagrams: z.array(flowSchema).max(2).default([]),
      }),
    )
    .min(1),
  flags: z.array(
    z.object({
      id: z.string().min(1),
      sectionId: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      anchor: anchorSchema,
    }),
  ),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Section = Analysis["sections"][number];
export type Flag = Analysis["flags"][number];
export const roles: FileRole[] = ["production", "tests", "generated", "other"];
export function fileDiff(file: SourceFile): FileDiffMetadata {
  return parseDiffFromFile(
    file.before === null ? null : { name: file.path, contents: file.before },
    file.after === null ? null : { name: file.path, contents: file.after },
    { context: 0 },
  );
}
// Units are contiguous edit blocks, independent of Git's context-based hunks.
// IDs are snapshot-local. They are never reused to infer review progress.
export function indexChanges(snapshot: Snapshot): ChangeUnit[] {
  const ids = new Set<string>();
  return snapshot.files.flatMap((file) => {
    if (ids.has(file.id)) throw new Error(`Duplicate source file: ${file.id}`);
    ids.add(file.id);
    if (file.notice || file.before === file.after) return [];
    return fileDiff(file).hunks.map((h) => ({
      id: `${file.id}:${h.deletionStart}:${h.additionStart}`,
      fileId: file.id,
      oldStart: h.deletionStart - (h.deletionCount > 0 ? 1 : 0),
      oldCount: h.deletionLines,
      newStart: h.additionStart - (h.additionCount > 0 ? 1 : 0),
      newCount: h.additionLines,
    }));
  });
}
export function containsLine(
  unit: ChangeUnit,
  side: Side,
  line: number,
): boolean {
  const start = side === "additions" ? unit.newStart : unit.oldStart;
  const count = side === "additions" ? unit.newCount : unit.oldCount;
  return line > start && line <= start + count;
}
export function validateAnalysis(
  snapshot: Snapshot,
  input: unknown,
): { analysis: Analysis | null; errors: string[] } {
  const result = analysisSchema.safeParse(input);
  if (!result.success)
    return {
      analysis: null,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  const analysis = result.data;
  const errors: string[] = [];
  if (analysis.snapshotId !== snapshot.id)
    errors.push("Analysis belongs to a different snapshot.");
  const units = indexChanges(snapshot);
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const assigned = new Set<string>();
  const sectionIds = new Set<string>();
  for (const section of analysis.sections) {
    if (sectionIds.has(section.id))
      errors.push(`Duplicate section: ${section.id}`);
    sectionIds.add(section.id);
    for (const id of section.unitIds) {
      if (!unitMap.has(id)) errors.push(`Unknown change: ${id}`);
      if (assigned.has(id))
        errors.push(`Change assigned more than once: ${id}`);
      assigned.add(id);
    }
  }
  for (const unit of units)
    if (!assigned.has(unit.id)) errors.push(`Unassigned change: ${unit.id}`);
  const flagIds = new Set<string>();
  for (const flag of analysis.flags) {
    if (flagIds.has(flag.id)) errors.push(`Duplicate flag: ${flag.id}`);
    flagIds.add(flag.id);
    const section = analysis.sections.find((s) => s.id === flag.sectionId);
    const owned =
      section?.unitIds
        .map((id) => unitMap.get(id))
        .filter((u): u is ChangeUnit => !!u) ?? [];
    const a = flag.anchor;
    const file = snapshot.files.find((f) => f.id === a.fileId);
    const count = file
      ? lines(a.side === "additions" ? file.after : file.before).length
      : 0;
    if (
      !section ||
      a.end > count ||
      !Array.from(
        { length: Math.min(a.end - a.start + 1, count + 1) },
        (_, i) => a.start + i,
      ).every((line) =>
        owned.some(
          (u) => u.fileId === a.fileId && containsLine(u, a.side, line),
        ),
      )
    ) {
      errors.push(`Flag is outside its section's changed lines: ${flag.id}`);
    }
  }
  return { analysis: errors.length ? null : analysis, errors };
}
export function lines(content: string | null): string[] {
  if (!content) return [];
  const result = content.match(/[^\n]*\n|[^\n]+$/g);
  return result ?? [];
}
// Render a real patch with original coordinates. Context stops at other changes,
// so expanding context cannot accidentally reveal another section's edits.
export function unitDiff(
  file: SourceFile,
  unit: ChangeUnit,
  allUnits: ChangeUnit[],
  context: number | { before: number; after: number } = 3,
): FileDiffMetadata {
  const before = lines(file.before),
    after = lines(file.after);
  const siblings = allUnits.filter((u) => u.fileId === file.id);
  const previous = siblings
    .filter(
      (u) =>
        u.oldStart + u.oldCount <= unit.oldStart &&
        u.newStart + u.newCount <= unit.newStart &&
        u.id !== unit.id,
    )
    .at(-1);
  const next = siblings.find(
    (u) =>
      u.oldStart >= unit.oldStart + unit.oldCount &&
      u.newStart >= unit.newStart + unit.newCount &&
      u.id !== unit.id,
  );
  const leading = Math.max(
    0,
    Math.min(
      typeof context === "number" ? context : context.before,
      unit.oldStart - (previous ? previous.oldStart + previous.oldCount : 0),
      unit.newStart - (previous ? previous.newStart + previous.newCount : 0),
    ),
  );
  const trailing = Math.max(
    0,
    Math.min(
      typeof context === "number" ? context : context.after,
      (next?.oldStart ?? before.length) - unit.oldStart - unit.oldCount,
      (next?.newStart ?? after.length) - unit.newStart - unit.newCount,
    ),
  );
  const oldCount = unit.oldCount + leading + trailing,
    newCount = unit.newCount + leading + trailing;
  const oldStart = unit.oldStart - leading,
    newStart = unit.newStart - leading;
  const patchLine = (prefix: string, line: string) =>
    prefix +
    line +
    (line.endsWith("\n") ? "" : "\n\\ No newline at end of file\n");
  const patch =
    `--- a/file\n+++ b/file\n@@ -${oldCount ? oldStart + 1 : oldStart},${oldCount} +${newCount ? newStart + 1 : newStart},${newCount} @@\n` +
    before
      .slice(oldStart, unit.oldStart)
      .map((l) => patchLine(" ", l))
      .join("") +
    before
      .slice(unit.oldStart, unit.oldStart + unit.oldCount)
      .map((l) => patchLine("-", l))
      .join("") +
    after
      .slice(unit.newStart, unit.newStart + unit.newCount)
      .map((l) => patchLine("+", l))
      .join("") +
    after
      .slice(
        unit.newStart + unit.newCount,
        unit.newStart + unit.newCount + trailing,
      )
      .map((l) => patchLine(" ", l))
      .join("");
  const parsed = parsePatchFiles(patch, undefined, true)[0]?.files[0];
  if (!parsed) throw new Error(`Unable to render ${unit.id}`);
  parsed.name = file.path;
  return parsed;
}
export function statistics(snapshot: Snapshot, units = indexChanges(snapshot)) {
  return roles.map((role) => {
    const fileIds = new Set(
      snapshot.files.filter((f) => f.role === role).map((f) => f.id),
    );
    const matching = units.filter((u) => fileIds.has(u.fileId));
    return {
      role,
      additions: matching.reduce((n, u) => n + u.newCount, 0),
      deletions: matching.reduce((n, u) => n + u.oldCount, 0),
    };
  });
}
export function exportFeedback(
  snapshot: Snapshot,
  comments: Comment[],
): string {
  const header = `# Diffraction review feedback\n\nRepository: ${snapshot.repository}\nBranch: ${snapshot.branch}\nBase: ${snapshot.base}\n${snapshot.mergeBase ? `Merge base: ${snapshot.mergeBase}\n` : ""}Snapshot: ${snapshot.id}\n\nCheck the current code against this snapshot before applying feedback.\n`;
  return (
    header +
    comments
      .map((c, i) => {
        if (c.snapshotId !== snapshot.id)
          throw new Error("Cannot export feedback from another snapshot.");
        const file = snapshot.files.find((f) => f.id === c.fileId);
        const content = lines(
          c.side === "additions"
            ? (file?.after ?? null)
            : (file?.before ?? null),
        );
        if (!file || c.start < 1 || c.end < c.start || c.end > content.length)
          throw new Error("Invalid comment anchor.");
        const quote = content
          .slice(c.start - 1, c.end)
          .join("")
          .trimEnd()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
        return `\n## ${i + 1}. ${file.path} (${c.side === "additions" ? "new" : "old"} lines ${c.start}–${c.end})\n\n${c.body}\n\n${quote}\n`;
      })
      .join("")
  );
}
