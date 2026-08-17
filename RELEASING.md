# Releasing an Alpha

Alpha releases are published from `main` by the manually triggered
[OIDC release workflow](.github/workflows/release.yml). The npm package must
already have an npm Trusted Publisher configured for this repository, workflow
file, and the `npm-release` environment. The workflow uses no long-lived npm
token and does not promote the `latest` dist-tag.

## Before triggering the workflow

1. Prepare and review the version change together: update `package.json`,
   `README.md`, `docs/README.zh.md`, and `README.i18n.yaml` as needed. Keep the
   English and Chinese release information synchronized; do not update only one
   README. Update this runbook too when the release procedure changes.
2. Before merging, run `pnpm run check` (including its build and package
   checks), then review `npm pack --dry-run`. The packed files must include the
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

The workflow installs with the frozen lockfile, runs `pnpm run check` before
publishing, publishes with `npm publish --tag alpha --provenance` through npm
Trusted Publishing, retries the npm version and `alpha` dist-tag readback, and
creates the matching GitHub prerelease. It intentionally does not run
`npm dist-tag add` because npm Trusted Publishing does not support that command.

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
