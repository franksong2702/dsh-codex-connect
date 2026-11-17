# Releasing an Alpha

Alpha releases are published from `main` by the manually triggered
[OIDC release workflow](.github/workflows/release.yml). The npm package must
already have an npm Trusted Publisher configured for this repository, workflow
file, and the `npm-release` environment. The workflow uses no long-lived npm
token and does not promote the `latest` dist-tag.

Numbering, compatibility evidence, and channel policy are defined in
[VERSIONING.md](VERSIONING.md). The approved independent numbering migration
starts at `0.2.0-alpha.1`; later releases use `0.2.0-alpha.N`. It preserves the
four declared DSH targets, Alpha-only gates, and separate `latest` policy.
It is not a Beta/stable promotion or a requirement to upgrade DSH.

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

`latest` follows the newest published plugin release verified against DSH's npm
`latest`, under [the channel policy](VERSIONING.md#channels-and-recommendations).
An Alpha remains an Alpha when selected as the default. This procedure changes
only a dist-tag on an existing package; it does not publish a package, change a
Git tag, upgrade a daily Host or certify real-account acceptance. A documentation
PR or a successful release workflow does not authorize this operation.

Before requesting approval for a concrete promotion:

1. Read `npm view @deepseek-ai/dsh dist-tags.latest` and
   `npm view dsh-codex-connect dist-tags --json` from the public registry.
   Record the exact DSH version, previous plugin `latest` and unchanged `alpha`
   value for readback and possible rollback. Do not use the catalog's dated
   `latestDshVersion` as a substitute for the current registry value.
2. Select the highest-precedence published plugin version whose exact DSH pair
   is recorded in `verified-compatibility.json`. Verify its npm package identity
   and integrity against the original release artifact and matching Git
   tag/release. A local build, unpublished candidate or green CI on another
   commit is not that artifact.
3. Install that exact public package into a disposable profile of the exact DSH
   version from step 1, using its stock CLI and normal requirements checks.
   Verify plugin loading and the applicable keyless runtime checks. Preserve
   account/device acceptance limits; do not use daily profiles or real accounts.
   If no published pair qualifies or installation fails, stop and record the
   default-install gap instead of changing support declarations to pass it.
4. Obtain explicit authorization for the exact target version and the recorded
   rollback target. Immediately before writing, re-read both channels and DSH
   `latest`. If they changed, stop and reassess the candidate and approval rather
   than overwrite another maintainer's change.

The authorized maintainer then performs the promotion separately and
interactively. Do not save or paste the OAuth URL or token into logs, issues,
commits, or notes. Always log out after the attempt, including a failed readback.

```sh
npm login --auth-type=web
npm dist-tag add dsh-codex-connect@<version> latest
npm view dsh-codex-connect dist-tags.latest
npm logout
```

The readback must equal `<version>`, and `alpha` must retain its recorded value.
In a fresh disposable profile of the same exact DSH version, install
`dsh-codex-connect@latest` using the stock CLI and normal requirements checks;
confirm it resolves to `<version>` and loads. Record the old/new channel values,
exact host/package identities and install result. Only then update current
installation guidance through a PR. Do not rewrite historical release records
or republish an immutable package to refresh its README. An isolated pass does
not close a reporter's separate Desktop/account acceptance.

If readback or default installation fails, do not report promotion complete or
blindly repeat the write. Check the current tag first. If it still points to the
candidate and rollback was authorized, restore only the recorded previous
`latest` with `npm dist-tag add dsh-codex-connect@<previous-version> latest`, then
read it back and confirm `alpha` is unchanged. Stop if another maintainer moved
the tag. Restoring an older incompatible default is a rollback, not a fix for
the installation gap; keep that gap open and give the verified exact-version
command. If rollback was not authorized, report the failure and request that
specific action. Never delete or republish either package.

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
