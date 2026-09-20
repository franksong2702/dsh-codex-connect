# Alpha 4.38 readiness — issue #219

Date: 2026-09-20. Candidate: 0.1.0-alpha.4.38. Base: e5772cd8a5c47f30b5ab14fe73d2901914348463.

## Scope and review

This is a client diagnostics and quota-traffic release. It does not establish that OpenAI blocked the reporter's account/session, or that the persistent upstream failure has been reproduced or resolved. #219 must not auto-close on merge/publication.

A source-level author review covered the full PR diff, HTTP/SSE cancellation and hook preservation, bounded diagnostic fields, cross-request isolation, per-credential quota state, concurrent refresh and expiration, backend retry hints, hidden-page scheduling, and unchanged optional-feature defaults. Review found two regressions in the initial fix: an old expiry timer cancelling a replacement request (fixed by 0bc83ee), and attribution of unread later error frames after malformed/oversized/terminal frames (fixed in this candidate). Negative controls reproduced both before their fixes. No additional blocking source findings remain in this review.

This is NOT an independent delegated review or a GitHub approving review. The delegated review operation returned HTTP 403; no alternate execution path was used to bypass that denial. The repository requires PR/status checks and resolved review threads, with zero mandatory approving reviewers. Preserve that distinction when reporting review status.

## Evidence

- Frozen dependency install: passed; no lockfile refresh or dependency-version changes.
- Focused regression suite: 4 files, 83 tests passed.
- Complete pnpm check: passed after updating the expected CLI version label.
- Chromium browser UI regression: 8 files, 32 tests passed after installing the pinned test browser.
- Package dry-run: 89 files; both README languages present; no root localized README, credential file, node_modules or git directory.
- Declared four-host installation matrix: passed on Node 22.22.3 for DSH 0.1.2-rc.1, 0.1.5-alpha.1, 0.1.5-rc.1 and 0.1.5-rc.2. All verified identical archive SHA-256 478f66f7af7cdf82f25434d7068df55525169c55c760b289298585df5ae204e0 with defaults unchanged and zero real provider calls.
- GitHub exact-head CI and main release CI: pending.
- npm / alpha dist-tag / GitHub tag / release: not published.

## Release boundaries

Keep the documented installation recommendation on the confirmed 4.37 pair until 4.38 is actually published. Keep alpha separate from latest. Use the existing OIDC release workflow and exact-main-SHA CI gate, never local npm credentials. Do not modify daily DSH services or perform live-account model requests.

The reporter's Windows/DSH 0.1.6-alpha.1 persistent-session condition remains a separate acceptance boundary; a synthetic install matrix or an empty GitHub review list cannot prove recovery.
