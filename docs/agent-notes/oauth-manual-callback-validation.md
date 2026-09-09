# Manual OAuth callback validation (#170)

## Scope

Add an opt-in, initially collapsed full callback URL form to both Web account entries and forward it to the pending provider-native manual prompt. Keep the localhost listener, PKCE flow, trusted-origin policy, credential storage and cancellation semantics intact.

## Recorded execution

Environment: Windows, Node.js 24.18.0, pnpm 11.24.0, locked dependencies.

- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm exec vitest run tests/oauth-manual-callback.spec.ts`: exit 0; 4 tests passed, exercising the real provider bridge with synthetic credentials and mocked network/listener boundaries.
- `pnpm run check`: exit 1; workflow contracts, metadata/source lint and both TypeScript projects passed. Vitest reported **707 passed, 7 failed, 1 skipped** across 83 test files.
  - All new non-browser regressions passed: `tests/auth-manual-callback.spec.ts` (65), `tests/account-callback.client.spec.tsx` (17), `tests/oauth-manual-callback.spec.ts` (4).
  - Existing `tests/auth-routes.spec.ts` passed (38), as did the existing account and OAuth cancellation/socket suites.
  - Four failures were in `tests/history-migration.spec.ts`: the implementation explicitly refuses apply-mode migration on Windows, while those cases expect apply behavior. That implementation and those tests were not changed.
  - One failure was the unchanged versioning-policy bilingual hash check against CRLF working-tree bytes.
  - Two failures were the README/reference bilingual hash records. Both records were subsequently refreshed to the reviewed, Git-normalized English/Chinese content. They were not rerun.
  - Build, post-build import/CLI/compatibility and packaging stages were not reached by this command.
- `pnpm run test:browser`: exit 1 before running tests; the required Playwright Chromium executable was absent. Browser download was not completed. The requester then asked to stop automatic testing; no further tests were run.
- `pnpm run build`: exit 0 after the final edits. Generated `lib/` files came exclusively from this command. The `undici-runtime` split-chunk path matcher was made portable to Windows separators so rebuilding retains the existing dispatcher initialization boundary.

Early attempts also encountered sandbox child-process restrictions and Windows checkout line-ending differences. Workflow files and pinned vendor source were restored to their upstream byte representation; neither has a content change in the PR.

## Coverage and limits

The added tests cover invalid/missing/duplicate state, redirect URI validation, one-shot submission, malformed/oversized requests, existing origin checks, timeout/cancellation/disposal, stale retry callbacks, automatic callback fallback, PKCE verifier continuity, transient UI input cleanup, fixed error feedback, and preservation of existing accounts. Browser test source additionally covers the English Models and Chinese Plugins entries, but was not executed.

No real-account OAuth acceptance was performed. Network/token fixtures are synthetic and nonfunctional; no live authorization URL, code, token, account identifier or credential file was used as evidence. This report does **not** claim the complete check or browser suite passed. No further automated tests were run after the request to stop, including after the documentation-record and build-path adjustments.
