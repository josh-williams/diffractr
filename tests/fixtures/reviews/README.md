# Saved review fixtures

These synthetic reviews are checked-in version-2 captures with version-1 authored analysis. They contain no private repository content. Each directory contains `capture.json`, `diff.txt`, and `analysis.yaml`, exactly as the CLI workflow expects.

| Fixture         | Purpose                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cross-file`    | Six-file invitation change spanning implementation, tests, schema, and generated output; two behavior groups and two flags. Frozen from the bundled example. |
| `split-block`   | Adjacent timeout/retry replacements in one block assigned to different groups, with a flag on one changed row.                                               |
| `metadata-only` | Executable-bit change, binary notice, and empty file with whole-block ownership and a non-text flag.                                                         |

From the repository root:

```sh
npm run diffractr -- validate tests/fixtures/reviews/split-block
npm run build
npm run diffractr -- open tests/fixtures/reviews/split-block --port 5175
```

The test suite reopens these saved inventories, validates complete ownership, checks projected counts and split coordinates, and compares the readable inventory. Do not regenerate fixtures automatically when the parser or diff algorithm changes: they are evidence of compatibility with already-saved reviews. An intentional format migration should add or explicitly migrate fixtures and document the compatibility change.

For manual skill evaluation, copy a fixture to a temporary directory and replace only its `analysis.yaml` with a fresh template using the same snapshot ID. Ask the agent to organize the numbered diff, then validate it. Compare grouping quality, first-pass coverage, and repair effort with the checked-in example; wording and group order need not match. These small examples are a baseline, not a comprehensive measure of review quality.
