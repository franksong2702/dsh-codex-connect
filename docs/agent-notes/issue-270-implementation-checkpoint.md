# Issue #270: local integrated editing candidate — 2026-09-25

Repository `franksong2702/dsh-codex-connect`; branch `franksong2702/issue-270-image-edit`. This work continues local transport commit `70668f68fe0460f0b03f373739ae6d20210d5847`, based on main `b1b6efcd93be434bc4b7dd8b9da692803102844e`. It does not restart from remote main or modify the other worktrees. The commit containing this checkpoint is a local, unreleased candidate, not an acceptance/release claim for public Alpha 4.47.

## Implemented beyond the foundation

The existing tool now has explicit edit intent, one target and ordered reference purposes. Session-only selection resolves admitted uploads, complete supported attachment metadata, native generated originals and successful nested image results. Inputs are checked against host limits and fully validated stored images before editing. Missing/foreign inputs, ambiguous preview-to-original mapping, invalid references and missing host policy fail without provider calls. Original access remains bounded to ownership or the actual inherited fork prefix. A model/browser reference is never proof of permission.

Each edit creates a fresh original and preview. V2 metadata and the PTC content envelope preserve canonical input selections and output identity; old v1/preview-only results remain readable. Tests exercise subsequent edits and returning to an earlier result. Legacy previews require explicit selection; an unavailable original is not silently substituted.

The result form selects a concrete image, waits for modification instructions and submits through the existing host conversation API. It does not spend an image request merely when opened. Multi-image results require a choice, retries retain target/reference order, repeating an edit uses its original inputs, and new editing uses the output as a new target. Synchronous local submission guards prevent duplicate clicks; uncertain requests are not automatically replayed. Production components observe the saved feature setting and retain history/downloads when new actions are disabled. English and Chinese disclosure text now explains selected-image transmission.

Contract and usage details: [conversation image editing](../experiments/issue-270-image-edit.md). There is no new API-key route, arbitrary path/URL loader, mask editor, batch editor, model-selection policy or Task activation change.

## Actual local validation

Exact environment: Node `v22.22.3`, pnpm `10.30.3`, installed DSH packages `0.1.7-rc.1`, pi-ai `0.85.1`.

| Command / evidence | Actual result |
| --- | --- |
| `pnpm run check` | Exit 0: 123 files / 1,396 tests; lint, host/client typecheck, build, proxy/isolated imports, capability CLI, compatibility and packaging passed. |
| `pnpm run test:browser` | Exit 0: 13 files / 69 Chromium tests, including 8 new edit workflow cases. |
| Final supplemental `pnpm exec vitest run tests/image-edit-session.spec.ts && pnpm run typecheck` | Exit 0: both real-host/physical-JSONL tests pass with additional assertions that the actual model request contains the upload ID, the generated original ID and the restored original ID. |
| `pnpm run check:dsh-install` | Exit 0 on exact DSH 0.1.7-rc.1. Isolated archive `e6cddc8a5fcfda95da5030277c2af9ebc52196047fc6c1000fba65e827f80c49`; defaults unchanged, runtime disposal verified, existing generated-image/PTC/download/fork regressions passed. This checker does not itself add a full real-account editing acceptance. |
| `git diff --check` | Passed during final review. |

The final supplemental model-context assertions only change a test. They do not change product bytes or the installation candidate. This checkpoint and the historical-note link were added after the installation archive was packed, so the recorded archive hash identifies that tested archive, not a later documentation-only repack.

Product byte identity for the passing runtime/browser candidate:

- `lib/index.js`: `ffd9c2999a159a0c1b4b1c86028e6633f817a183978141499e8fad22f0cf3c52`
- `lib/client.js`: `cb04906d2d37c34d77308c0a1b31d036c634220b6b298b9b2284fdf9587f12f5`
- `src/image-input-contract.ts`: `d2963ca421c64605dd387f05a053167cc87fe4ec0a18bbea1bb2523185d320f6`
- `src/image-inputs.ts`: `1c5cf7b38848d88fd7c5cdf7d0efdcd972e3e529e16379bac1aa19b80160c5a1`
- `src/image-history.ts`: `c8a0aae23c452aa277e71e44df5644abeb00932606efe2cf95abd7018e5e2d03`

## Evidence limits and next gate

Every model/image response and credential in these tests is synthetic. The session fixture uses the complete plugin, real AgentLoop, file-backed originals/attachments and physical JSONL (none/zstd), then replaces the host service graph and resumes from disk. It proves that the model request can see the image handles and that explicit valid edits survive normal durable restoration. It does not prove a real model always selects the right image from natural language.

The new browser tests run real Chromium with mocked session transport at a narrow viewport; they do not certify the complete installed daily Session page, an actual phone or Windows application. The installation checker separately certifies its bounded packaged-host scope. No real OAuth request, real image editing quality, process-crash recovery or arbitrary cross-version migration is accepted here. Older plugins are not promised to decode new v2 edit provenance; older v1 results remain readable in this candidate.

Next: independent review of this candidate and a separately authorized bounded real-provider / full installed-session acceptance, including a single image, multiple references and two consecutive edits. Use non-sensitive approved fixtures. Do not change channels or silently fall back to generation if the real service rejects editing. No push, PR, merge, release, npm-tag change, daily deployment or 3080/3081 operation is authorized by this checkpoint.

## Retained development failures

The first expanded type checks caught test-fixture vocabulary/type errors; these were corrected to the installed host contracts rather than suppressed. The first complete regression run failed one old exact help-text assertion after the new image-transmission disclosure was added; both EN/ZH assertions were updated to the intended wording and the complete check passed. A repeated exact edit anchor was rejected transactionally before writes and was resubmitted with a unique anchor. No platform authorization denial blocked the source implementation in this continuation. Previous transport-only and denied-call records remain historical, not evidence that the current tool is unavailable.
