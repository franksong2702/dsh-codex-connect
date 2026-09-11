# Alpha 4.35 Luna Reserve release readiness

## Scope and identity

The candidate version is `0.1.0-alpha.4.35`; this file records release evidence and does not itself prove publication. The candidate is based on `main` after PR #184 merged as `dc7440cdd39cbcd13f7e1f5538b5379937f8183d`.

Alpha 4.35 adds the default-off, backend-authorized Luna Reserve fallback from #184. Reserve remains hidden from model discovery, does not change profile defaults, and never treats a generic rate-limit response as authorization. The feature requires identity-matched backend authorization, stores only a pseudonymous account/user binding for its private return target, and restores the prior request configuration only after affirmative ordinary-usage recovery.

The candidate also includes the maintenance work already merged in #190 and #191: exact multi-version DSH canary classification, improved npm publication readback, and a fail-closed GitHub-release recovery path that never republishes npm content. The declared DSH support set remains `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2`; no host upgrade is part of this release.

## Evidence inherited from the reviewed Reserve merge

PR #184 was reviewed at head `9be08a4ac2f9a95cd724c9e4f56aaaaee451436e`. Its merge commit has the same tree as that reviewed head. The PR and post-merge main runs established:

- PR CI run `34563377793`: Node `22.19.0` and `24.20.0` each passed 839 tests, browser regression passed 28 tests, Windows canary contracts passed, and the full four-host packed-artifact matrix passed on both Node versions.
- Both Node matrices verified the same packed candidate bytes within their runner environment and reported `reserveTransitionsVerified: true`, with all optional capabilities still defaulting to false.
- CodeQL analysis passed after the two `js/insufficient-password-hash` findings were reviewed and dismissed as false positives: the SHA-256 value is a pseudonymous identifier binding derived from account/user ids, not a password verifier or bearer-token hash. No CodeQL rule was disabled.
- Post-merge main CI run `34564239813` and CodeQL run `34564239845` completed successfully on merge commit `dc7440cdd39cbcd13f7e1f5538b5379937f8183d`.

The integration review also corrected two Reserve authority races before merge: refreshed/evicted quota snapshots now revoke older undispatched permits, and asynchronous return-target recovery rechecks authority after I/O so account/settings changes cannot apply stale routing state. The exact DSH fixture was strengthened so peer-only DSH packages cannot silently float to a newer host version during matrix validation.

## Candidate gates before publication

Before publication, this exact `0.1.0-alpha.4.35` candidate must pass the normal release gates from `RELEASING.md`: frozen install, `pnpm run check`, Chromium browser regression, the four exact DSH installation matrices, package inspection, PR CI, and successful main CI after merge. The verified-compatibility entry for 4.35 is valid only if those exact-host checks pass for the candidate bytes.

Local candidate validation on 2026-09-11 passed the pre-PR gates on macOS arm64 with Node `v22.22.3`:

- `pnpm install --frozen-lockfile`: success with no lockfile change.
- `pnpm run check`: 89 test files / 840 tests passed, together with lint, typechecks, build, release/canary contracts, capability CLI, compatibility metadata, and package checks.
- `pnpm run test:browser`: 8 files / 28 Chromium tests passed.
- `pnpm run check:dsh-matrix`: exact DSH `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` all passed against one packed artifact SHA-256 `6ff25d237404f8bf2f661b5be729245e26303af64e7521ce2fc876dafae9f8f7`. Every report kept all optional capabilities disabled, resolved/prepared all eight models, verified provider disposal, and reported `reserveTransitionsVerified: true`.
- `npm pack --dry-run` reported 63 files for `dsh-codex-connect@0.1.0-alpha.4.35`, size 1,194,557 bytes and unpacked size 1,855,697 bytes.

These local results do not replace PR CI or the exact final-main CI required by the publishing workflow. Runner-specific archive bytes must be assessed from their own reports rather than assumed to equal the local archive byte-for-byte.

Keep the public installation recommendation on published Alpha 4.34 until 4.35 exists on npm and has a matching GitHub prerelease. Publishing must use the repository's OIDC `Publish alpha release` workflow. Do not promote `latest` as part of this release; `alpha` and `latest` are separate maintainer decisions.

## Known limits

Reserve is experimental and remains disabled by default. Automated coverage uses synthetic quota responses and verifies routing, restoration, account isolation, cancellation, disabled-state behavior, quota exhaustion, context-window selection, and four-host installation behavior. It does **not** prove that a real account is currently eligible for Luna Reserve or that a live account can enter and later leave Reserve under production quota conditions. No test should deliberately exhaust a user's quota to manufacture eligibility.

