# Issue #384 — implementation contract and evidence

## Authority and bounded scope

Baseline: refreshed `main` `1c6b0e7235d238e1bbd0b6c74b807736a5129160` on 2026-10-22. Read `AGENTS.md`, `docs/maintenance-scope.md`, `docs/agent-notes/astra-context-audit.md`, the ownership/account/governor design, existing quota state/authentication and Host tool implementations/tests. `.agents` contains historical notes and no registered skills. Issue #384 requests a default-off callable allowance tool; the maintainer explicitly approved this bounded PR. The current issue and open PR inventory showed no duplicate implementation. Existing workspaces and other Draft PRs remain untouched; development uses a separate clone/branch.

Goal: reuse `OpenAICodexQuotaState` for one opt-in Host tool returning only common-window numbers and freshness, plus concise optional skill guidance. Startup-only profile configuration avoids adding a settings UI, transport API or persistent model budget. This does not reopen the maintenance freeze or change existing user configuration.

Plan and verification surfaces:

1. Add a default-false startup gate and Host tool registration with plugin-owned teardown.
2. Retain successful fetch timestamps in the existing identity-bound cache; project no account/routing/raw objects.
3. Return unknown for failures/missing common windows and stale without percentages for expired/revoked observations. Preserve Host cancellation and shared-read semantics.
4. Add Host runtime unit/integration tests for field minimization, defaults, enabled reads, account/credential isolation, cache/cooldown, malformed/error/missing/stale data and disposal.
5. Document configuration, timestamp units, common-window limitations, safe resource guidance and this bounded admission.
6. Run focused tests and the repository's complete `pnpm run check`, including lint, typecheck, tests, build, compatibility and packaging. Push without force, create a Draft PR, and read exact-head CI through completion.

## Verification record

Local runtime: macOS arm64, Node `v24.13.0`, pnpm `10.30.3`. Commands and outcomes:

| Command | Outcome |
| --- | --- |
| `pnpm --config.minimum-release-age=0 install --frozen-lockfile` | Exit 0; lockfile unchanged. |
| `pnpm exec vitest run tests/quota-tool.spec.ts tests/quota-tool.integration.spec.ts tests/quota-state.spec.ts tests/settings-integration.spec.ts` | Exit 0; 4 files / 57 tests passed. |
| `pnpm run check` (final, with loopback/network access) | Exit 0; lint, both typechecks, 171 files / 2,321 tests passed / 2 existing skipped, build, proxy/isolated import, capability/request-metrics CLI, compatibility and pack checks passed. 70 packed files. Generated `lib/index.js` and `lib/index.d.ts` retained. |
| Local Markdown link check and `git diff --check` | Exit 0; no missing local links or whitespace errors. |

Initial focused run found a test expecting a Host abort code absent from this Host version; the actual fixed aborted error remains an error rather than a quota value. The assertion was corrected without changing cancellation behavior. The first full check exited 1 with 29 failed tests and seven unhandled listener errors: loopback `listen EPERM` restrictions and two stale bilingual hash records. The hashes were refreshed after synchronizing both languages; the same unchanged test/configuration suite then passed with permitted local sockets. No test, timeout, concurrency or security gate was weakened. Raw local logs retain these earlier outcomes outside the public package; they contain machine paths and are not committed.

Exact-head CI and remote commit verification are recorded in the Draft PR and delivery report after push; this local record alone does not claim CI completion or independent approval.

All acceptance here uses synthetic fixtures and mocked upstream responses. No real OAuth account, new permission/credential, live model, daily installation/restart, native Desktop acceptance, release or deployment is part of this implementation. Independent review is a separate gate.
