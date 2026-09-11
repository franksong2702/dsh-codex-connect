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
