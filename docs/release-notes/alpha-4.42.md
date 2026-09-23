# Codex Connect Alpha 4.42 — public orchestration paused

## English

This release ships the publication gate from #248. New conversations no longer offer automatic task-level model choice or read-only delegation. The authenticated backend also rejects new activation, automatic resume, task upgrade and delegation enablement, including requests from cached older clients. This is a maintainer-controlled release pause, not another user preference.

Existing task history, grants and request counters are preserved. Existing-task controls retain state readback, Stop and manual takeover. Restart does not replay automatic work; users can take over manually and continue with the ordinary model picker. Manual GPT-6/Astra selection, account settings, other plugin features and native compaction are unchanged. Reopening requires a separately reviewed source change after maintainer acceptance.

The preceding #248 gate passed Node 22/24 checks, 1,309 unit tests, 60 browser tests, declared-host matrices and a seven-group installed synthetic upgrade from public 4.41. Release-candidate checks must independently validate the final 4.42 artifact. These tests do not establish real-account orchestration quality, quota savings, daily-profile acceptance or physical-mobile acceptance. Full installed-page acceptance uses baseline DSH 0.1.2-rc.1 with the documented dependency/installer pins; the separate runtime matrix covers all declared hosts.

After npm publication is independently confirmed, install this exact version on a declared compatible host:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.42
```

Preparing or publishing the package does not upgrade already-running installations. The npm `latest` channel is a separate, explicitly authorized promotion, not implied by `alpha` publication. See `MIGRATION.md` and `docs/experiments/adaptive-task-publication-gate.md` for existing-task recovery.

## 中文

本版交付 #248 的公开发布门禁：新会话不再显示任务级自动选模型和只读委派入口；后端也拒绝新开启、自动恢复、任务升级及启用委派，包括旧缓存页面发来的请求。这是维护者控制的发布暂停，不是另一个用户可以勾开的设置。

已有任务的历史、授权和请求计数保留，仍可查看状态、停止任务和切回手动。重启不会自动重放任务；手动接管后可以继续通过普通模型选择器工作。GPT-6／Astra 手动选择、账户设置、其他插件功能与原生压缩不变。重新开放需在维护者验收后通过另一个明确评审的源码变更。

此前 #248 已通过 Node 22／24、1,309 项单测、60 项浏览器测试、声明宿主矩阵，以及从公开 4.41 升级的七组实际安装模拟验收。最终 4.42 包还需独立通过发布候选检查。这些证据不代表真实账户协同质量、省额度、日常 profile 或实体手机验收。完整页面升级检查使用基线 DSH 0.1.2-rc.1 与已记录的依赖／安装器固定组合；独立运行时矩阵覆盖全部声明宿主。

确认 npm 已发布后，可用上面的精确版本命令安装。准备或发布包不会自动升级正在运行的实例；`latest` 是另行明确授权的渠道提升，不随 `alpha` 发布自动完成。已有任务恢复说明见迁移文档与公开门禁文档。
