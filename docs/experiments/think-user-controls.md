# Think T2b: saved opt-in and native user controls

Date: 2026-09-20. Based on #222 `93d3b0f402075322f04b385a63b1de961ab663a6`; depends on unmerged #220 / #221. The existing #167 is not merged or silently replaced in full. This is an unreleased development candidate, not an Alpha 4.37 feature announcement.

## Product behavior

The normal plugin mounts Think's host-owned replay guard and passes its request-local replay seam to the existing Codex adapter. New proposals remain disabled by default. `enableReasoningUpdates` is a strictly validated, backward-compatible Boolean setting; absence in an older settings snapshot means false. A successful save controls registration, not a browser-local checkbox state. Failed saves retain the prior saved value and runtime behavior.

The bilingual capabilities entry is **Codex native reasoning adjustment (Astra)** / **Codex 原生推理强度调整（Astra）**. It is a peer of search, native context management and image capabilities, without a separate bordered card. Saved values and unsaved changes are distinguished. Help explains the potential use of increasing effort for difficult work and decreasing it for routine work without promising quality, speed or quota savings.

Enabling permits suggestions, not automatic effort changes. Every target still requires the exact native human-question response; ordinary text and Auto-review do not authorize it. A pending or approved-but-unadmitted change does not update the current request or selector. The host's next recorded request determines the configured effort. This is not proof of successful remote execution. A later manual choice wins under the existing admission rules.

Disabling and saving immediately invalidates open questions and unadmitted changes, then removes the proposal tool. Admitted updates remain replayable, including after plugin remount. Disabling does not reset the current effort, edit global model defaults, remove saved notices, or lift experimental-history limitations.

## Explicit limitations

Use a new, uncompacted Astra root conversation and an explicit initial effort, not Default. After an adjustment is admitted, this version cannot compose that history with compaction, model switching or delegated-agent reasoning. Neither the Remember switch nor host compaction configuration is silently changed. The limitation remains visible beside the switch and in the native question detail; it also remains after disabling suggestions.

Fault quarantine across process restart, historical migration, full authenticated session-page acceptance, live provider behavior and task-value measurements remain separate gates. The test harness must not be deployed as the user's daily application. No real credentials or model requests are used by these tests.

## Evidence scopes

`tests/think-product-settings.spec.ts` loads the actual plugin entry, real SettingsProvider, AgentLoop, tools, native question service and Codex adapter with temporary synthetic credentials and intercepted SSE. It covers malformed and legacy settings, failed save, saved activation, plugin remount, cancellation of an open question, cancellation of an unadmitted approval, and continued replay after disabling. No default model writes are accepted.

The exact-host matrix runs those four product tests alongside the existing 31 native-admission cases, with one independent identity check per host. Report schema 2 explicitly records product-setting exercise and unchanged production defaults. Schema-1 reports from #222 are retained as historical evidence, not accepted as proof of this expanded gate. The final local schema-2 report passed all four hosts with zero network attempts; the tested bundle digest is `bb02b1fe987cd9d4e7b4a50a3a11a4b06bc3f115fae1574a489b1d7dc1714743`.

The existing Chromium suite adds six settings cases: English/Chinese at narrow/desktop widths, atomic save/discard, remount, failure preservation, peer-level alignment and containment.

`node scripts/check-think-controls.mjs` joins the actual product host to the **published DSH question composer and ModelDirectory/selector components** in Chromium. Package versions and exact bundle hashes are recorded. Native question choice and Submit drive the real host question service; the resulting request/header drives the real selector. It checks approval (Low -> High -> Medium), refusal, disabling during a question and dismissal; approval alone keeps the original header, and a component remount preserves the last recorded effort.

This checker uses a bounded Playwright binding as its **test-only transport**, not DSH Gateway/SessionController authentication or the complete DSH session page. The scope carrier and catalog are fixture scaffolding; question handling, draft store, published controls, product settings and server-side authorization/replay are real. Manual model RPC is not simulated by this browser fixture. Its result retains `gatewayTransport: false`. Existing host tests cover manual-selection priority separately. Native controls are tested in English; settings are tested in both languages. A component pass is not full authenticated browser acceptance.

Only the exact native-question UI and CSS build tooling are added as development dependencies. Runtime dependencies, package version, supported-host declaration and other feature defaults are unchanged. Scripts are not package exports or production endpoints.

## Final local verification

The resumed candidate completed `pnpm run check` on Node 22.22.3: **108 test files / 1,099 tests**, plus lint, both type checks, build, CLI, compatibility and package gates. The product tests now explicitly check failed **disable** as well as failed enable: the saved enabled state and outstanding question remain intact when persistence fails; only a subsequent successful disable aborts the question. The same strengthened cases passed on all four exact hosts (**140 functional executions plus four runtime-identity checks**).

Chromium passed **38 settings/product regression cases** and the separate **four native-control flows** (approve with High then Medium, refuse, disable while pending, dismiss). The native-control report retains `gatewayTransport: false`; no actual model request or default-model write occurred. These results belong to this candidate, not an updated npm release. Final commit and remote CI are recorded on the delivery PR after push.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
node scripts/check-think-controls.mjs
node scripts/check-think-matrix.mjs --report docs/experiments/think-user-controls-host-acceptance.json
```

Chromium must be installed in the selected Playwright cache. Final counts, commit identity and CI readback belong to the delivery checkpoint and PR; a passing earlier source is not validation of later edits. 3080 and the separate #200 Split acceptance process on 3081 are not modified by this development task.
