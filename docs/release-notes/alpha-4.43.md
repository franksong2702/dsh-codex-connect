# Codex Connect Alpha 4.43 — DSH 0.1.7-rc.1 compatibility

## English

This candidate updates the plugin runtime and UI integration for DeepSeek Harness `0.1.7-rc.1`. It follows the new volatile configuration and settings-form lifecycle, current message-source types, and the native-compaction provider API. DSH `0.1.7-rc.1` is the target pairing, not a verified support claim; older DSH versions are not supported by this candidate.

Upgrade the Harness before installing the matching Codex Connect release. Existing provider configuration and OAuth credentials remain in place; signing in again is not required. This candidate has not been published, so the public installation recommendation remains unchanged.

The exact install check against unmodified DSH `0.1.7-rc.1` currently stops in `plugin doctor` with `ERR_MODULE_NOT_FOUND` for the host-provided `@deepseek-ai/schemastery` peer, matching the upstream [plugin-exec peer-resolution report](https://github.com/deepseek-ai/deepseek-harness/discussions/5537). The local check passes 116 files and 1,305 tests; the Chromium suite passes 60 tests in 11 files after adding test-only dependencies for imports externalized by the published DSH UI packages. Neither result validates installation in an unmodified DSH profile. The existing full-Session upgrade check also still swaps this candidate into a DSH `0.1.2-rc.1` host, which is outside the declared support target; old-task migration across the Harness upgrade remains unverified. The pair stays absent from `verified-compatibility.json` until the stock-host install matrix and applicable upgrade acceptance pass.

## 中文

本候选版更新了插件运行时及界面集成，目标是 DeepSeek Harness `0.1.7-rc.1`：迁移到新的 volatile 配置与设置表单生命周期、当前消息来源类型和原生压缩 Provider API。`0.1.7-rc.1` 是目标组合，不代表已验证支持；本候选版不支持较旧的 DSH 版本。

请先升级 Harness，再安装对应的 Codex Connect 版本。已有 Provider 配置和 OAuth 凭据会保留，无需重新登录。本候选版尚未发布，公开安装建议保持不变。

针对未修改的 DSH `0.1.7-rc.1` 的隔离安装检查目前在 `plugin doctor` 阶段因宿主提供的 `@deepseek-ai/schemastery` peer 无法解析而报 `ERR_MODULE_NOT_FOUND`，与上游[插件命令 peer 解析问题](https://github.com/deepseek-ai/deepseek-harness/discussions/5537)相符。本地完整检查通过 116 个文件、1,305 项测试；为已发布 DSH UI 包外置导入补齐仅用于测试的开发依赖后，Chromium 套件 11 个文件、60 项测试通过。这些结果不能替代原版 DSH profile 的安装验收。现有完整 Session 升级检查仍把候选插件换入不在支持范围内的 DSH `0.1.2-rc.1` 宿主；跨 Harness 版本的旧任务迁移尚未验证。原版宿主安装矩阵和适用的升级验收通过前，`verified-compatibility.json` 不记录此组合。
