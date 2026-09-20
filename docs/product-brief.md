# diffractr: product brief

Status: working brief, updated 2026-09-07. Confirmed decisions and requirements are distinguished from proposals and open questions.

## Purpose

Help a human understand and review large code changes through semantic organization, clear explanations, and selective annotations anchored to the code.

## Confirmed direction

- Build a dedicated application for semantic code review.
- Prioritize local self-review of coding-agent output for V1.
- Support Codex as the only coding-agent integration for V1.
- Use the MIT license. Contributions are welcome; the primary audience is developers reviewing their own coding-agent output and teams reviewing code changes.
- Include the license from the start, push work to GitHub incrementally, and document installation, usage, and examples as features are built. No separate open-source release milestone, contributor guide, or PR checks are needed for now.
- Establish the core review model before designing progress tracking and revision reconciliation.

## Requirements

- Organize changes into semantic sections in a meaningful reading order. One file can contribute to several sections; unrelated changes within a diff chunk may need separation. The underlying atomic unit remains undecided.
- Begin with an overall summary and section navigation on the left. A section description can range from one sentence to a couple of paragraphs, with one or two diagrams when useful.
- Explain business logic clearly, potentially with pseudocode-style control flow, call trees, or diagrams when useful.
- Add selective, line-anchored flags for notable behavior and decisions that need human attention. Each flag should be 1–3 sentences. Show flag counts per section. A flag need not allege a bug.
- Detect moved/copied code deterministically and expose modifications within moved code.
- Show a size breakdown distinguishing production code, tests, generated code, and other changes.
- Always review the current local result against the branch's merge base, including committed changes, staged changes, unstaged changes, and non-ignored untracked files. Show the combined net change, not separate copies of each Git state. V1 has no scope selector or committed-only mode. Local comments become a prompt the user can hand back to Codex.
- Start with a local, user-invoked tool using Codex. The exact invocation and supported integration interface remain to be established.
- Be language agnostic. Use Pierre's diff components. Prefer deterministic computation whenever it can supply reliable facts or guarantees.
- Verify that every changed unit is accounted for; model output must not silently omit code or invent references.

## Confirmed section model and layout

- A section represents one coherent change in behavior or intent. Prefer behavior-oriented sections across implementation layers; use technical sections when a refactor, migration, or other technical change stands on its own.
- Every changed range belongs to exactly one section. A file can appear in multiple sections, each showing only its assigned changes. The precise splitting algorithm remains open.
- Keep tests with the behavior they validate. Classify production, test, and generated changes independently of section membership for the size breakdown. Mechanical output can be collapsed but must remain discoverable.
- The overview summarizes the whole change, shows the size breakdown, and provides an ordered section list with short descriptions and flag counts. Render the overview and all change groups on one continuous scrollable page. Sidebar links jump to the overview or a group, and the active highlight follows the current scroll position. Omit an All files link and a group heading from the sidebar.
- Within a section, place its description and any useful diagrams above the relevant diffs. Order those diffs to make the implementation understandable.
- Render flags inline at the relevant code ranges so their location is unambiguous. The section description explains the overall change; flags identify specific decisions or behavior worth checking, without repetitively restating the description.
- Allow the reviewer to expand surrounding context or open the complete file diff. Context shown for comprehension does not duplicate ownership of a changed range.

## Interface styling

Use “change groups” in the interface for semantic groupings. Keep UI copy concise: omit instructional filler and decorative explanations; retain the actual change summaries, flags, and actionable status/error messages.

Use Tailwind CSS 4 with a custom Mist palette for application surfaces: an equal OKLab blend of the corresponding gray and zinc shades. Support light and dark themes, keeping diff views dark in both. Never assign colors to individual sections; use the same Mist treatment for all section numbers and diagrams. Use violet, blue, cyan, and amber for file-role categories in the size breakdown. Use IBM Plex Sans for interface text and prose, and IBM Plex Mono for diff code. Bundle the fonts locally. Favor compact spacing, consistent sidebar text alignment, and restrained typography. Use a shared muted aurora gradient for every active navigation item. Do not use shadows; distinguish surfaces with borders, color, and spacing. Keep branding small; avoid workspace blocks, version/license badges, and widely spaced uppercase labels.

## Later scope

- Progress tracking at section and file-within-section level.
- Refreshing reviews across revisions, preserving progress, and identifying what needs another look while an agent continues working. Details will be designed after the core model works.
- Reading published GitHub conversations, replying, and resolving threads.
- A cloud-hosted product as a future milestone: browser-based review with cloud analysis and storage, without requiring local CLI invocation. Automatic review triggers and deployment details remain to be designed.
- Additional coding-agent integrations.
- Live Q&A during review and manual regrouping/reordering by the reviewer.

## Proposed product principles

1. A complete diff remains accessible even if generation fails or organization is poor.
2. Apply the confirmed section model above; classification by file role is independent of semantic membership.
3. Classification is not a safety verdict. “Generated” and “test” do not mean “safe to skip.” Unknown categories remain visible.
4. Bind analysis and comments to the captured diff they describe. Cross-revision progress behavior is a later design concern.
5. Deterministic similarity does not prove semantic equivalence. Explain the matching basis and retain a raw comparison.
6. Local UI and storage do not imply local inference. Make the Codex integration's data boundary understandable.

## Questions to resolve next

1. What semantic unit supports unrelated changes within a file or raw diff hunk while guaranteeing complete coverage?
2. How should the section layout handle dense changes, long descriptions, and multiple flags? Refine spacing and interaction details with a realistic prototype.
3. How will Codex generate the review artifact through a supported interface using the user's existing access?
4. How is the base branch identified automatically, and what happens when it cannot be determined? A merge base requires both the current branch and a comparison branch; V1 has no scope selector.

## Proposed first success criterion

A reviewer can open a large local change, understand its behavior through ordered semantic sections, inspect useful flags, leave precisely anchored feedback, and export that feedback for Codex. Evaluate orientation time, comprehension, annotation quality, complete coverage, and generation cost. Progress preservation across revisions is not a prerequisite for the initial local workflow.

## Analysis authoring contract

V1 uses a Codex skill plus a local CLI. The existing agent captures changes, investigates with its normal tools, writes YAML analysis, resolves validation errors, and starts the viewer. diffractr does not launch an agent. Capture precedes analysis and binds references to immutable before/after source.

Analysis contains ordered groups with titles, Markdown descriptions, and tool-generated block references. Omitting `rows` selects a whole block; quoted selectors such as `"5-28, 32"` select block-local rows. Changed rows have exactly one owner; context does not acquire ownership. Non-text changes have whole-change blocks. The application derives navigation IDs and flag ownership. Flags contain Markdown `text` and block/row anchors, with no title or authored group ID. Descriptions may contain Mermaid fences.

Flags surface consequential, non-obvious details, including possible defects encountered while understanding the change. The agent is not tasked with a separate defect hunt or a quota of findings. Invalid analysis remains repairable through CLI validation, and the viewer retains the complete diff.

## GitHub PR input

The local skill and CLI accept a GitHub.com pull-request URL using the user's existing GitHub CLI authentication. Capture uses an isolated checkout for agent inspection and immutable merge-base-to-head Git objects for source facts. Saved reviews show the PR title, link, and exact revisions, and remain readable offline. Public, private, and fork PRs are supported where the account has access. PR feedback is saved to GitHub pending reviews as it is authored and can be submitted as comments, approvals, or requests for changes. New commits do not block submission; unsupported inline anchors have an explicit summary fallback. Cloud execution remains a separate follow-up.
