# GPT-6 Sol / Luna compatibility candidate

## Contract

Base: main `4165b1d`. Add explicit `gpt-6-sol` and `gpt-6-luna` discovery and dispatch on the existing supported DSH/pi-ai versions, following the fallback approach in #121. Preserve installed native metadata when available, exact model selection, existing defaults and persisted grants. This is not a release, account entitlement test or service upgrade.

Authority: [official Codex catalog at 39598ed](https://github.com/openai/codex/blob/39598ed17885970828acd42a6370131ed0190a98/codex-rs/models-manager/models.json), and [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) / [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) model documentation. Codex metadata gives a 272,000 default and 872,000 local configuration ceiling, not a measured OAuth endpoint capacity. API pricing is not ChatGPT subscription usage pricing.

Plan: add missing catalog entries; calibrate supported effort mapping; admit explicitly authorized new task routes without widening old grants; distinguish model generations in task UI; test and rebuild; submit a separate PR.

## Compatibility boundaries

- Expose Low, Medium, High, Xhigh and Max; Default leaves reasoning unspecified. Off/Minimal are not advertised for these Codex models. Codex Sol's Ultra includes automatic delegation; this plugin's pi-ai thinking-level contract does not implement that client orchestration mode, so Ultra is not exposed or silently mapped to Max.
- Retain the existing GPT-5.6 Sol / Medium task start, search defaults, user selections, model visibility filters and GPT-5.6 Luna Reserve mapping. Adding model support does not choose a new default.
- New tasks may explicitly authorize the new models. Persisted v1/v2 task grants retain their exact model/effort sets and counters. Using a new model requires a grant that includes it; no automatic migration expands permissions.
- Do not upgrade DSH, pi-ai or lockfiles, change credentials, call real models, publish, merge or restart an instance in this PR.

## Verification

Required: focused catalog/effort/wire, native-compaction, task grant/persistence/delegation tests; browser generation labels; full `pnpm run check`; supported-host CI and independent review. Synthetic credentials and mocked Responses only. Real-account availability and performance remain unverified.

Local candidate evidence (2026-09-23): `pnpm run check` on Node 22.19.0 exited 0 (115 files / 1,280 tests at that point, lint, typecheck, build, offline checks and pack validation). After adding the two Phase 1 host handoff cases, the final full Vitest run passed all 1,282 tests in 115 files. `pnpm run test:browser` passed 52 tests in 10 files. The packed-artifact host checker now explicitly requires both new models with the five supported efforts; CI must exercise this on every declared host. These are synthetic checks, not account entitlement probes.

Known test-harness limitation: the first full local check on Node 26.5.0 failed 25 pre-existing subprocess probe cases because that Node release removed `--experimental-transform-types`; the final Node 22 full check passed. This PR does not change those unrelated probe launchers or claim the full Node 26 suite passed. Focused ordinary/native-compaction/delegation model tests also passed on Node 26.
