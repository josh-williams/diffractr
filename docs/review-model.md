# Review model

The prototype separates source facts from explanatory analysis. The definitions and runtime analysis schema live in `src/core/review.ts`; `src/examples/invitations.ts` supplies the bundled example.

## Artifact boundaries

- **Snapshot:** repository, branch, base, a snapshot identity, and files containing before/after text. A null side means a file was added or deleted. File roles are independent of semantic sections.
- **Change unit:** a contiguous edit block computed from a zero-context diff. It holds original old/new offsets and changed-line counts. Unchanged lines separate units even when Git would place them in one context hunk.
- **Analysis:** versioned snapshot reference, overview, ordered sections, descriptions, diagrams, unit assignments, and anchored flags. It contains references to source changes, never replacement source text.
- **Comment:** snapshot identity, file, side, inclusive line range, and the reviewer's text.

The application owns the snapshot, units, counts, source rendering, and feedback. Analysis proposes the reading order and explanations. The prototype supplies analysis as fixed data; a later Codex adapter will produce the same validated structure.

## Coordinates and coverage

Unit offsets are zero-based, with separate counts on each side. Flag and comment anchors are one-based inclusive ranges on either the old (`deletions`) or new (`additions`) text. Unit IDs are local to one snapshot, not stable progress identifiers.

Validation requires every unit to belong to exactly one section. Unknown units, duplicate assignments, missing coverage, duplicate section/flag identities, and mismatched snapshot IDs reject the whole analysis. A flag must reference changed lines owned by its section. Reviewer comments can also target unchanged context.

A section projects each assigned unit into a real patch with original line numbers. Context expansion stops at neighboring changes so another section's edits cannot leak into the section. Each omitted-context separator is a button that reveals the unchanged lines on that side. The complete file diff remains available with unrestricted context. File roles determine the size breakdown; displaying context or the same file in multiple sections does not increase the counts.

If analysis validation fails, the interface offers all files without semantic organization. Feedback export checks snapshot identity and anchor bounds, then quotes the selected source from the appropriate side.

## Prototype choices and limitations

- React and Vite provide a small local browser app. Pierre's diff components render source and handle line selection. The syntax highlighter initializes before the first diff mounts.
- Zod validates analysis at the boundary. Text is rendered as text; descriptions and diagrams cannot inject HTML or executable diagram code. Diagrams currently support a short sequence of labeled steps, not an arbitrary graph.
- The synthetic example includes implementation, tests, generated output, and schema changes. It is review data, not an executable invitation backend. Its roles and explanations are manually specified.
- The first unit is an indivisible contiguous edit block. Adjacent unrelated changes within that block cannot yet be assigned to different sections. Further splitting must preserve non-overlapping old/new ranges and exact coverage.
- Snapshot identity is fixed for the example. Live capture must derive identity from the captured inputs and detect concurrent edits before relying on it for stale-result rejection.
- Binary files, file modes, renames, exact move/copy detection, automatic classification, live Git capture, and Codex execution are not implemented.
- Draft feedback is stored in browser local storage under the snapshot identity. Clipboard and Markdown download are the only export paths. Cross-revision migration and progress tracking remain later work.
- The prototype bundles a general-purpose syntax highlighter. Its production build reports a large-chunk warning; worker loading and bundle optimization remain performance work for larger reviews.

## Validation

`npm test` exercises analysis integrity, projection coordinates, boundary insertions/deletions, missing final newlines, context isolation, size counts, and feedback export. `npm run build` checks TypeScript and generates the production assets. Browser verification exercises the actual renderer and feedback interactions, which unit tests cannot establish.
