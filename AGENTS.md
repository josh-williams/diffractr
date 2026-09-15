# Working on diffractr

- Use Node 24 (`nvm use`) and install dependencies with `npm ci`.
- Run `npm run check` for lint, formatting, tests, and type checking. Use `npm run format` to fix formatting.
- Run `npm run test:package` for changes to the CLI, capture format, installation, build, or packaging. It builds and smoke-tests the installed tarball and self-contained skill.
- Do not edit vendored code under `tools/oxlint/anti-slop/` during ordinary application work. Keep Oxlint and its plugin package versions aligned.

## Architecture

- `src/core/` owns source coordinates, inventories, coverage validation, and review projection. Ordinary code owns identities and counts; agents author organization and explanations.
- `scripts/` owns Git capture, saved reviews, the CLI, installation, and the loopback server. Captures are immutable; persisted inventories are authoritative when reopening.
- `src/components/` and `src/hooks/` implement the viewer. Preserve the independent sidebar/content scrolling and fixed main header.
- `skills/diffractr/` is the shipped agent integration. Update its format reference when changing the authoring contract.
- `tests/fixtures/reviews/` contains saved compatibility examples. Do not regenerate them just to make a failing test pass; investigate the format or behavior change first.

## Product and design

Use lowercase `diffractr` for the product. Use change groups in the UI, the existing Mist palette, IBM Plex fonts, and no shadows. Follow the existing design instead of adding new visual conventions.

See [product brief](docs/product-brief.md) for scope, [plan](docs/plan.md) for remaining work, [review model](docs/review-model.md) for invariants, and [release guide](docs/releasing.md) for publication. Keep these accurate when behavior changes; avoid duplicating requirements here.
