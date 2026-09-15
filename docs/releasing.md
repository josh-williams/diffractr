# Releasing

`package.json` is the version source of truth. `npm version` updates it and the lockfile, creates a commit, and tags that commit. Publishing a stable GitHub release runs `.github/workflows/publish.yml`; pushing commits or tags alone does not publish to npm. Prereleases are not supported by this workflow yet.

The workflow checks the tag and lockfile versions, runs lint, formatting checks and tests, builds once, and tests an offline installation of the resulting tarball before publishing that same file. It uses Node 24 and npm trusted publishing, with provenance and no stored npm token.

## First publication

Use Node 24 and npm 11.5.1 or newer for release work. Before the initial publish, commit and push the release setup, then prepare and test the artifact:

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run release:check -- v0.1.0
npm pack
node scripts/test-package.mjs ./diffractr-0.1.0.tgz
```

Log in to the npm account that should own the package. Publishing the tarball creates the package; complete npm's browser login and 2FA prompts locally:

```sh
npm login --registry=https://registry.npmjs.org/
npm publish ./diffractr-0.1.0.tgz --ignore-scripts --access public
```

Tag the committed source used to build that artifact:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Do not publish a GitHub release for this bootstrap version: it is already on npm, and the workflow would try to publish it again. npm does not allow overwriting a published version. The initial manual publication does not have GitHub Actions provenance.

In the npm package's Settings → Trusted Publisher, select GitHub Actions:

- Organization or user: `josh-williams`
- Repository: `diffractr`
- Workflow filename: `publish.yml`
- Environment: leave blank
- Allow direct publishing with `npm publish` if the settings offer that choice.

No npm secret needs to be added to GitHub. See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for the account setup.

## Subsequent releases

Start on `main` with a clean working tree and the intended changes committed. For a patch release:

```sh
npm version patch -m "Release %s"
git push origin main
git push origin "v$(node -p 'require("./package.json").version')"
```

Use `minor`, `major`, or an explicit stable version instead of `patch` as appropriate. `npm version` creates the version commit and tag locally; it does not push or publish anything.

Create and publish a GitHub release using that existing tag. That action triggers publication to npm. The workflow fails if the tag does not exactly match `v` plus the package version or the lockfile disagrees. Check the Actions run to confirm publication before announcing availability.

If checks fail before publishing, fix the issue and prepare a new version/tag. If npm publication succeeded but the job later appears unsuccessful, check npm before rerunning: publishing the same version twice is rejected.

## Testing an existing artifact

```sh
node scripts/test-package.mjs /absolute/path/to/diffractr-0.1.0.tgz
```

This leaves the supplied tarball in place. `npm run test:package` remains the convenience command that builds and tests a temporary tarball. The smoke test verifies the installed package version against the checkout, CLI execution, self-contained skill installation, capture, validation, and authenticated viewer serving.
