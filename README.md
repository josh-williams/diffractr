# diffractr

diffractr helps developers understand and review large code changes through behavior-based sections, concise explanations, and annotations anchored to the code.

The initial workflow focuses on local self-review of coding-agent output, using Codex to organize and explain changes. GitHub PR review and cloud hosting are planned follow-ups.

## Install and review

Requires Node.js 22.12 or newer and Git. The standalone package includes the CLI and built viewer; users do not need a source checkout, build tools, or runtime npm dependencies.

Install the Codex skill directly from npm:

```sh
npx diffractr install-skill
```

For direct CLI use, install globally:

```sh
npm install -g diffractr
diffractr --help
```

### Codex skill

`install-skill` installs the [skill](skills/diffractr/SKILL.md) to `~/.agents/skills/diffractr`, including its own compiled runtime and viewer. New Codex sessions can use `$diffractr` to review local changes. The installed skill works even if the original package or npx cache is removed. No symlink or API key is needed.

Use `install-skill --dest /custom/path/diffractr` for a different destination. Existing destinations are never overwritten. To upgrade, remove the previous skill installation and run the command from the desired package version again. Renaming does not remove an older separately installed skill.

### CLI workflow

```sh
diffractr capture --repo /path/to/repository
diffractr inspect /path/to/capture --block B7
diffractr validate /path/to/capture
diffractr open /path/to/capture
```

Capture prints a fresh temporary directory containing immutable source and its authoritative block inventory (`capture.json`), a readable numbered diff (`diff.txt`), and an analysis template (`analysis.yaml`). The agent fills in that template using the [review format](skills/diffractr/references/format.md), then validates and opens it. `--out` selects a persistent capture directory instead.

Open the complete URL printed by `open`, including the snapshot fragment. It serves on `127.0.0.1:5174`; use `--port 5175` if occupied. Saved captures reopen without the repository or regenerating block references. Old version-1 captures must be recaptured; new captures use version 2. Editing `analysis.yaml` requires restarting `open`. Invalid analysis opens the complete diff with errors; a corrupted capture is rejected.

Whole blocks use references; partial selections use quoted inclusive ranges such as `rows: "5-28, 32"`. Descriptions support Markdown and Mermaid, and flags have text and block/row anchors. Validation requires complete, non-overlapping ownership. Split fragments preserve line numbers; full-file view supplies additional context.

## Build a distributable package

For maintainers, from the checkout:

```sh
npm ci
npm pack
```

The prepack step builds the viewer and compiled CLI. The resulting `diffractr-0.1.0.tgz` contains built assets, the skill, documentation, and licenses. It excludes application source, tests, and development dependencies. `npm run test:package` builds and tests the tarball through an offline installation in a temporary Git repository, including the independently installed skill and authenticated HTTP viewer.

Publishing is a separate step. See [Releasing](docs/releasing.md) for initial npm setup and the version/tag release workflow.

## Review a local repository without analysis

Requires Node.js 22.12 or newer, npm, and Git.

From the diffractr checkout:

```sh
npm ci
npm run build
npm run review -- --repo /path/to/repository
```

Open the complete URL printed by the command. It serves the captured review at `127.0.0.1:5174`; the URL fragment grants access to that session's snapshot. Use `--port 5175` if the port is occupied. To invoke it from another repository after building, run `node /path/to/diffractr/scripts/review.mjs` there.

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
npm run build    # Type-check and build CLI plus dist/viewer/
npm run test:package # Verify the standalone tarball and installed skill
npm run preview  # Serve the example production build locally
npm run format   # Format with Oxfmt
npm run format:check # Check formatting without writing
npm run lint     # Oxlint with the vendored anti-slop rules
npm run lint:fix # Apply available lint fixes
```

The app uses React, TypeScript, Vite, Tailwind CSS 4, Pierre's diff components, and Zod. The first milestone establishes the review model and browser interactions. Local Git capture and basic file classification are implemented. The skill and saved-analysis workflow are implemented; exact move matching and broader agent evaluations remain future work. The example supplies its descriptions and file roles explicitly.

## Project documentation

- [Product brief](docs/product-brief.md): requirements, section model, and open questions.
- [Implementation plan](docs/plan.md): milestones, development workflow, and validation.
- [Review model](docs/review-model.md): artifact boundaries, coordinates, coverage guarantees, and prototype limitations.

## License

[MIT](LICENSE).

## Code quality tooling

Vite serves and builds the React app; TypeScript checks types and Vitest runs tests. Oxfmt handles formatting. Oxlint and `@oxlint/plugins` are pinned to matching versions; upgrade them together.

[Anti-slop](https://github.com/dmmulroy/anti-slop) is vendored under `tools/oxlint/anti-slop/`, with provenance and licenses included. All generic rules are enabled. The adjacent `.mjs` adapter loads its TypeScript source on Node 22.12 using the existing `tsx` dependency. Vendored rules and installed agent directories are excluded from linting and formatting; the project's own `skills/` source remains checked.

Run lint, format checks, tests, and the build before submitting changes.
