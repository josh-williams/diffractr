import { lines, type ChangeUnit, type SourceFile } from "./review";

interface Gap {
  key: string;
  hidden: number;
  direction: "before" | "after" | "both";
}

interface UnitContext {
  before: number;
  after: number;
  beforeGap: Gap;
  afterGap: Gap;
}

// Allocate each shared context line to just one of its neighboring changes.
export function contextLayout(
  file: SourceFile,
  units: ChangeUnit[],
  allUnits: ChangeUnit[],
  expanded: Record<string, boolean>,
) {
  const siblings = allUnits.filter((unit) => unit.fileId === file.id);

  const layout = units.map((unit): UnitContext => {
    const position = siblings.findIndex((sibling) => sibling.id === unit.id);
    const previous = siblings[position - 1];
    const next = siblings[position + 1];

    const before = unit.split
      ? 0
      : Math.max(
          0,
          Math.min(
            unit.oldStart -
              (previous ? previous.oldStart + previous.oldCount : 0),
            unit.newStart -
              (previous ? previous.newStart + previous.newCount : 0),
          ),
        );

    const after = unit.split
      ? 0
      : Math.max(
          0,
          Math.min(
            (next?.oldStart ?? lines(file.before).length) -
              unit.oldStart -
              unit.oldCount,
            (next?.newStart ?? lines(file.after).length) -
              unit.newStart -
              unit.newCount,
          ),
        );

    const beforeKey = `${unit.id}:before`;
    const afterKey = `${unit.id}:after`;

    return {
      before: expanded[beforeKey] ? before : Math.min(3, before),
      after: expanded[afterKey] ? after : Math.min(3, after),
      beforeGap: {
        key: beforeKey,
        hidden: expanded[beforeKey] ? 0 : Math.max(0, before - 3),
        direction: "before",
      },
      afterGap: {
        key: afterKey,
        hidden: expanded[afterKey] ? 0 : Math.max(0, after - 3),
        direction: "after",
      },
    };
  });

  for (let index = 1; index < units.length; index++) {
    const previous = units[index - 1];
    const unit = units[index];

    if (previous.split || unit.split) continue;

    const position = siblings.findIndex(
      (sibling) => sibling.id === previous.id,
    );

    if (siblings[position + 1]?.id !== unit.id) continue;

    const available = Math.max(
      0,
      Math.min(
        unit.oldStart - previous.oldStart - previous.oldCount,
        unit.newStart - previous.newStart - previous.newCount,
      ),
    );

    const left = layout[index - 1];
    const right = layout[index];
    right.before = Math.min(3, Math.max(0, available - 3));
    left.after = expanded[left.afterGap.key]
      ? available - right.before
      : Math.min(3, available);
    left.afterGap.hidden = available - left.after - right.before;
    left.afterGap.direction = "both";
    right.beforeGap.hidden = 0;
  }

  return layout;
}