The Reserve route uses Luna's documented 272,000-token catalog window. Automatic/manual compaction through Reserve is not authorized by this implementation, and no exact cross-host long-context preflight is claimed. Full Windows application acceptance and live Reserve transition acceptance remain separate from the release gate.

After publication, independently verify npm version and `alpha` dist-tag, unchanged `latest`, matching Git tag/prerelease, package integrity, and an isolated exact-version installation. Only then update README.md, docs/README.zh.md, INSTALL.md, and README.i18n.yaml to recommend 4.35 and update #177 with the published scope.

## Publication and independent readback — 2026-09-11

Release preparation [PR #192](https://github.com/franksong2702/dsh-codex-connect/pull/192) merged as `1776eb4bd582ae200af2cc0758677a250acb092b`. [PR CI 34565552714](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34565552714) and [release-commit main CI 34565789448](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34565789448) each passed 840 tests on Node 22.19.0 and 24.20.0, 28 Chromium tests, Windows canary contracts, and all four exact-host installation/Reserve combinations on both Node jobs. [Main CodeQL 34565789141](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34565789141) also passed.

[Publish alpha release 34566085197](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34566085197) completed successfully through the existing protected npm Trusted Publishing workflow. Verification, publication, npm readback, and GitHub prerelease creation all succeeded; no recovery mutation or second npm publication was needed. The [GitHub prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.35) was created at `2026-09-11T05:32:58Z`, and `v0.1.0-alpha.4.35` resolves to the original release commit above.

The new readback diagnostics recorded E404 for the exact version and the old alpha tag on attempts 1–9. Attempt 10 observed both the new version and `alpha=0.1.0-alpha.4.35`; `latest` remained `0.1.0-alpha.4.34`. This establishes what the runner observed, not the precise cache or registry-propagation root cause.

Read-only `recover-release.mjs --version 0.1.0-alpha.4.35 --run-id 34566085197` independently returned `already-complete`. It verified original release/CI provenance, npm integrity, and exact equality with the release workflow artifact. The npm archive SHA-256 is `785d6a40323ab0763fc9c4e86f5686dba15e1e6e03f128b781ababb5b1d521cc`, also matching every release-commit CI matrix report. The helper did not republish npm, promote a dist-tag, or modify the existing release.

## Published-package installation and upgrade acceptance

An independent macOS arm64 run on Node `v22.22.3` completed at `2026-09-11T05:42:53.262Z`. It downloaded the exact published npm archive, verified the release hash, and installed `dsh-codex-connect@0.1.0-alpha.4.35` through the normal DSH plugin command in four separate temporary homes. No local source build was substituted for the published plugin. [Structured reports](validation/alpha-435-published-install-reports.json) record each result.

| Exact DSH runtime | DSH packages pinned and checked | pi-ai | Installed files identical | Additional check |
|---|---:|---|---:|---|
| `0.1.2-rc.1` | 214 | `0.84.4` | 63 | Fresh install |
| `0.1.5-alpha.1` | 229 | `0.85.1` | 63 | Fresh install |
| `0.1.5-rc.1` | 231 | `0.85.1` | 63 | Fresh install |
| `0.1.5-rc.2` | 231 | `0.85.1` | 63 | Published 4.34 → 4.35 in the same profile |

For each host, the CLI and actual model-runtime versions were checked rather than inferred from each other. All 63 installed plugin files matched the published archive byte-for-byte. Doctor reported compatible dependencies and absent credentials; all eight advertised models resolved and prepared; default model/search routing stayed unchanged; all six optional capability flags remained false; provider disposal and the installed synthetic Reserve lifecycle checks passed.

The rc.2 upgrade first installed published 4.34 and verified its version/doctor, then used the same profile for the exact 4.35 command. The verifier reused `exact-dsh-fixture.mjs`, `validateDoctorResult`, and `check-installed-runtime.mjs`/`check-installed-reserve.mjs`; only the plugin source changed from a locally packed candidate to the exact registry package. Profile dumps were compared for unchanged defaults, and every installed plugin file was compared with the verified npm tarball. No live model requests were made, no production credentials were accessed, and all temporary fixtures were removed.

The verified exact installation/upgrade command is:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.35
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

Replace `web` with the existing profile. This evidence does not authorize changing an existing DSH host or starting OAuth. Real-account Reserve entry/recovery, full native-session recovery, live search/image behavior, and full Windows application acceptance remain unverified by this run. #177 stays open for bounded real eligible-account acceptance; ordinary quota must not be deliberately exhausted for testing.

Post-publication documentation now recommends the exact published 4.35 pairing while explicitly retaining `latest=4.34`. The immutable npm package may still contain the pre-publication README recommendation and unreleased wording; this documentation update does not republish or overwrite it. Historical release records and the separate #167 work are unchanged.
