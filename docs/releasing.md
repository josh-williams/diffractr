# Releasing

`package.json` is the version source of truth. `npm version` updates it and the lockfile, creates a commit, and tags that commit. Publishing a stable GitHub release runs `.github/workflows/publish.yml`; pushing commits or tags alone does not publish to npm. Prereleases are not supported by this workflow yet.

The workflow checks the tag and lockfile versions, runs lint, formatting checks and tests, builds once, and tests an offline installation of the resulting tarball before publishing that same file. It uses Node 24 and npm trusted publishing, with provenance and no stored npm token.

## Release a new version

Use Node 24 and npm 11.5.1 or newer for release work.

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
node scripts/test-package.mjs /absolute/path/to/diffractr-<version>.tgz
```

This leaves the supplied tarball in place. `npm run test:package` remains the convenience command that builds and tests a temporary tarball. The smoke test verifies the installed package version against the checkout, CLI execution, self-contained skill installation, capture, validation, and authenticated viewer serving.
