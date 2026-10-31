# Alpha 11 final release acceptance — 2026-10-31

This record supersedes the October 28 joint 13-Host archive for release acceptance. That earlier evidence is preserved as historical only. Final input includes Terra, unified speed selection, exact rc.4/rc.5, seeded-fork originals, bounded bili native preflight and the direct Undici `^8.12.3` floor/lock. It excludes experimental Computer Use #402 and stock alpha.2 Reserve support.

A new isolated worktree was created from dependency PR #393 at `2bda81debe0dbd4834433d46cc37d55de72eb03f`, based on main `3614a303cf12ed5adb5ce82c146f99841c9c1440`. It does not inspect or reuse the old pending #393 workspace/process check. No real account, model, GUI or daily profile is used.

The final source starts at `0a4c9eb77b88b0def6f5f4ef6be340f9a4c2e76e` plus the reviewed Alpha 11 release-note update. Local acceptance uses macOS arm64, Node `24.13.0`, npm `11.6.2` and pnpm `10.30.3`, isolated installation homes and empty npm configuration. The protected publication workflow independently uses its pinned Node/npm versions.

Completed on 2026-10-31:

- Frozen dependency installation succeeded; the direct installed Undici is `8.12.3`.
- `pnpm check` succeeded: 2,445 tests passed, two skipped; lint, type checks, generated build and package checks passed. The package inventory contained 72 files.
- `pnpm test:browser` succeeded: 97 tests across 14 files in isolated Chromium.
- Independent dependency and release-note reviews found no blocking issue. These reviews do not replace exact-head CI or package validation.

The new fourteen-Host `pnpm --silent run check:dsh-matrix` completed successfully. Its [complete report](alpha11-final-matrix.json) validates all fourteen versions against the **same** SHA-256 `535772fb35ebcc735523416561966d068b9f022ec3e0c96d11cc69dbbeb6008d`. Each exact published Host was installed in an isolated profile, with startup/doctor, unchanged defaults, disposal, Reserve transitions, generated/edited and inherited original images, native compaction lifecycle, bounded preflight and retry/cancellation contracts. Provider traffic and image bytes are synthetic; this is not account or desktop acceptance.

The [package proof](alpha11-final-package.json) records every packed file hash and the frozen release-note hash. Retained archives packed with local npm `11.6.2` and the workflow's npm `11.6.4` are byte-identical to the matrix artifact: 72 files, 1,476,318 archive bytes, SHA-1 `4c20268c3b578d828a92ca8b72027865883da7ab`. Every regular archive entry was compared with the final source file; internal notes/experiments/reviews remain excluded. This excluded evidence and package-proof update does not enter the npm archive. No prior archive is substituted.

The dependency prerequisite #393 passed all ten exact-head checks, including CodeQL with no new alerts and zero annotations ([CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/41178300601)). It was squash merged at `97309c2d120c8638f8e8e3ae1986f5fead6e92cb`; that source tree exactly equals the pre-release-note input tree above. Final release-note/evidence integration, precise final-main CI and workflow-artifact readback remain required. Before approving the protected publish environment, compare its uploaded archive with the matrix digest; equal source alone is not a substitute for equal archive bytes.

Publication uses the existing protected OIDC alpha workflow only after the exact main SHA has passed required CI. `latest` remains Alpha 10. Record npm version/tag/archive integrity and GitHub prerelease readback separately. No release availability or real-account/Desktop acceptance is established by source tests.

## Published-archive readback

Final source `c670d67c36be037c796123536cfcfa9803484244` has the same tree as the reviewed candidate. [Final main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/41181683130) and [original protected publication](https://github.com/franksong2702/dsh-codex-connect/actions/runs/41182902900) both completed successfully. The actual uploaded workflow archive was downloaded and compared with the matrix package **before** approving the protected `npm-release` environment; it matched byte-for-byte. Public npm version/alpha are Alpha 11; latest remains Alpha 10. The exact tag and non-draft prerelease resolve to this source.

Independent public download matches original workflow/matrix bytes and registry SHA-512/SHA-1: SHA-256 `535772fb35ebcc735523416561966d068b9f022ec3e0c96d11cc69dbbeb6008d`, 72 files, 1,476,318 bytes. npm metadata omits gitHead. The [published-entry smoke](alpha11-published-entry.json) used the normal exact registry installation on fresh stock rc.5: startup, doctor missing credential metadata, default preservation, all 72 installed file hashes and existing synthetic runtime checks passed. No real provider/model/GUI request or daily profile/service was used.

The immutable source/archive proof is the [record at release commit](https://github.com/franksong2702/dsh-codex-connect/blob/c670d67c36be037c796123536cfcfa9803484244/docs/agent-notes/alpha11-final-package.json). Later recommendation/publication-note edits change repository documentation, not that npm archive; compare its frozen release-note hash with the release commit, not a later main checkout. The October 28 archive remains historical only.
