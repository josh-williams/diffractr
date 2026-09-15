import { z } from "zod";
import { parseDocument } from "yaml";
import {
  indexChanges,
  lines,
  type Snapshot,
  type ChangeUnit,
  type Analysis,
  type Anchor,
} from "./review";

export interface BlockRow {
  n: number;
  op: " " | "+" | "-";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface Block {
  id: string;
  fileId: string;
  path: string;
  kind: "text" | "metadata";
  rows: BlockRow[];
  unit?: ChangeUnit;
  notice?: string;
}

export function inventory(snapshot: Snapshot): Block[] {
  if (snapshot.inventory) return snapshot.inventory;
  const units = indexChanges(snapshot);
  const blocks: Block[] = [];

  for (const file of [...snapshot.files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    const siblings = units.filter((u) => u.fileId === file.id);

    for (const [i, u] of siblings.entries()) {
      const before = lines(file.before),
        after = lines(file.after),
        previous = siblings[i - 1],
        next = siblings[i + 1];

      const leading = Math.min(
        3,
        u.oldStart - (previous ? previous.oldStart + previous.oldCount : 0),
        u.newStart - (previous ? previous.newStart + previous.newCount : 0),
      );

      const trailing = Math.min(
        3,
        (next?.oldStart ?? before.length) - u.oldStart - u.oldCount,
        (next?.newStart ?? after.length) - u.newStart - u.newCount,
      );

      const rows: BlockRow[] = [];

      const add = (
        op: BlockRow["op"],
        text: string,
        oldLine?: number,
        newLine?: number,
      ) => rows.push({ n: rows.length + 1, op, text, oldLine, newLine });

      for (let j = leading; j > 0; j--)
        add(
          " ",
          before[u.oldStart - j],
          u.oldStart - j + 1,
          u.newStart - j + 1,
        );

      for (let j = 0; j < u.oldCount; j++)
        add("-", before[u.oldStart + j], u.oldStart + j + 1);

      for (let j = 0; j < u.newCount; j++)
        add("+", after[u.newStart + j], undefined, u.newStart + j + 1);

      for (let j = 0; j < trailing; j++)
        add(
          " ",
          after[u.newStart + u.newCount + j],
          u.oldStart + u.oldCount + j + 1,
          u.newStart + u.newCount + j + 1,
        );
      blocks.push({
        id: `B${blocks.length + 1}`,
        fileId: file.id,
        path: file.path,
        kind: "text",
        rows,
        unit: u,
      });
    }

    const modeChanged =
      file.oldMode != null &&
      file.newMode != null &&
      file.oldMode !== file.newMode;

    if (!siblings.length || modeChanged)
      blocks.push({
        id: `B${blocks.length + 1}`,
        fileId: file.id,
        path: file.path,
        kind: "metadata",
        rows: [],
        notice:
          file.notice ??
          (modeChanged
            ? `Mode ${file.oldMode} → ${file.newMode}`
            : file.before === null
              ? "Empty file added"
              : file.after === null
                ? "Empty file deleted"
                : "File metadata change"),
      });
  }

  return blocks;
}

const selectionSchema = z
  .object({ block: z.string().min(1), rows: z.string().min(1).optional() })
  .strict();

export const analysisSchema = z
  .object({
    version: z.literal(1),
    snapshotId: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    groups: z.array(
      z
        .object({
          title: z.string().min(1),
          description: z.string().min(1),
          changes: z.array(selectionSchema).min(1),
        })
        .strict(),
    ),
    flags: z
      .array(
        z.object({ text: z.string().min(1), anchor: selectionSchema }).strict(),
      )
      .default([]),
  })
  .strict();

export type AuthoredAnalysis = z.infer<typeof analysisSchema>;

export function parseAnalysis(text: string): AuthoredAnalysis {
  const doc = parseDocument(text, { uniqueKeys: true });

  if (doc.errors.length)
    throw new Error(doc.errors.map((e) => e.message).join("\n"));

  return analysisSchema.parse(doc.toJS({ maxAliasCount: 0 }));
}

export function selectRows(block: Block, selector?: string): BlockRow[] {
  if (block.kind === "metadata") {
    if (selector !== undefined)
      throw new Error(
        `${block.id} is a whole-file change and does not accept rows`,
      );

    return [];
  }

  if (selector === undefined) return block.rows.filter((r) => r.op !== " ");
  const picked = new Set<number>();

  for (const part of selector.split(",")) {
    const match = /^\s*([1-9]\d*)\s*(?:-\s*([1-9]\d*)\s*)?$/.exec(part);

    if (!match)
      throw new Error(
        `Invalid rows ${JSON.stringify(selector)}; use "5-28, 32"`,
      );

    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);

    if (!Number.isSafeInteger(end) || start > end || end > block.rows.length)
      throw new Error(
        `${block.id} rows must be within 1-${block.rows.length}, in ascending ranges`,
      );

    for (let n = start; n <= end; n++) {
      if (picked.has(n))
        throw new Error(
          `${block.id} row ${n} appears more than once in the selector`,
        );
      picked.add(n);
    }
  }

  const rows = block.rows.filter((r) => picked.has(r.n) && r.op !== " ");

  if (!rows.length)
    throw new Error(`${block.id} selection contains no changed rows`);

  return rows;
}

function runs(numbers: number[]): number[][] {
  const result: number[][] = [];

  for (const n of numbers) {
    const last = result.at(-1);

    if (last && last.at(-1) === n - 1) last.push(n);
    else result.push([n]);
  }

  return result;
}

function project(block: Block, rows: BlockRow[], group: number): ChangeUnit[] {
  if (!block.unit) return [];
  const u = block.unit;

  if (rows.length === block.rows.filter((r) => r.op !== " ").length) return [u];
  const old = runs(rows.flatMap((r) => (r.op === "-" ? [r.oldLine!] : [])));
  const next = runs(rows.flatMap((r) => (r.op === "+" ? [r.newLine!] : [])));

  return Array.from({ length: Math.max(old.length, next.length) }, (_, i) => ({
    id: `${block.id}:g${group}:${i}`,
    fileId: block.fileId,
    oldStart: old[i] ? old[i][0] - 1 : u.oldStart + u.oldCount,
    oldCount: old[i]?.length ?? 0,
    newStart: next[i] ? next[i][0] - 1 : u.newStart + u.newCount,
    newCount: next[i]?.length ?? 0,
    split: true,
  }));
}

export interface AnalysisValidation {
  analysis: Analysis | null;
  units: ChangeUnit[];
  errors: string[];
}

export function validateAnalysis(
  snapshot: Snapshot,
  input: AuthoredAnalysis,
): AnalysisValidation {
  const errors: string[] = [];
  const result = analysisSchema.safeParse(input);

  if (!result.success)
    return {
      analysis: null,
      units: [],
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  const authored = result.data;

  if (authored.snapshotId !== snapshot.id)
    errors.push(
      "Analysis belongs to a different snapshot. Copy snapshotId from this capture.",
    );

  const blocks = inventory(snapshot),
    byId = new Map(blocks.map((b) => [b.id, b]));

  const ownership = new Map<string, number>();
  const units: ChangeUnit[] = [];
  const sections: Analysis["sections"] = [];

  function resolve(selection: z.infer<typeof selectionSchema>) {
    const block = byId.get(selection.block);

    if (!block) throw new Error(`Unknown block ${selection.block}`);
    const rows = selectRows(block, selection.rows);

    return {
      block,
      rows,
      keys:
        block.kind === "metadata"
          ? [block.id]
          : rows.map((r) => `${block.id}:${r.n}`),
    };
  }

  for (const [gi, group] of authored.groups.entries()) {
    const section: Analysis["sections"][number] = {
      id: `group-${gi + 1}`,
      title: group.title,
      description: group.description,
      unitIds: [],
      fileIds: [],
      metadataFileIds: [],
    };

    const selected = new Map<string, BlockRow[]>();

    for (const [ci, selection] of group.changes.entries())
      try {
        const { block, rows, keys } = resolve(selection);

        for (const key of keys) {
          if (ownership.has(key))
            errors.push(
              `${key} assigned more than once (groups ${ownership.get(key)! + 1} and ${gi + 1})`,
            );
          else ownership.set(key, gi);
        }

        if (!section.fileIds.includes(block.fileId))
          section.fileIds.push(block.fileId);

        if (block.kind === "metadata")
          section.metadataFileIds.push(block.fileId);
        selected.set(block.id, [...(selected.get(block.id) ?? []), ...rows]);
      } catch (error) {
        errors.push(
          `groups[${gi}].changes[${ci}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

    for (const [id, rows] of selected) {
      const projected = project(
        byId.get(id)!,
        rows.sort((a, b) => a.n - b.n),
        gi,
      );

      section.unitIds.push(...projected.map((u) => u.id));
      units.push(...projected);
    }

    sections.push(section);
  }

  for (const block of blocks) {
    const missing =
      block.kind === "metadata"
        ? !ownership.has(block.id)
          ? [block.id]
          : []
        : block.rows
            .filter((r) => r.op !== " " && !ownership.has(`${block.id}:${r.n}`))
            .map((r) => r.n);

    if (missing.length)
      errors.push(
        `Unassigned ${block.id} (${block.path})${block.kind === "text" ? ` rows: ${missing.join(", ")}` : ""}`,
      );
  }

  const flags: Analysis["flags"] = [];

  for (const [fi, flag] of authored.flags.entries())
    try {
      const { block, rows, keys } = resolve(flag.anchor);
      const owners = new Set(keys.map((k) => ownership.get(k)));

      if (owners.size !== 1 || owners.has(undefined))
        throw new Error(
          "Flag must reference changed rows owned by exactly one group",
        );
      // Render once at the last selected new-side row, or old-side row for deletions.
      const sideRows = rows.filter((r) => r.op === "+");
      const chosen = sideRows.length ? sideRows : rows;
      const row = chosen.at(-1);
      const side = sideRows.length ? "additions" : "deletions";

      const line = row
        ? side === "additions"
          ? row.newLine!
          : row.oldLine!
        : 0;

      const selectedRuns = runs(
        chosen.map((r) => (side === "additions" ? r.newLine! : r.oldLine!)),
      );

      const anchor: Anchor | undefined = row
        ? {
            fileId: block.fileId,
            side,
            start: selectedRuns.at(-1)![0],
            end: line,
          }
        : undefined;

      flags.push({
        id: `flag-${fi + 1}`,
        sectionId: sections[[...owners][0]!].id,
        text: flag.text,
        fileId: block.fileId,
        anchor,
      });
    } catch (error) {
      errors.push(
        `flags[${fi}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

  return {
    analysis: errors.length
      ? null
      : {
          title: authored.title,
          summary: authored.description,
          sections,
          flags,
        },
    units: errors.length ? [] : units,
    errors,
  };
}

export function inventoryText(snapshot: Snapshot): string {
  return (
    `Snapshot: ${snapshot.id}\n${snapshot.repository}: ${snapshot.branch} ← ${snapshot.base}\nRows are block-local, inclusive; context is not owned.\n\n` +
    inventory(snapshot)
      .map((b) => {
        if (b.kind === "metadata")
          return `${b.id} ${JSON.stringify(b.path)} [whole change]\n${b.notice}\n`;

        return (
          `${b.id} ${JSON.stringify(b.path)}\n` +
          b.rows
            .map(
              (r) =>
                `${r.n} ${r.op} ${r.text.replace(/\n$/, "")}${r.text.endsWith("\n") ? "" : " [no final newline]"}`,
            )
            .join("\n") +
          "\n"
        );
      })
      .join("\n")
  );
}
