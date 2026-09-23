# Codex Connect Alpha 4.43 — DSH 0.1.7-rc.1 compatibility

## English

This candidate updates the plugin runtime and UI integration for DeepSeek Harness `0.1.7-rc.1`. It follows the new volatile configuration and settings-form lifecycle, current message-source types, and the native-compaction provider API. DSH `0.1.7-rc.1` is the target pairing, not a verified support claim; older DSH versions are not supported by this candidate.

Upgrade the Harness before installing the matching Codex Connect release. Existing provider configuration and OAuth credentials remain in place; signing in again is not required. This candidate has not been published, so the public installation recommendation remains unchanged.

The unmodified DSH `0.1.7-rc.1` installation now passes `plugin doctor` and the installed runtime check. DSH's [plugin-exec peer-resolution issue](https://github.com/deepseek-ai/deepseek-harness/discussions/5537) remains upstream, but this plugin's standalone CLI no longer needs those peers in that subprocess; the installed-runtime checker uses DSH's own profile resolver and leaves shared runtime imports external. An explicit DSH installation anchor gives `doctor` exact host version metadata without importing host code. The CLI bundle includes third-party notices and excludes unused non-Codex model providers. On Node 22, the local check passes 116 files and 1,307 tests, the Chromium suite passes 60 tests, and the exact stock-host install matrix passes with unchanged defaults, ten process-restart native-compaction phases, and synthetic image checks. The current-host installed Session check passed its paused-Task safety checks; old-task migration across a Harness upgrade remains unverified. The public installation recommendation remains on the published pair until this candidate is released.

## 中文

本候选版更新了插件运行时及界面集成，目标是 DeepSeek Harness `0.1.7-rc.1`：迁移到新的 volatile 配置与设置表单生命周期、当前消息来源类型和原生压缩 Provider API。`0.1.7-rc.1` 是目标组合，不代表已验证支持；本候选版不支持较旧的 DSH 版本。

请先升级 Harness，再安装对应的 Codex Connect 版本。已有 Provider 配置和 OAuth 凭据会保留，无需重新登录。本候选版尚未发布，公开安装建议保持不变。

未修改的 DSH `0.1.7-rc.1` 隔离安装现已通过 `plugin doctor` 和已安装运行时检查。上游的[插件命令 peer 解析问题](https://github.com/deepseek-ai/deepseek-harness/discussions/5537)仍存在，但本插件的独立 CLI 不再需要该子进程能解析宿主 peer；安装运行时检查使用 DSH 自身的 profile 解析器，插件运行时仍复用宿主包。显式 DSH 安装 anchor 可让 `doctor` 只读确切宿主版本，不加载宿主代码。CLI bundle 附带第三方许可说明，且不再打入未使用的非 Codex 模型供应商代码。在 Node 22 上，本地完整检查通过 116 个文件、1,307 项测试，Chromium 套件通过 60 项测试，原版宿主隔离安装矩阵通过，覆盖默认设置保持不变、10 个跨进程原生压缩阶段和合成图片检查。当前宿主的已安装 Session 暂停 Task 安全检查也已通过；跨 Harness 版本的旧任务迁移尚未验证。候选版发布前，公开安装建议仍指向已发布的组合。
