# Releasing an Alpha

Alpha releases are published from `main` by the manually triggered
[OIDC release workflow](.github/workflows/release.yml). The npm package must
already have an npm Trusted Publisher configured for this repository, workflow
file, and the `npm-release` environment. The workflow uses no long-lived npm
token and does not promote the `latest` dist-tag.

Numbering, compatibility evidence, and channel policy are defined in
[VERSIONING.md](VERSIONING.md). The current Alpha series continues unchanged;
this runbook does not authorize a numbering or phase migration.

## Before triggering the workflow

1. Prepare and review the candidate version in `package.json` and its generated
   output. Record a new exact compatibility pair only after its installation
   checks pass. Keep public installation recommendations on an already published
   pair until the new version is available; a candidate record is not publication
   evidence. Update this runbook when the release procedure changes.
2. Before merging, run `pnpm install --frozen-lockfile`, `pnpm run check`,
   `pnpm run test:browser`, and `pnpm run check:dsh-install`, then review
   `npm pack --dry-run`. `check` includes build and package checks, but not the
   browser or isolated-install suites. Regenerate the lockfile only for dependency
   changes. The packed files must include the
   root `README.md` and Chinese document under `docs/`, with no localized README
   beside the root README.
3. Merge the intended package version into `main` and start with a clean tree.
   The version must be a strict `MAJOR.MINOR.PATCH-alpha.NUMBER...` semver and
   must exactly match `package.json`.
4. Confirm that the matching npm version, Git tag `v<version>`, and GitHub
   release do not already exist. Published npm versions are immutable.
5. In the repository's **Actions** tab, run **Publish alpha release** on the
   `main` branch. Enter the exact package version and type `PUBLISH` in the
   confirmation field.

The workflow requires completed successful main CI for the exact release SHA, including both Node versions, browser UI regression and the Windows contract. Missing, incomplete, skipped or failed jobs block publishing. A read-only job installs the frozen dependencies, runs `pnpm run check`, and uploads a SHA-256-identified tarball. The `npm-release` job rechecks CI after environment approval, verifies the tarball digest, and publishes that artifact with lifecycle scripts disabled. Only this job has contents-write and OIDC permissions; it does not install project dependencies or run tests. It retries the npm version and `alpha` dist-tag readback and creates the matching GitHub prerelease. It intentionally does not run
`npm dist-tag add` because npm Trusted Publishing does not support that command.

## After publication

Independently confirm the npm version, `alpha` dist-tag, Git tag commit, and
GitHub prerelease. Then update the repository's public recommendation in
`README.md`, `docs/README.zh.md`, `INSTALL.md`, and `README.i18n.yaml` together
through the normal PR process. Do not republish the same version to refresh its
README: a package prepared before publication may retain the previous confirmed
recommendation. Record the new exact installation command in its release notes.
Recommendation generation and automatic post-publish documentation updates are
not implemented by this procedure.

## Promoting `latest` (short-lived interactive authentication)

When a maintainer intentionally wants the verified alpha to be the default
install before a stable release exists, perform this promotion separately and
interactively. Do not save or paste the OAuth URL or token into logs, issues,
commits, or notes.

```sh
npm login --auth-type=web
npm dist-tag add dsh-codex-connect@<version> latest
npm view dsh-codex-connect dist-tags.latest
npm logout
```

The readback must equal `<version>`. After the first stable release,
`latest` must point only to stable releases.

## If npm published but GitHub release creation failed

Do not publish the npm version again. After confirming the npm readback, create
the missing prerelease from the same commit with GitHub CLI:

```sh
gh release create "v<version>" --repo franksong2702/dsh-codex-connect \
  --prerelease --target <commit-sha> --generate-notes
```

Use a short-lived `gh` authentication session as required by your local
environment; never record its OAuth URL or token. If the target Git tag already
exists, the command attaches the release to that tag; otherwise, stop and
investigate the commit/tag mismatch before retrying.
