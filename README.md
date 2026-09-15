# Diffraction

Diffraction helps developers understand and review large code changes through behavior-based sections, concise explanations, and annotations anchored to the code.

The initial workflow focuses on local self-review of coding-agent output, using Codex to organize and explain changes. GitHub PR review and cloud hosting are planned follow-ups.

## Create an organized review

Requires Node.js 22.12 or newer, npm, and Git. From the Diffraction checkout:

```sh
npm ci
npm run build
npm run diffraction -- capture --repo /path/to/repository
```

The capture command prints a temporary directory containing immutable source (`capture.json`), a numbered block inventory (`diff.txt`), and an analysis template (`analysis.yaml`). Have Codex read the diff and relevant repository context, then fill in the template using the [review format](skills/diffraction/references/format.md).

```sh
npm run diffraction -- inspect /path/to/capture --block B7
npm run diffraction -- validate /path/to/capture
npm run diffraction -- open /path/to/capture
```

Open the complete URL printed by `open`, including the snapshot fragment. It serves on `127.0.0.1:5174`; use `--port 5175` if occupied. Saved captures include their authoritative block inventory and can be reopened without the original repository or regenerating block references. Older version-1 captures must be recaptured; new captures use version 2. Editing `analysis.yaml` requires restarting `open` to load it again. Invalid analysis opens the complete-diff fallback with specific errors; a corrupted capture is rejected.

Whole blocks are selected by reference. Partial selections use quoted inclusive ranges such as `rows: "5-28, 32"`. Group descriptions support Markdown and Mermaid; flags have text and block/row anchors. The validator requires complete, non-overlapping ownership of changed rows and non-text changes. Split fragments preserve line numbers; full-file view supplies additional context.

### Codex skill

The bundled [Diffraction skill](skills/diffraction/SKILL.md) guides capture, investigation, analysis, validation, and serving. To make it discoverable in Codex, symlink the skill from this checkout:

```sh
mkdir -p ~/.agents/skills
ln -s /path/to/diffraction/skills/diffraction ~/.agents/skills/diffraction
```

Then ask Codex to use `$diffraction` to review a repository's local changes. Its helper resolves the CLI relative to the checkout, so keep the checkout and its installed dependencies available. Diffraction does not launch another agent or require a separate API key. The package is not published to npm yet; the commands above work from the local checkout.

## Review a local repository without analysis

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

The direct `review` command shows all changed files without analysis. Use the saved-capture workflow above for organized reviews. Text diffs retain original coordinates, context expansion, line feedback, and Markdown export. Binary and non-UTF-8 files, symlinks, submodules, special files, and text over 2 MiB display notices. Empty-file and mode changes remain visible. Renames currently appear as a deletion plus an addition. File roles use basic filename/header heuristics, with unmatched files classified as Other.

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

The app uses React, TypeScript, Vite, Tailwind CSS 4, Pierre's diff components, and Zod. The first milestone establishes the review model and browser interactions. Local Git capture and basic file classification are implemented. The skill and saved-analysis workflow are implemented; exact move matching and broader agent evaluations remain future work. The example supplies its descriptions and file roles explicitly.

## Project documentation

- [Product brief](docs/product-brief.md): requirements, section model, and open questions.
- [Implementation plan](docs/plan.md): milestones, development workflow, and validation.
- [Review model](docs/review-model.md): artifact boundaries, coordinates, coverage guarantees, and prototype limitations.

## License

[MIT](LICENSE).
