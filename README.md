# Diffraction

Diffraction helps developers understand and review large code changes through behavior-based sections, concise explanations, and annotations anchored to the code.

The initial workflow focuses on local self-review of coding-agent output, using Codex to organize and explain changes. GitHub PR review and cloud hosting are planned follow-ups.

## Review a local repository

Requires Node.js 22.12 or newer, npm, and Git.

From the Diffraction checkout:

```sh
npm ci
npm run build
npm run review -- --repo /path/to/repository
```

Open the complete URL printed by the command. It serves the captured review at `127.0.0.1:5174`; the URL fragment grants access to that session's snapshot. Use `--port 5175` if the port is occupied. To invoke it from another repository after building, run `node /path/to/diffraction/scripts/review.mjs` there.

The command captures all net changes from the comparison branch's merge base to the current files on disk, including committed, staged, unstaged, and non-ignored untracked changes. It does not fetch, alter the index, or modify files. Each review is a fixed snapshot; run the command again to capture later edits. Feedback is retained per snapshot in browser storage on the same host and port.

Comparison selection prefers `origin`'s recorded default branch, then a single other remote default. Without that metadata, it uses an unambiguous `main` or `master` branch, preferring the corresponding `origin` reference when present. Remote references reflect the last fetch. Missing or ambiguous references require an explicit override:

```sh
npm run review -- --repo /path/to/repository --base origin/trunk
```

The override selects the comparison reference, not a different change scope. Captures need an existing commit and no unresolved merge conflicts. Ordinary repositories, linked worktrees, and detached HEAD are supported.

Real reviews currently show all changed files without generated groups, explanations, or flags. Text diffs retain original coordinates, context expansion, line feedback, and Markdown export. Binary and non-UTF-8 files, symlinks, submodules, special files, and text over 2 MiB display notices. Empty-file and mode changes remain visible. Renames currently appear as a deletion plus an addition. File roles use basic filename/header heuristics, with unmatched files classified as Other.

## Run the example

```sh
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

The development server loads a bundled, synthetic team-invitations change with fixed analysis. It does not read your repository or call Codex.

1. Start with the overview and production/test/generated size breakdown.
2. Scroll through the change groups to read their descriptions, diagrams, and syntax-highlighted diffs, or jump to a group using the sidebar. Its highlight follows your position. The invitation service appears in both groups, with different changes in each.
3. Click any unmodified-lines separator to reveal its context, or open the complete file diff. Generated output starts collapsed.
4. Select a line number or drag a range to draft feedback. Inline flags also provide a feedback shortcut.
5. Open **Your feedback** and copy a prompt for Codex or download Markdown. Exports include snapshot identity, file paths, old/new line ranges, and quoted code.

Use the sun/moon button in the top bar to switch between light and dark themes. The selection persists in this browser; diff views stay dark in both modes.

Draft comments persist in this browser for the example snapshot. They are not sent anywhere. Use the feedback panel to delete them.

## Development

```sh
npm test          # Coverage validation, diff projection, and feedback anchors
npm run build    # Type-check and produce dist/
npm run preview  # Serve the example production build locally
npm run format   # Format source and configuration
```

The app uses React, TypeScript, Vite, Tailwind CSS 4, Pierre's diff components, and Zod. The first milestone establishes the review model and browser interactions. Local Git capture and basic file classification are implemented. Codex-generated analysis and move matching are next; the example supplies its descriptions and file roles explicitly.

## Project documentation

- [Product brief](docs/product-brief.md): requirements, section model, and open questions.
- [Implementation plan](docs/plan.md): milestones, development workflow, and validation.
- [Review model](docs/review-model.md): artifact boundaries, coordinates, coverage guarantees, and prototype limitations.

## License

[MIT](LICENSE).
