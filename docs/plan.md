# diffractr: implementation plan

Status: working plan, updated 2026-09-15. Build a dedicated application for local self-review, with Codex as the only V1 agent integration and MIT licensing. Milestone 1 is implemented as a runnable example prototype. Local capture, block-based analysis validation, organized browser review, and a bundled Codex skill are implemented. Broader agent evaluation remains.

## Development workflow

Keep requirements, decisions, and milestone status in this repository. The [product brief](product-brief.md) defines product scope; this plan defines implementation sequence and validation. Record scope changes in the brief before implementing them.

Use separate implementation tasks when there are bounded deliverables with agreed inputs and acceptance criteria. Isolate concurrent code changes with worktrees, which Codex supports for independent tasks in the same project. [Official worktree documentation](https://learn.chatgpt.com/docs/environments/git-worktrees)

Each implementation task should receive: the problem, relevant brief sections, scope boundaries, dependencies, acceptance criteria, and expected evidence. Its completion note should identify changes, validation, remaining limitations, and any decisions needing product input. Review and integrate one coherent change at a time.

Plan the next milestone in detail and keep later ones coarse. Record consequential technical decisions with their rationale. Add GitHub issues when execution or outside collaboration makes them useful; avoid maintaining duplicate task status in several places.

Maintain installation instructions, usage documentation, and examples alongside the features they describe. Include the MIT license from the start. There is no separate open-source release milestone; a separate contributor guide remains deferred. Push and PR checks now validate source and packaged installation.

## Milestones

| Milestone                          | Deliverable                                                                                                                                                                                                        | Exit condition                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Core review model and prototype | Define a review artifact and demonstrate overview, semantic sections, descriptions, diagrams, flags, real diffs, size breakdown, and draft comments using fixed data                                               | A reviewer can understand a realistic change and leave feedback; all changed units are accounted for                                     |
| 2. Local vertical slice            | Capture the combined net change from the branch's merge base to the current local state, including non-ignored untracked files; generate organization through Codex, validate coverage, render and export comments | Complete local review loop works across committed, staged, unstaged, and untracked changes; model failure leaves the full diff available |
| 3. GitHub PR review                | Open a GitHub PR in the review experience, generate semantic sections, collect draft comments, and submit a native GitHub review                                                                                   | A reviewer can understand and review a PR, with feedback attached to the intended revision and code ranges                               |
| 4. Cloud-hosted product            | Host the review interface, analysis execution, and review storage in the cloud, with repository access and authentication                                                                                          | A user can initiate and complete a review in the browser without running a local CLI or server                                           |

Exact move matching and basic classification should enter the local slice; sophisticated similarity matching can follow measured need.

Use the [section model and layout](product-brief.md#confirmed-section-model-and-layout) in the product brief. Prototype it on a change that spans implementation layers and splits one file across sections.

## Later work

Design progress tracking and revision reconciliation after the core review model is established. GitHub PR review and cloud hosting are future milestones after the local workflow. Cloud deployment details and automatic review triggers will be designed when that milestone approaches. Additional agent integrations, live Q&A, and manual regrouping remain deferred. Progress tracking's place in the sequence will be decided later.

## Established architectural decisions

- Split fragments preserve original line coordinates and comment locations. Expandable surrounding context remains limited; full-file view provides context.
- Persisted numbered blocks and inclusive block-local row selectors support semantic splitting. Validation requires exactly one owner per changed row.
- Base selection uses recorded remote default metadata, then unambiguous main/master references; ambiguity requires an explicit base.
- Capture compares consecutive reads and retries detected edits. This detects observed changes but is not an atomic filesystem snapshot.
- Analysis names the snapshot identity. Saved captures contain a checksum and authoritative inventory; stale references fail validation.
- A self-contained Codex skill uses the existing agent session and the CLI to author, validate, and open analysis. Invalid analysis leaves the full diff available.

Architectural boundary: ordinary code owns captured diffs, references, coverage, counts, and feedback; Codex proposes organization, explanations, and flags. Define a review artifact between these layers. Keep revision tracking outside the initial model-design work except for identifying the captured input each artifact describes.

## Milestone 1 implementation

The browser prototype implements overview, ordered behavior sections, descriptions, simple flow diagrams, inline flags, size breakdown, context expansion, full file diffs, and persistent draft feedback with Markdown export. The bundled example splits one service file across two behaviors and keeps each behavior's tests alongside it.

The [review model](review-model.md) separates deterministic source changes from proposed analysis. Validation rejects missing, duplicated, invented, and stale references. Tests cover source coordinates, additions/deletions at file boundaries, context isolation, counts, and feedback export. Browser checks cover rendering, old-side line selection, flags, feedback persistence, and clipboard export.

Contiguous edit blocks are numbered for authoring. Whole-block references and block-local row selectors support adjacent semantic splits while preserving source coordinates. Non-text changes have explicit whole-change coverage.

## Local capture and browser review

The local command captures merge-base-to-working-tree changes, including non-ignored untracked files, without mutating Git. It checks two consecutive reads and retries observed concurrent edits. The snapshot remains fixed in memory and is served on loopback with a per-session access token. Browser feedback uses the snapshot identity and original source coordinates.

Base resolution prefers recorded remote default metadata, then an unambiguous main/master reference; ambiguous cases require `--base`. No automatic fetch occurs. Binary/non-UTF-8 content, files over 2 MiB, symlinks, special files, and submodules receive visible notices. Empty files and mode changes remain visible; renames appear as delete/add. Basic file-role heuristics are implemented.

Tests use temporary Git repositories to exercise capture integrity, worktrees, merge bases, mixed changes, ambiguity, conflicts, and concurrency; HTTP tests check snapshot access and immutability. UI rendering tests cover empty and metadata-only reviews. Interactive behavior has been checked manually during development; automated browser regression coverage remains deferred.

## Skill and saved-analysis workflow

`capture`, `inspect`, `validate`, and `open` form the local authoring interface. Captures include a checksum and numbered inventory. YAML analysis selects tool-generated blocks or row ranges; the validator derives internal IDs and flag ownership. Descriptions use Markdown with Mermaid fences. Malformed analysis leaves the complete diff available.

The bundled Codex skill uses the existing agent session and its tools. It writes analysis against the saved capture and uses validation errors for repair. It does not launch another agent.

## Next implementation step

Evaluate the skill on larger real changes, comparing grouping quality, first-pass coverage, and repair effort. Verify interactive rendering and feedback for saved reviews, including Mermaid errors and split fragments. Exact move matching, rename presentation, richer split-fragment context, and handling checkout transformations remain follow-ups.

The local scope remains fixed: all net changes since the branch's merge base, with no scope selector or committed-only mode.

## Standalone CLI and installation

The `diffractr` tarball bundles a compiled Node CLI and prebuilt browser viewer, with no runtime npm dependencies. `install-skill` installs a self-contained Codex skill with a copied runtime, independently of the source checkout or npx cache. `npm pack` builds the distribution; `npm run test:package` verifies an offline installation, capture/inspect/validate/open, and viewer assets. The package is published on npm. Stable GitHub releases trigger trusted publishing after validation; see [Releasing](releasing.md).

## Development checks and regression examples

`npm run check` runs lint, formatting checks, tests, and type checking. `npm run test:package` builds and tests an installed distribution. CI runs on main pushes and PRs, building on Node 24 and smoke-testing the same artifact on Node 22.12.0 and Node 24.

Saved capture/analysis fixtures cover cross-file behavior, split blocks, and metadata-only changes. Tests reopen them and verify coverage and projection; they also support manual skill evaluation. Broader grouping-quality evaluation and interactive checks remain future work, rather than completed automated coverage.
