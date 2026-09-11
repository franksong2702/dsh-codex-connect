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
   `pnpm run test:browser`, and `pnpm run check:dsh-matrix`, then review
   `npm pack --dry-run`. `check` includes build and package checks, but not the
   browser or isolated-install suites. The matrix checks every exact declared DSH target and requires identical packed artifact hashes; it does not replace account acceptance. Regenerate the lockfile only for dependency
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

## npm readback diagnostics

The post-publish check now uses `scripts/verify-npm-readback.mjs`: at most 12
attempts, ten seconds apart, with parallel bounded version/tag queries to the
explicit public registry and `--prefer-online`. Each query has a 12-second npm
fetch timeout, no internal retries, and a 20-second process deadline. Output
records only exit codes, allowlisted error codes, valid version strings, and
whether the exact version/alpha pair matched. It never prints raw responses,
local paths, authorization URLs, or credentials. A mismatch, invalid JSON, and
query failure remain different observations; none by itself proves propagation
delay. `--prefer-online` requests fresher metadata but cannot guarantee immediate
registry visibility. See the [npm configuration reference](https://docs.npmjs.com/cli/v11/using-npm/config/).

## If npm published but GitHub release creation failed

**Do not rerun npm publication.** Use the original release run ID, not the latest
main commit. First run read-only verification from trusted current main code:

```sh
node scripts/recover-release.mjs --version <exact-alpha-version> --run-id <original-release-run-id>
```

The helper requires the original repository/main/workflow identity, successful
verification and authorized publish steps, successful exact-SHA main CI, and a
non-expired verified artifact from that run. It downloads data only, never runs
the old package, and requires npm metadata, SHA-512 integrity, SHA-1, manifest
identity, and exact archive bytes to match the original artifact. The original
SHA must remain on main. Existing tags must resolve to that SHA; conflicting
or draft/non-prerelease releases stop recovery. Missing or expired evidence
also stops recovery; rebuilding current main is not a substitute.

To complete a missing prerelease, manually dispatch **Recover published alpha
release** on main with the same version, original run ID, and `RECOVER`.
The existing `npm-release` environment approval and shared release concurrency
apply. This workflow has no OIDC/npm publication permission or package-install
step. Alternatively, an authorized maintainer can apply the verified result:

```sh
CONFIRM=RECOVER node scripts/recover-release.mjs --version <exact-alpha-version> --run-id <original-release-run-id> --apply
```

Apply only creates missing tag/release records and checks their final identity.
It never moves an existing tag, promotes npm or GitHub latest, or republishes npm.
An already-complete matching release is a no-op, including on retry. If tag
creation succeeds but release creation fails, inspect and rerun this recovery
helper rather than deleting or moving the tag. A later alpha channel does not
block recovery of the exact historical package and is never rolled back.

The original failed workflow remains historical evidence, not a success claim.
Record the recovery verification/run alongside it. Do not copy temporary signed
artifact-download URLs or authentication material into reports. Artifact API
semantics: [GitHub Actions artifacts](https://docs.github.com/en/rest/actions/artifacts).
