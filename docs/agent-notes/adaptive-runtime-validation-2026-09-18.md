# September 18 pre-split delivery evidence

## Historical record, not current-head CI

This document preserves the earlier combined local investigation, before the compatibility and Astra/Remember deliveries were split into independent PRs. Statements below about unknown causes, blocked investigation and unpushed code describe that original checkpoint, not the latest project state. Later #211 cause, repair and upstream-submission evidence is tracked in [PR #212](https://github.com/franksong2702/dsh-codex-connect/pull/212). Use [the current checkpoint](adaptive-runtime-status.md) for scope and each PR's exact-head Checks for fresh CI. The real Remember restart probe remains unaccepted and is not retried by this delivery.

## Identity

Repository baseline: `eae9430f16f1707d8cefb76dec6e8344871d7684`.
Local branch: `franksong2702/astra-goals-1-3-20260918`.
WebCodex project: `agent:mac-webcodex-trial:dsh-codex-connect-f53ce775-42955146`.
Workflow session: `wc_sess_cGTpW5Z54AMlbcBs`.
Runtime: Node `v22.22.3`, pnpm `10.30.3`; frozen-lockfile installation reused the existing package cache.

## Delivered scope

1. Doctor JSON framing diagnostics now distinguish empty, multiline and invalid JSON with byte/line counts, without raw-output/parser excerpts. Strict parsing, candidate classification, support metadata and privacy checks are retained. This improves investigation evidence; #211's upstream root cause is not fixed or claimed verified.
2. A short contributor router and explicit development/product context audit were added. The only shipped-source change scopes denial guidance to the denied action/dependents while retaining no-bypass, exact-action approval, higher-priority restrictions and the existing breaker.
3. The bounded durable probe checks actual direct package versions in parent and children before credentials/dispatch, reports those versions, and rejects unverified combinations. Current-state and finite Remember acceptance documentation replace stale entry-point descriptions without deleting historical evidence.

## Executed validation

| Check | Actual result |
| --- | --- |
| New denial/durable evidence regression, before implementation | Two expected failures; nine existing tests passed. |
| Doctor contract, before implementation | Three new content-free diagnostic assertions failed out of 67. |
| Focused denial/durable/runtime validation after implementation | Three files, 19 tests passed. |
| Doctor contract after implementation | 67/67 assertions passed, plus the existing 11 synthetic child-routing scenarios. These are checker fixtures, not upstream host installations. |
| First full check | Failed at TypeScript because the new `.mjs` helper lacked a declaration. A `.d.mts` declaration was added; no test was disabled. |
| Final runtime-source `pnpm run check` | Exit 0, **94 test files / 897 tests**; workflow contracts, metadata/source lint, host/client typecheck, build, import/CLI checks, declared development-host compatibility and package checks passed. Job `wc_job_RcZsJFijHuBe9Tjl`. |
| Generated runtime inspection | All nine generated files matched the baseline exactly after substituting only the reviewed notice and shared-chunk filename references. No unrelated runtime/client changes. |

The full check includes real DSH JSONL write and distinct-process restore with synthetic provider responses, native-rejection/fallback blocking, automatic and in-process fork/tool regressions. Only the dedicated subprocess fixture is a process-restart proof. The full check's package validation covered 70 files before this documentation-only evidence file was added; final package/link/whitespace checks are performed at closeout. No claim is made of a fresh four-host/Node matrix, Chromium run or remote CI for this local source.

## GitHub synchronization actually completed

Current dated checkpoints were prepended to #195, #167, #199, #200, #196 and #65; each API response was read back and matched the intended body. Original bodies were preserved, all issues/PRs stayed open, and draft states/base branches were not changed. #211 received [the diagnostic follow-up](https://github.com/franksong2702/dsh-codex-connect/issues/211#issuecomment-5727447681); it remains unresolved.

A transient GitHub read failed with a connection reset; the subsequent read succeeded before updates. No uncertain mutation was blindly repeated.

## Unfinished and excluded

#211 still lacks actual alpha.2 doctor-output framing evidence. Inspection of the upstream DSH release package was blocked by the platform, stopped, and not retried through another execution route. The prior real Remember durable probe also remains blocked/unaccepted and was not retried. These are different blocked operations; neither establishes an account problem or a confirmed core runtime defect.

New real provider dispatches: **0**. No real credentials were accessed or changed. No user service, default capability, supported-version declaration, main branch, release or installed plugin was changed. Code remains on the local branch, not pushed or deployed by this follow-up. Live restart acceptance and measurable Astra/long-task benefits remain unproven.
