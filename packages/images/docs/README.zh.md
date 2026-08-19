# Codex Connect — Images

[English](../README.md) | 中文

这是 [Codex Connect](https://www.npmjs.com/package/dsh-codex-connect) 面向 DeepSeek Harness 的可选图片生成扩展。

当前包只是 PR-1 的私有骨架：它会安装一条默认启用的配置，但不会注册图片工具、浏览器卡片、路由或网络请求。现阶段不得把它发布或当作可用插件安装。

正式能力保持为独立 npm 包，让用户可以只使用 Codex Connect 核心模型提供方而不安装图片生成。图片由 Codex 上游端点生成。具体使用哪个模型由上游决定，本插件不指定、也不作声明。

## 安全边界

- 社区 Alpha，不代表 DeepSeek 或 OpenAI 官方背书。
- Issue 和日志不得包含凭据、账号 ID、OAuth URL 或完整提示词。
- 图片扩展不会改变默认模型或搜索路线。
- 图片生成可能额外消耗额度；取消可能只停止本地等待。

后续实现必须先阅读仓库中的[版本化 v4 设计](../../../docs/design/codex-connect-images-v4.md)。
