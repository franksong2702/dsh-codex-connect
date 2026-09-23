# Codex Connect Alpha 4.43 — DSH 0.1.7 compatibility

## English

This candidate updates the plugin runtime and UI integration for DeepSeek Harness `0.1.7-alpha.2`. It follows the new volatile configuration and settings-form lifecycle, current message-source types, and the native-compaction provider API. DSH `0.1.7-alpha.2` is the target pairing, not a verified support claim; older DSH versions are not supported by this candidate.

Upgrade the Harness before installing the matching Codex Connect release. Existing provider configuration and OAuth credentials remain in place; signing in again is not required. This candidate has not been published, so the public installation recommendation remains unchanged.

The exact install check against unmodified DSH `0.1.7-alpha.2` currently stops in `plugin doctor` because the isolated plugin process cannot resolve the host-provided `@deepseek-ai/schemastery` peer, matching the upstream [plugin-exec peer-resolution report](https://github.com/deepseek-ai/deepseek-harness/discussions/5537). The local Chromium suite passes 60 tests in 11 files after adding test-only dependencies for imports externalized by the published DSH UI packages. This does not validate installation in an unmodified DSH profile; the pair remains unverified in `verified-compatibility.json` until the stock-host install matrix passes.

## 中文

本候选版更新了插件运行时及界面集成，目标是 DeepSeek Harness `0.1.7-alpha.2`：迁移到新的 volatile 配置与设置表单生命周期、当前消息来源类型和原生压缩 Provider API。`0.1.7-alpha.2` 是目标组合，不代表已验证支持；本候选版不支持较旧的 DSH 版本。

请先升级 Harness，再安装对应的 Codex Connect 版本。已有 Provider 配置和 OAuth 凭据会保留，无需重新登录。本候选版尚未发布，公开安装建议保持不变。

针对未修改的 DSH `0.1.7-alpha.2` 的隔离安装检查目前在 `plugin doctor` 阶段失败：插件独立进程无法解析宿主提供的 `@deepseek-ai/schemastery` peer，与上游[插件命令 peer 解析问题](https://github.com/deepseek-ai/deepseek-harness/discussions/5537)相符。为已发布 DSH UI 包外置导入补齐仅用于测试的开发依赖后，本地 Chromium 套件 11 个文件、60 项测试通过；这不代表原版 DSH profile 的安装检查通过。该组合仍保持未验证，`verified-compatibility.json` 不记录此组合。
