# Diffraction

Diffraction helps developers understand and review large code changes through behavior-based sections, concise explanations, and annotations anchored to the code.

The initial workflow focuses on local self-review of coding-agent output, using Codex to organize and explain changes. GitHub PR review and cloud hosting are planned follow-ups.

## Run the prototype

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

The prototype loads a bundled, synthetic team-invitations change. It does not read your repository or call Codex yet.

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
npm run preview  # Serve the production build locally
npm run format   # Format source and configuration
```

The app uses React, TypeScript, Vite, Tailwind CSS 4, Pierre's diff components, and Zod. The first milestone establishes the review model and browser interactions. Local Git capture, Codex-generated analysis, move matching, and automatic file classification are next; the current example supplies its descriptions and file roles explicitly.

## Project documentation

- [Product brief](docs/product-brief.md): requirements, section model, and open questions.
- [Implementation plan](docs/plan.md): milestones, development workflow, and validation.
- [Review model](docs/review-model.md): artifact boundaries, coordinates, coverage guarantees, and prototype limitations.

## License

[MIT](LICENSE).
