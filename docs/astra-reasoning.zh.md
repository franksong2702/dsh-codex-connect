# 实验性 Astra 推理档位调整

此功能默认关闭，供测试使用。它通过 Astra 的 `configuration_update` 输入项调整后续请求的推理档位，不修改请求级初始档位。不保证缓存复用、输出质量、订阅用量或账户可用性。

## 测试方法

1. 在测试用 DSH profile 安装 PR 构建，保持日常 profile 不变；此 PR 不是 npm 发布。
2. 在设置 → 插件 → 插件配置 → Codex Connect 中启用**实验性 Astra 推理档位调整**并保存。对应插件配置为 `enableReasoningUpdates: true`。
3. 新建 GPT-6 Astra 会话，显式选择 `low`、`medium`、`high`、`xhigh` 或 `max`，不要选择 Default。
4. 请代理调用 `codex_connect_set_reasoning_effort`，例如：“在证明下一道题之前，提议将当前会话调整到 high。”
5. 在原生用户问题中选择 **Change to high**。普通文本回复“同意”不足以授权；自动审查不会代答此问题。
6. 工具先报告调整已排队。确认通知进入下一次模型请求时，其前面会插入 `configuration_update`。后续请求在原位置重放这两项；模型选择器仍显示初始档位。

拒绝不会调整档位。在通知正式进入请求前取消，可能丢弃排队通知。关闭开关会移除新提议能力并取消待答问题；已进入会话记录的确认仍继续重放，不会重置已有会话的有效档位。如不想再次确认调整，可新建会话。

## 限制与验证

首版仅支持当前主代理、原会话身份、完整且未压缩的历史，以及不变的模型和初始档位选择。含确认记录的分叉会话、压缩、辅助模型调用、自动截断和服务端 previous-response 链接均拒绝执行；需要这些能力时请新建会话。profile 必须提供人工问题应答器。

无密钥测试组装真实 DSH 代理循环、工具运行时、用户问题服务、Codex 适配器和合成 SSE 传输，覆盖同意与拒绝、取消与卸载、答复期间切换档位、持久会话 JSON 恢复、原位置重放和默认关闭设置。这些测试不代表真实 ChatGPT 或浏览器交互验收；后两项由本 PR 的用户测试验证。

## 实现说明

确认存入普通 `user/message` 事件，使用结构化的 `dsh-codex-connect` 插件来源元数据，并附带可见通知。不通过文本匹配授权，不修改默认设置，也不维护可变的会话覆盖表。DSH 的会话追加与恢复校验会保留元数据。正常 pi-ai 转换后，供应方公共 payload 钩子通过请求局部异步作用域插入更新，包含 prepared call 路径；守卫在发送前拒绝缺失或不一致的确认记录。

协议依据为 [OpenAI：对话中调整推理档位](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)。插件刻意只支持协议的一部分，尤其尚未实现压缩触发后的更新重插入。
