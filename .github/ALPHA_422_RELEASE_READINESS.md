# Alpha 4.22 release readiness

Alpha 4.22 is the Codex Connect release candidate for DSH `0.1.2-alpha.2` and its declared `@earendil-works/pi-ai` range `^0.84.2`; the current registry installation resolves pi-ai `0.84.4`. It combines the DSH client API migration, the optional Models account card, interrupted OAuth recovery, shared settings, and bounded per-model context budgets.

## Previous source-linked evidence

- The candidate is based on the current `main` branch rather than the obsolete stacked PR bases.
- Source-linked DSH registration, disposal, settings, account-state, OAuth recovery, quota, context-budget, browser, build-output, and package-content checks pass.
- The context-budget pressure test reaches the real DSH compaction decision with no network request. It verifies local threshold selection only; it does not establish a service-side context limit or complete a model-generated summary.
- Published Alpha 4.21 remains a historical verified pair in `verified-compatibility.json` and `INSTALL.md`.

## Required registry and runtime evidence

1. Confirm every exact DSH dependency declared in `package.json` resolves from the public npm registry at `0.1.2-alpha.2`.
2. Regenerate `pnpm-lock.yaml` from the public registry with no `link:`, workspace override, tarball, or GitHub dependency, then prove a clean frozen installation.
3. Run `pnpm run check`, the browser suite, and `pnpm run check:dsh-install`; require the Node 22.19, Node 24, browser, Windows, dependency-review, and CodeQL GitHub checks for the exact candidate commit.
4. In an isolated DSH Web profile, verify real ChatGPT authorization and cancellation, model streaming and tool calls, search, `view_image`, GPT Image generation and download, proxy/direct fallback, model visibility, quota, context-budget save/reset, and session restoration. Do not record credentials or authorization URLs.
5. Only after those gates pass, add the exact Alpha 4.22 and DSH `0.1.2-alpha.2` pair to `verified-compatibility.json` and the released-version table in `INSTALL.md`, then rerun the affected checks.
6. Review the final diff and packed artifact, merge with explicit authorization, and perform the GitHub/npm release and dist-tag changes as a separately authorized operation.

## Current status

DSH `0.1.2-alpha.2` was published to the public npm registry on 2026-08-30. The registry-only lockfile, clean frozen installation, 410-test check, 12-test browser suite, 39-file package validation, isolated published-DSH installation with seven-model registration and disposal, and the exact-head Node 22.19, Node 24, browser, Windows, dependency-review, and CodeQL checks passed. On 2026-08-31, the maintainer completed and accepted the isolated Web/OAuth, model and tool, search and image, proxy, quota, context-budget, and session-restoration checks. The verified compatibility record and installation table now include Alpha 4.22; only final diff review, merge, GitHub/npm release, and authorized dist-tag changes remain.
