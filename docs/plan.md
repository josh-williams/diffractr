# Diffraction: implementation plan

Status: working plan, updated 2026-09-07. Build a dedicated application for local self-review, with Codex as the only V1 agent integration and MIT licensing. Implementation has not begun. Milestone details below are proposed.

## Development workflow

Keep requirements, decisions, and milestone status in this repository. The [product brief](product-brief.md) defines product scope; this plan defines implementation sequence and validation. Record scope changes in the brief before implementing them.

Use separate implementation tasks when there are bounded deliverables with agreed inputs and acceptance criteria. Isolate concurrent code changes with worktrees, which Codex supports for independent tasks in the same project. [Official worktree documentation](https://learn.chatgpt.com/docs/environments/git-worktrees)

Each implementation task should receive: the problem, relevant brief sections, scope boundaries, dependencies, acceptance criteria, and expected evidence. Its completion note should identify changes, validation, remaining limitations, and any decisions needing product input. Review and integrate one coherent change at a time.

Plan the next milestone in detail and keep later ones coarse. Record consequential technical decisions with their rationale. Add GitHub issues when execution or outside collaboration makes them useful; avoid maintaining duplicate task status in several places.

Push incremental work to GitHub as development proceeds. Maintain installation instructions, usage documentation, and examples alongside the features they describe. Include the MIT license from the start. There is no separate open-source release milestone; a contributor guide and PR checks are out of scope for now.

## Milestones

| Milestone | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Core review model and prototype | Define a review artifact and demonstrate overview, semantic sections, descriptions, diagrams, flags, real diffs, size breakdown, and draft comments using fixed data | A reviewer can understand a realistic change and leave feedback; all changed units are accounted for |
| 2. Local vertical slice | Capture the combined net change from the branch's merge base to the current local state, including non-ignored untracked files; generate organization through Codex, validate coverage, render and export comments | Complete local review loop works across committed, staged, unstaged, and untracked changes; model failure leaves the full diff available |
| 3. GitHub PR review | Open a GitHub PR in the review experience, generate semantic sections, collect draft comments, and submit a native GitHub review | A reviewer can understand and review a PR, with feedback attached to the intended revision and code ranges |
| 4. Cloud-hosted product | Host the review interface, analysis execution, and review storage in the cloud, with repository access and authentication | A user can initiate and complete a review in the browser without running a local CLI or server |

Exact move matching and basic classification should enter the local slice; sophisticated similarity matching can follow measured need.

Use the [section model and layout](product-brief.md#confirmed-section-model-and-layout) in the product brief. Prototype it on a change that spans implementation layers and splits one file across sections.

## Later work

Design progress tracking and revision reconciliation after the core review model is established. GitHub PR review and cloud hosting are future milestones after the local workflow. Cloud deployment details and automatic review triggers will be designed when that milestone approaches. Additional agent integrations, live Q&A, and manual regrouping remain deferred. Progress tracking's place in the sequence will be decided later.

## Architectural questions to prove early

- Can the renderer show disjoint ranges while preserving original line numbers and comment locations?
- What unit allows semantic splitting without losing or duplicating changed lines? Do not assume raw Git hunks are sufficient.
- How is the comparison branch identified automatically before computing the merge base, and how are missing or ambiguous base references reported?
- How can we capture a coherent working-tree snapshot while another process edits it? Detect concurrent changes and retry or explicitly label the captured state.
- How is a model result tied to the exact snapshot it analyzed? Stale results must not overwrite newer analysis.
- Can Codex produce the defined review artifact through a supported interface using the user's existing access, with visible usage and useful failure handling?

Proposed boundary: ordinary code owns captured diffs, references, coverage, counts, and feedback; Codex proposes organization, explanations, and flags. Define a review artifact between these layers. Keep revision tracking outside the initial model-design work except for identifying the captured input each artifact describes.

## Next implementation step

Define the core review artifact using the confirmed section model. The local scope is fixed for V1: all net changes since the branch's merge base, including committed, staged, unstaged, and non-ignored untracked work, with no scope selector or committed-only mode. Use a realistic change with cross-file behavior, unrelated edits within one file, and generated/test output to shape the first prototype. Validate layout details and code anchoring before substantial backend investment.
