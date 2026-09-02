# 自动审查

Auto-review 是 Codex 官方能力，Codex Connect 把它的审核器接入符合条件的 DeepSeek Harness 审批请求。该功能默认关闭，并且只在当前请求提供方是 `openai-codex` 时参与审批；其他提供方的会话始终保留原有回答器链。它也不会削弱 Harness 的审批策略、沙箱、工具限制或权限检查：是否需要审批始终由 Harness 先决定。

在 **设置 → 插件 → Codex Connect → 可选能力** 中启用 **Codex 自动审查**。设置卡片常驻一句简短说明，完整告知放在 **了解发送内容与失败处理** 中。每个 profile 首次启用时必须确认；该确认保存在 profile 中，更换浏览器后不会再次弹出。启用即允许 Codex Connect 把最近的审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`。隐藏推理和已保存凭据不会进入审核请求。关闭后立即把所有请求交还原有人工审批链。

## 决策规则

- 只有完整、结构化的 `allow` 才返回 `allowed-once`。
- 结构化 `deny` 会拒绝动作，并把理由及禁止绕行指引加入下一模型步骤。
- 动作缺失或歧义、凭据缺失、路由不支持、响应畸形和传输失败都回到人工审批。
- 取消仍是取消。超时会单独提示；同一精确动作只允许重试审核一次，之后的超时回到人工审批。
- 同一轮连续拒绝三次，或最近五十次审核中拒绝十次，会停止该轮。
- `/approve <拒绝记录 ID>` 只授权一次完全相同的重试：工具、规范化参数和工作目录必须与所选拒绝记录一致。不匹配会消费这次授权，但不会放行动作。该命令需要宿主提供可选的 `@deepseek-ai/dsh-commands` 能力。

审批问题和结果继续由 Harness 的 `approval/asked`、`approval/decided` 事件持久记录；`/approve` 使用 Harness 命令生命周期事件。Codex Connect 只额外记录动作指纹和结构化评估标签，不在新审计事件中重复原始工具参数。

## 上下文限制

网络请求前使用保守的 UTF-8 字节限制：会话文本 20,000 字节，工具上下文 10,000 字节，单条会话文本 5,000 字节，单条工具记录 1,000 字节，并且最多保留四十条最近的非用户记录。用户文本标记为可信授权来源；assistant 和插件文本不构成授权。请求中会明确包含省略和截断数量。

## 服务状态

OpenAI 已把 Auto-review 记录为 Codex 功能，但没有承诺 `codex-auto-review` OAuth 路由是稳定公共 API。独立的 `auto-review-probe` 命令只检查当前 OAuth 路由能否完成一次合成的空操作评估。运行时失败始终回到人工审批，绝不会放行执行。

参见 [OpenAI Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review)、[OpenAI 审批与护栏](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) 和 [Issue #84](https://github.com/franksong2702/dsh-codex-connect/issues/84)。
