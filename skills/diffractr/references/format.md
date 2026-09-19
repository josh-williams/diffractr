# Authored review format, version 1

The capture command writes a template with the correct `snapshotId`. Edit `analysis.yaml`; never edit `capture.json`. JSON is also accepted, since it is valid YAML. Unknown fields are errors.

````yaml
version: 1
snapshotId: copy-the-value-from-the-template
title: Give invitations a seven-day lifetime
description: |
  Invitations now expire. Resending renews their validity.
groups:
  - title: Reject expired invitations
    description: |
      Acceptance checks expiry before creating a membership.

      ```mermaid
      flowchart LR
        Find --> CheckExpiry
        CheckExpiry --> Reject
        CheckExpiry --> CreateMembership
      ```
    changes:
      - block: B1
      - block: B3
        rows: "2-8, 14-22"
flags:
  - text: |
      Renewal keeps the same identifier, so a previously shared link
      becomes usable during the renewed window.
    anchor:
      block: B3
      rows: "14-22"
````

This is a shape example; its block references and row numbers are not usable against an arbitrary capture.

## Fields

- `version`: `1`.
- `snapshotId`: copy from the capture template. This binds the analysis to that capture.
- `title`: nonempty review title.
- `description`: overview Markdown; may be empty.
- `groups`: ordered array of groups. Every group has a nonempty `title`, nonempty Markdown `description`, and nonempty `changes` array. A clean capture has an empty groups array.
- `flags`: array of `{text, anchor}`. Omission defaults to no flags. `text` is nonempty Markdown. Anchors use the same block and row selection syntax as group changes.

The tool supplies block references. Do not author group IDs, flag IDs, section references, flag titles, separate diagram arrays, or source text. Navigation identifiers and flag ownership are derived automatically.

## Selecting changes

`{block: B7}` means all changes in B7. `rows` is an optional **quoted string** containing comma-separated positive row numbers or inclusive ranges:

- `"5-28"`: one continuous range.
- `"2-8, 14-22"`: two ranges.
- `"1, 3"`: individual rows.

Rows are the labels printed within each block, not source-file line numbers. A row represents one full line on the old side (`-`), new side (`+`), or unchanged context (` `). Newline annotations do not consume a row number. Range endpoints must be in bounds and increasing. Repeated or overlapping selections of changed rows are errors. Context may fall within a range but does not acquire ownership. Selecting only context is an error.

Every changed row must belong to exactly one group. Multiple selectors for the same block in one group are combined before rendering. For adjacent replacements, select the relevant deleted AND added rows; they may be nonadjacent in the block. For example, with two deletions followed by two additions, the first behavior might own `"1, 3"` and the second `"2, 4"`.

Non-text, mode-only, and empty-file changes have whole-change blocks with no rows. Assign the block without `rows`. When a file has both text edits and a mode change, the mode change has its own block. Renames have a whole-change metadata block showing the original and destination paths and Git similarity. Assign it without `rows`; any text edits have separate blocks and may belong to a different group. Mode changes and non-text notices share the rename metadata block when present. A pure rename contributes no changed text lines. Do not invent rename pairings or edit saved captures; the capture supplies them.

A flag's selected changed rows must all belong to one group. Whole-change flags are allowed. Context-only or cross-group flags are invalid. The viewer places a text flag at the end of its last selected new-side run, or old-side run for a deletion; a whole-change flag appears in the file card.

## Rendering and validation

Descriptions and flag text support Markdown with fenced `mermaid` diagrams. Raw HTML is ignored. A malformed diagram displays an error and its source without invalidating the review. External image embedding is not supported.

Split text blocks preserve source coordinates and display only assigned changes. Split fragments currently have no inline surrounding context; the complete file diff remains available. Whole blocks retain expandable context.

`validate` returns a nonzero status and specific errors until coverage and anchors are valid. `open` validates again. With absent, malformed, or invalid analysis, it displays the complete diff plus validation errors. A corrupted capture itself is rejected rather than rendered.
