# Codex Connect 0.1.0-alpha.4.37 — release notes

**Published on 2026-09-19.** [GitHub prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.37); npm `alpha` points to 4.37 and `latest` remains 4.34. The [publication record](../../.github/ALPHA_437_PUBLICATION.md) verifies the immutable release commit and archive. This post-publication document update does not republish the package.

## Changes

- **Codex native context management:** clearer Chinese/English settings explain the Codex-native mechanism, intended long-task continuity benefit, saved vs unsaved state and possible detail loss. The option has the same visual hierarchy as peer capabilities. It remains experimental and default-off. One explicit enable-and-save authorizes eligible automatic handling under DSH's existing scheduler. Disabling prevents new native operations while keeping existing checkpoints readable. No other capability, model, account or reasoning setting is enabled. (#216)
- **Recovery evidence:** bounded retained-user and assistant-origin controls cover real native compaction, physical storage, writer exit, new-process restore and a new exact answer. The original failed oversized-user attempt is preserved. These narrow controls do not prove universal recall, token savings, repeated long-task quality or Astra acceptance. (#214)
- **Maintenance:** improved candidate-host doctor diagnostics and separated host-repair evidence; scoped refusal guidance and runtime verification. (#212, #213)

## Known limitations

Some stock DSH schedulers may try to compact a newly created checkpoint again when pressure remains slightly above the automatic threshold. A larger replacement is refused and the prior checkpoint is preserved; the extra attempt can add latency and usage. The preview's local host patch is **not installed by a Codex Connect update**. This release does not claim to repair the stock scheduler.

Supported hosts remain `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2`. Local alpha.2 repair evidence is not official alpha.2 support. UI fork anchors, faults, provider/account transitions and broader accounting/quality remain separately tracked.

Think #167, Split #199/#200 and the new-session Fast Mode enhancement #208 are not included. Live Reserve entry/recovery remains separate (#194). Defaults and per-session choices are unchanged.

## 发布内容摘要

“Codex 原生上下文管理”设置现在明确说明用途、自动处理授权、保存状态和可能丢失细节的风险，并与其他能力选项保持同级样式。默认仍关闭；开启并保存后，由 DSH 原有策略自动触发，无需每次手动操作。

本版本整理了真实压缩存档与新进程恢复的限定验收证据，并改进宿主兼容诊断。不承诺完整无损记忆、节省额度或所有长任务均已验收。

**3081 测试环境中“避免刚压完又压一次”的修复属于本地 DSH 宿主补丁，不会随插件升级自动安装。Think、Split 和新会话默认快速模式不在本次范围。**

## Maintainer gate

External installation report #215 now has an evidence-backed preliminary disposition: the supplied excerpt identifies a missing local archive for another web-profile dependency, and an offline package-manager control reproduces that failure independently of Codex Connect. Reporter recovery and the UND_ERR_DESTROYED cause remain unconfirmed; the issue stays open. It is not currently a confirmed plugin regression blocking the unchanged supported-host release scope. 4.37 does not claim to repair that environment or support stock DSH 0.1.6-alpha.2. See [triage record](../agent-notes/issue-215-install-triage-2026-09-19.md). Exact candidate/main checks and authorization remain required; these notes do not authorize publication or deployment.
