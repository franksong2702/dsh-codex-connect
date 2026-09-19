# Codex 原生上下文管理：配置与验收

## Observed preview and merge checkpoint — 2026-09-19

#216 merged at `525e01b6e1c2b7d23ba70e29510ef1fd31fb0168` after maintainer approval. The user preview used reviewed `1e05677` on DSH `0.1.5-rc.1`. Ordinary work produced one valid native checkpoint through automatic scheduling, wrote it into the real session, and completed subsequent tool-assisted work. A later normal restart preserved the original history/checkpoint; deployment verification sent no post-restart model turn.

The stock scheduler then tried to compact only its new checkpoint again because pressure remained slightly above its soft threshold. The larger replacement was correctly refused and the ordinary turn completed. A separate local host repair (`2e5469e`) was applied only to the preview; **upgrading this plugin does not install that repair**. This remains a stock-host follow-up, not proof of universal automatic/repeated acceptance or savings.

The implementation description and original plan below remain for reproduction. #196/#65 retain their unverified gates; no new live-request budget is granted here.

## Scope

Based on merged main `085d1d618a01bba6f28ed002f7d5af088a85d4d0` (#214). This change reuses the existing `enableNativeCompaction` boolean, SettingsProvider section and adapter callback. The checkbox already existed; this PR improves its product semantics, bilingual presentation and regression coverage rather than adding another enablement flag or another compaction engine.

The existing [bounded live A/B evidence](remember-controlled-live-m15-2026-09-18-9n7e.md) is historical provider evidence, not a new live test of this UI or automatic long-task quality. The [oversized-user failure](native-compaction-durable-m15-2026-09-18-1317.md) remains unchanged.

## User-facing contract

Entry: Codex Connect settings → 能力 / Capabilities.

The native-context option uses the same unboxed row hierarchy as its neighboring capabilities. Its checkbox and title align with Reserve and image controls; supplementary consent, saved-state, risk and disclosure copy use the same subordinate indentation as Auto-review details. The experimental label does not create a separate card or settings tier. This layout-only adjustment changes neither saved authorization nor automatic compaction behavior.

**Codex 原生上下文管理** — 实验性 · 默认关闭

> 对话变长、需要整理上下文时，自动使用 Codex 原生压缩能力，尽量保留关键要求和任务进展，帮助长任务持续进行，减少重新交代背景。

> 开启并保存即授权自动处理，无需逐次手动触发或确认。作用于当前配置中的 Codex 会话，不会因此切换模型、调整推理强度或开启其他功能。

> 上下文压缩可能丢失部分细节，不等于完整保存全部对话信息。

A single saved opt-in authorizes the normal automatic work within this capability. Viewing the settings, staging a checkbox, or a model proposing the feature does not enable it. There is no second auto-management checkbox, mode selector, or per-compaction confirmation. The existing Save/Discard interaction remains unchanged. Previous explicit true/false choices remain valid; missing settings default to false.

The card separates the last saved setting from an unsaved draft. A failed save does not claim that the draft is active. Loading/unavailable settings do not display a fabricated saved value. The parent capability count includes the saved native-context flag (and the already-present Reserve flag), not staged changes.

## Runtime boundaries

- DSH owns pressure/overflow triggers, thresholds, cancellation, sessions and durability. The inspected baseline `dsh-compaction-basic@0.1.2-rc.1` resolves omitted `auto` to true. With ordinary DSH automatic management, a saved native opt-in is sufficient; no manual compact action is required.
- An explicit host `auto: false`, a missing compaction service or a separately configured non-Codex summarization route is not silently overwritten. This control chooses the native mechanism for eligible Codex compaction calls; it does not replace the host scheduler. The timing caveat is disclosed in the card details.
- A successful save is read by the registered adapter on subsequent calls, without restarting or registering a second adapter. Unsuccessful persistence retains the prior effective setting.
- Disabling prevents new native compaction requests; it does not cancel already-started work or make existing trusted native checkpoints unreadable. Normal DSH summary fallback remains available. No model/account/effort selection, tool authority or unrelated capability is changed by this switch.
- This PR does not claim token savings, perfect recall, automatic/repeated live acceptance, Astra acceptance, or closure of #65/#196.

## Engineering checks

`tests/native-context-settings.spec.ts` combines the real DSH SettingsProvider, AgentLoop, token meter, automatic compaction engine, plugin and JSONL writer with synthetic credentials/responses in disposable storage. It checks default-off, persistence failure, saved enablement followed by automatic compaction during an ordinary turn, saved disabling with existing checkpoint replay, persisted choices at startup, and respect for host auto=false. No manual compaction call is used. Auxiliary compaction uses the existing host summarization policy; the conversation's model and effort stay unchanged.

Client tests check both languages, no activation on view, Save/Discard, reload, failed enable and failed disable saves, read-only controls, and the saved-only capability counter. Chromium tests use a 390-pixel viewport in both languages and check the single-checkbox flow without a confirmation dialog, disclosure, save/disable behavior and card overflow.

## User acceptance after an isolated test entry is prepared

1. Open the Capabilities page. Confirm the name explicitly says **Codex 原生**, the benefit is understandable, and the experimental/default-off label is visible. On a fresh profile the saved setting is off.
2. Enable the checkbox without saving. It should show **更改尚未保存** while the saved setting remains off. Discard should restore off. Enable and save; reopen the page and confirm the saved setting is on, with no extra automatic-mode consent.
3. In a disposable conversation, establish three requirements, one rejected option and one pending action as described in the [experience scenario](remember-user-acceptance-plan.md). The engineer prepares and records a bounded test-only context-pressure setup and verifies that continuing the task actually triggers native compaction automatically, rather than asking the user to click a compact action.
4. The engineer verifies persistence and a normal isolated-process restart. Continue the pending task without repeating the requirements; the user judges continuity while the engineer checks actual checkpoint/request evidence.
5. Save the switch off. Confirm the saved setting survives reopening, no new native compactions are created, and existing valid sessions remain usable. Other capability/model/effort selections should be unchanged.

A PR or passing synthetic browser test is not a provisioned user service. Do not invent an entry URL or ask the user to upgrade the daily environment to test this PR. Any isolated user-facing service or new live-model request budget must be authorized separately. Do not merge, release, deploy, enable daily features or repeat prior live experiments as part of preparing this PR.

## Local delivery validation

The final code passed `pnpm run check` on Node 22.22.3: 99 test files / 975 tests, lint, typecheck, build, CLI and package checks (original job `wc_job_7i5gccxj8t_rv6DL`). Chromium passed 8 files / 30 tests, including both 390-pixel language variants (job `wc_job_gK42ID_MUawnYm2a`). These are synthetic/local checks, not a new live model or deployed-user result. The generated browser bundle and Config declaration comment are included; the provider/compaction runtime bundle, default settings, dependency lockfile and release workflows are unchanged.

During development, the new integration fixture initially imposed the conversation effort on the separate host summarization call; that fixture assertion was corrected after inspecting the host's existing policy, while retaining conversation-effort checks. A test-only Testing Library option also required a type correction. The local browser initially could not launch because its expected executable was absent; the matching headless browser was installed only under ignored project `node_modules/.cache/native-context-browsers`, and the complete suite then ran with that cache selected. No production fix or model-acceptance conclusion is inferred from those setup corrections.

Remote CI results must be read from the exact PR head after publication. This note was appended after the successful code checks; link, scope and package checks are repeated before commit.
