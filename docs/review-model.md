# Review model

Source facts and authored analysis are separate. Source types and diff projection live in `src/core/review.ts`; block inventory, row selection, and analysis validation live in `src/core/analysis.ts`. The [authoring reference](../skills/diffractr/references/format.md) defines the YAML contract. The invitations example uses that same contract.

## Artifact boundaries

- **Capture:** immutable before/after file contents, modes, repository/comparison metadata, snapshot identity, and a checksum in `capture.json`. A null side means addition or deletion. Roles are independent of group ownership.
- **Block inventory:** deterministic snapshot-local references `B1`, `B2`, etc. Text blocks originate from contiguous edit regions with up to three context lines bounded by neighboring changes. Rows have explicit numbers, operations, content, and original coordinates. Non-text, mode-only, and empty-file changes have whole-change blocks without rows.
- **Authored analysis:** snapshot reference, overview, ordered groups with Markdown descriptions and selections, and text flags with selections. It never supplies source text or invents group/flag IDs.
- **Resolved review:** generated navigation IDs, group ownership, source-coordinate projections, file membership, and flag placement, derived from validated analysis.
- **Feedback:** snapshot identity, file, side, inclusive source range, and reviewer text, persisted in browser storage and exported as Markdown.

The Codex skill runs within the user's existing agent session. The agent can inspect any relevant context using its normal tools; selections always refer to the saved capture.

## Coordinates and coverage

`rows: "5-28, 32"` refers to displayed block rows, not source lines. Omitting it selects the whole block. Context may occur inside a selected range but does not count toward ownership. Each changed row and each whole-change block must belong to exactly one group. Invalid syntax, unknown references, out-of-bounds ranges, duplicate ownership, missing coverage, context-only selections, and stale snapshot references reject analysis.

Deleted and added rows may be selected together even when nonadjacent in the displayed block. Selections within each group are combined, then converted to contiguous old/new runs for diff rendering. Full blocks preserve expandable context bounded by the original source blocks. Split fragments currently render with zero context so another group's edits cannot leak into the projection; complete-file view remains available. Groups describe changes, not independently applicable commits.

Flags use the same selectors. All selected changed rows must have one owner, which determines the flag's group. Text flags render at the end of the last selected new-side run, or old-side run for deletions. Whole-change flags render in the file card. Reviewer comments can target unchanged context too. Adjacent full blocks in a file card share one collapsed-context separator; its count excludes context already visible on either side, and expansion displays each unchanged line once.

Global counts derive from source changes, not repeated file appearances or displayed context. Group file counts include metadata-only files. Metadata changes have no text-line count.

## Local transport and integrity

`scripts/capture.ts` captures the merge-base-to-working-tree state. Two matching consecutive reads are required, with up to three attempts. This detects observed concurrent edits; it is not a filesystem-atomic snapshot. Source identity incorporates repository location, fingerprints, modes, and comparison metadata.

`scripts/workflow.ts` saves and reloads capture artifacts. The version-2 capture envelope includes a SHA-256 checksum over canonical snapshot JSON, including its authoritative block inventory. Saved block IDs, numbered rows, source mappings, and change units drive inspection, validation, and browser projections without rerunning block generation. Version-1 captures must be recaptured; the authored analysis format remains version 1. Reopening verifies the checksum before interpreting block references. It detects accidental modification, not authenticity against an adversary who can replace the source and checksum together. Captured artifacts remain tied to their original snapshot when live files change.

The server holds one review in memory, serves only built UI assets, and requires a session token and same-origin host for source/analysis endpoints. No repository filesystem paths are exposed as HTTP routes. Invalid analysis opens the full diff with errors. Invalid captures are rejected. The browser validates analysis again and regenerates projections.

Markdown is rendered without raw HTML. Mermaid is lazy-loaded with strict security settings. Diagram errors remain local to the diagram and expose its source for diagnosis. No live agent execution occurs in the viewer.

## Remaining limitations

- Regular UTF-8 files are compared as raw content without Git content filters. Checkout transformations such as CRLF normalization or LFS pointers may appear as differences. Sparse checkouts are not supported; missing tracked paths are treated as deletions. Paths must be valid UTF-8.
- Binary/non-UTF-8 content, files over 2 MiB, symlinks, special files, and submodules receive notices. Renames appear as delete/add; exact move/copy detection remains future work.
- A changed line has one owner even when multiple behaviors affect it. Character-level splitting, cross-revision feedback migration, and progress tracking are deferred.
- General-purpose syntax highlighting and Mermaid produce large build chunks. Larger-review performance needs further evaluation.

## Validation

Tests exercise mixed Git states, worktrees, snapshots, checksum failures, YAML parsing, compact selectors, full coverage, adjacent/disjoint projections, metadata ownership, flag derivation, and feedback export. CLI tests run the real entry point against saved captures. UI rendering tests cover empty and metadata-only reviews. The skill's helper is exercised and its frontmatter checked separately. Interactive browser verification remains distinct from these automated checks.

## Pull-request snapshots

Version-2 captures may include `baseCommit` and `pullRequest` (`url`, `number`, `title`), alongside `head` and `mergeBase`. Older local captures remain valid without these fields. PR source comes directly from committed Git objects; the adjacent checkout is only inspection context. The snapshot identity binds the repository, revisions, source, and PR metadata. Analysis and ownership use the same inventory and validation as local captures.
