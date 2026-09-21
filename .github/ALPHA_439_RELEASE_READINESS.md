# Alpha 4.39 readiness — backend request governance

Date: 2026-09-21. Candidate: `0.1.0-alpha.4.39`. Base runtime change: merged PR #227 at `6ce8a37ca7c28640a43b9189b767e4f6212cea7e`.

## Scope and review

This release packages the shared `chatgpt.com/backend-api` request-governance layer merged in #227. It does not claim that #219's persistent upstream condition was caused by client identity, request volume, or account/session risk controls.

The pre-merge review of #227 found and corrected blocking edge cases in response-body lifetime, queue/cooldown admission, managed deadlines, Request cancellation propagation, authenticated redirects, and cleanup after diagnostic hooks fail. The corrected head passed all required GitHub checks before normal merge without administrator bypass.

PR #226 was an earlier overlapping implementation. It is closed as superseded by #227 and must not be merged independently.

## Candidate verification

- Frozen dependency install: passed with the committed lockfile; no dependency or lockfile change.
- Complete `pnpm run check`: 104 test files / 1,037 tests passed, including lint, typecheck, build, release/canary contracts, environment-proxy import, capability CLI, compatibility and package checks.
- Chromium browser regression: 8 files / 32 tests passed.
- Declared four-host DSH installation matrix: passed twice (before and after recording the 4.39 compatibility row) on Node 22.22.3 for DSH 0.1.2-rc.1, 0.1.5-alpha.1, 0.1.5-rc.1 and 0.1.5-rc.2. Every host used identical package SHA-256 `2dff58e6eaf53d18acc14ac8b094a35b34c1cb9c8e54c51677ce8e2d37fb3aca`, preserved defaults, and made zero real provider requests.
- Package dry-run: 91 files, 1,273,824 packed bytes / 2,192,715 unpacked bytes; root English README and `docs/README.zh.md` are present and the release notes include the exact 4.39 install command.
- Exact candidate PR and exact-main CI: pending.
- npm / alpha dist-tag / Git tag / GitHub prerelease: not published.

## Release boundaries

Keep public install recommendations on published Alpha 4.38 until 4.39 is actually available and independently read back. Keep `alpha` separate from `latest`; this release does not authorize `latest` promotion.

Do not modify daily DSH services, use live credentials/models, or turn experimental defaults on. #219 remains open for reporter-side normal-use confirmation; compatibility trackers keep their existing acceptance boundaries.
