# Codex Connect — Images

[English](../README.md) | 中文

这是 [Codex Connect](https://www.npmjs.com/package/dsh-codex-connect) 面向 DeepSeek Harness 的可选图片生成扩展。

当前包是仍保持私有的实现预览。它与兼容的 Codex Connect 核心包同时启用后，会注册 `codex_connect_image_generate` 工具。工具只接受一段文字提示词，由核心传输层发起一次有上限的图片请求；随后按照当前 DSH 的附件限制校验 PNG、JPEG 或 WebP，并将整批合格图片保存为持久附件。浏览器卡片、图库、灯箱和发布工作流尚未完成，因此现阶段不得把它发布为正式可用插件。

正式能力保持为独立 npm 包，让用户可以只使用 Codex Connect 核心模型提供方而不安装图片生成。图片由 Codex 上游端点生成。具体使用哪个模型由上游决定，本插件不指定、也不作声明。

## 安全边界

- 社区 Alpha，不代表 DeepSeek 或 OpenAI 官方背书。
- Issue 和日志不得包含凭据、账号 ID、OAuth URL 或完整提示词。
- 图片扩展不会改变默认模型或搜索路线。
- 图片生成可能额外消耗额度；取消可能只停止本地等待。如果取消与附件写入同时发生，内容寻址存储可能留下不可达对象，而会话不会收到附件引用。
- 工具不会自动重试，不记录完整提示词或图片编码正文，只向模型返回文字说明和不透明的附件引用。
- 批次失败时不会返回部分附件引用；但底层内容寻址存储在写入失败或取消竞态后可能保留不可达对象。

后续实现必须先阅读仓库中的[版本化 v4 设计](../../../docs/design/codex-connect-images-v4.md)。
