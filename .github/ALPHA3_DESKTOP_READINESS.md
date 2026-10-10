# Alpha 3 Desktop compatibility

## Scope

`0.2.0-alpha.3` carries the official DSH Desktop OAuth browser-launch adaptation. It recognizes only the `dsh-app://app` document, waits for a validated HTTPS challenge and asks Electron to open that link externally. Web retains its user-gesture blank-popup flow. Desktop account-request rejection shows restart/version diagnostics instead of a Web `trust-origin` command.

No HTTP origin trust, host dependency range, default model, account storage or experimental default changes are included. The separate unsupported DSH `0.2.1-alpha.2` Canary candidate is outside this release. The earlier session's upstream HTTP 503 transport failures are not claimed to be fixed by the Desktop adaptation.

## Desktop acceptance

On 2026-10-10 the maintainer reported successful login and normal use on DSH Desktop `0.2.0-rc.2`. The tested local archive was built from main `f2a4616b2afdda0c68688c865b5c4f5b27b880e8` plus this adaptation, before the release version bump. Its package version was still `0.2.0-alpha.2`; it is not the immutable public npm Alpha 2 package.

- Local archive SHA-256: `9ac6fd1ea1def6bfaa6440c4727e5ea3587c2c9f3fd1c2cb9bb4377dcf001d41`.
- Client bundle SHA-256: `f8dba1cb2cd3b21fababbb3545c73ae0dd77b83f8583d50725ba5184dd4ccfb4`.
- Prior isolated Desktop Host check: eight checks passed, including activation, signed-out account status, model catalog, foreign-origin rejection, cancellation and clean shutdown. No real account or model was used by that check.

The maintainer's report is real-user acceptance of the identified local build, not independent live-account acceptance of the eventual npm artifact. Image generation/editing, full Windows/mobile application acceptance and long-running network reliability are not established by it. The working Desktop installation and services on 3080/3081 are not upgraded by this release.

## Release gates

The candidate passed frozen dependency installation, `pnpm run check`, `pnpm run test:browser`, the five declared-host same-artifact installation matrix and package-content review before merge. [PR #317](https://github.com/franksong2702/dsh-codex-connect/pull/317) remained a draft until the local matrix and remote CI passed, then merged as `174811c27ae151536f671069a0087be71bb72891`. Publication writes only `alpha`; `latest` promotion is excluded.

Verified locally on Node `24.18.1`, pnpm `10.30.3` and npm `11.6.4` in an isolated, credential-free environment:

- `pnpm --config.minimum-release-age=0 install --frozen-lockfile --ignore-scripts`: exit 0; no lockfile changes.
- `pnpm run check`: exit 0; 136 files / 1,610 tests, lint, typecheck, generated builds, compatibility and built CLI checks passed. Package review validated 150 files with no forbidden contents.
- `pnpm run test:browser`: exit 0; 12 files / 58 Chromium tests passed.
- `pnpm --silent run check:dsh-matrix`: exit 0; all five exact hosts passed against identical archive bytes, SHA-256 `05b873f251802ff794facd9ccab0b3f22289f13625bcc4379fbd87aece40f903`. All 11 advertised models prepared, defaults were unchanged, disposal passed and real provider requests were zero.
- `npm pack --dry-run --json --ignore-scripts`: exit 0; 150 files, both READMEs and no forbidden contents.
- The rebuilt client differs from the maintainer-tested client only by `0.2.0-alpha.2` to `0.2.0-alpha.3`. Candidate client SHA-256: `569085996e6c5969fc1be631d41cfaf53aee23fddddc520a0882f3b42d0045d1`.

The first full check identified the expected CLI snapshot's old version number; that single version line was synchronized and the complete check then passed. The first matrix attempt stalled during registry downloads and was interrupted; its bounded lower-concurrency retry passed. No behavioral assertion, peer check or project dependency was weakened. These local results alone are not publication evidence.

## Confirmed publication

[Exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/38035495747), attempt 1, completed all six jobs successfully for the merged commit. The [protected release run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/38036148904) succeeded after normal `npm-release` environment approval; the downloaded pre-publication artifact already matched the local five-host matrix.

Independent `node scripts/recover-release.mjs --version 0.2.0-alpha.3 --run-id 38036148904` exited 0 with `already-complete`. It verified original run/artifact identity, exact-main CI, package identity, npm SHA-512 and SHA-1, public archive equality, and the exact tag/prerelease commit. The final archive digest also equals the five-host matrix digest above. No recovery writes or duplicate npm publication occurred. GitHub release ID: `408791774`; [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.2.0-alpha.3).

Separate public registry readback confirmed `alpha=0.2.0-alpha.3` and `latest=0.2.0-alpha.1`. The public artifact was not installed over the working local Desktop adaptation, and services on 3080/3081 were not upgraded or restarted. User-reported local Desktop acceptance and remaining acceptance limits stay as described above.

The [initial documentation-closeout CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/38037242408) rejected eight obsolete Alpha 2 guidance/catalog expectations. A focused local reproduction matched those failures. After synchronizing the exact version and catalog fixtures, both affected suites passed all 19 tests, including a new check of Desktop's bundled CLI, separate profile, exit/reopen guidance and preserved settings. No compatibility, unknown-host, blind-install or origin-trust assertion was removed; the published runtime and artifact remain unchanged.
