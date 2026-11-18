# Codex Connect：Alpha 设计

## 所有权与组合

本包通过 Harness 公共 `LlmRuntime` 与 `PiAiAdapter` 注册 `openai-codex`。主模型路径不是一次性 subagent，而是标准 Harness agent loop，因此原生工具审批、权限策略、流式输出、附件解析、reasoning replay、会话持久化、压缩与恢复均保持有效。

bundle patch 只插入 `llm-openai-codex`，不会写入 `agent-default-model` 或 `web.searchProvider`。`enableSearch` 与 `enableImageTool` 默认均为 `false`；关闭时不会注册对应可选服务。

Host 将 `llm-openai-codex` 注册为插件自有的能力 settings namespace。DSH 的 `llm-pi-ai` catalog 持有 `openai-codex` 可配置 provider 目录条目，Codex Connect 只注册实际 adapter，不重复声明该条目。浏览器通过 Harness settings-scope transport 绑定插件 namespace，把账户、额度以及带保存/放弃的能力配置放在现有“插件配置”卡片中。带 revision 防护的逐字段写入不会覆盖无关设置；提交后会即时协调搜索与图片能力的注册状态。插件绝不写入默认模型设置。

## 限额恢复提醒

`enableLimitResumeReminder` 只观察符合条件的普通模型回合。它在 provider 正常读取 429 响应时最多收集 16 KiB，从结构化响应提取重置时间，并与宿主最终结束的回合对应。重试后成功、请求取消或由 Schedule 投递输入的回合都不会安排提醒。缺少可信重置时间时保留原失败处理。

可选 Schedule 服务负责绝对触发时间、目标验证与入队回执。仅本机所有者可读写的索引保存宿主返回的确切任务 ID 和修订号。写入任务 ID 前若进程中断，预留记录可抑制当前窗口内的重复创建。修订冲突保留用户修改、暂停和删除。停止、同一会话后续成功、切换模型、插件观测到的活跃账号变更和关闭开关会尝试取消待触发任务，宿主重启后仍保留已安排任务。见[维护范围与验收条件](maintenance-scope.md#bounded-admission--issue-428-2026-11-18)。

## Task 开发冻结

普通模型适配器与后端请求管理器不直接导入 Task 策略；产品组装处显式接入旧任务的 provider 包装和请求前计数。此拆分保留旧任务权限、取消与恢复，不等于已删除全部实验运行时。见[拆分记录](agent-notes/core-transport-decoupling.md)。

维护范围现以[核心维护决定](maintenance-scope.md)为准：Task Phase 1/2 实现已经合并，但公开启动入口保持暂停，后续自动编排开发冻结。保留旧状态读取、经授权的停止与人工接管；历史候选验收计划不再是当前待办。

## OAuth 持久化

插件使用 `$DSH_HOME/.openai-codex-auth.json`，与 Codex CLI/Desktop 状态分离。格式 version 2 最多保存 16 个 OAuth 账户，并明确指定唯一当前账户。原 version 1 文件仍可读取，第一次修改凭据时才迁移；迁移前会先生成仅所有者可读的 `.openai-codex-auth.json.v1-backup` 回退副本。若该副本已存在，它必须仅所有者可读且与当前 version 1 文件一致，否则迁移会在替换主文件前停止。移除任一账户或执行退出登录时会删除该副本，避免已移除凭据继续留存。文档大小上限为 512 KiB。POSIX 上拒绝组/其他用户可读文件，也拒绝非普通文件；写入采用原子替换，所有修改使用 Harness 跨进程文件锁，返回给调用方的是凭据副本。

浏览器账户路由只返回插件派生的稳定键、本地显示名称、OAuth token 中存在邮箱时的脱敏地址以及当前账户状态，不返回 provider 原始 account id 或 token 字段。账户切换和删除与浏览器 OAuth 串行执行；每个模型请求会在解析授权前固定当前账户，令牌刷新只更新该账户，不会改变当前选择。OAuth 解析完成后，额度、图片生成和 Auto-review 请求会查找与该 access token 精确配套的 account id，因此并发切换账户不会混用两个账户的凭据。仍有其他账户时，删除当前账户必须由调用方明确指定接替账户；provider 级退出登录会删除全部账户。浏览器 origin 授权单独存放于 `$DSH_HOME/.openai-codex-trusted-origins.json`，格式为 `version: 1`、`mode: "allowlist"` 和规范化的精确 HTTP(S) origin；其中不含 OAuth 内容，且只能通过独立 CLI 修改。

为兼容迁移，设置页路由、OAuth 路径和 provider id 不改名。浏览器请求默认只允许 loopback；远程请求必须使用当前 sidecar 中的精确有效 HTTP(S) origin，不能带 cross-site Fetch Metadata，若带 Origin 还必须精确匹配。每次请求都会重新读取 sidecar；未知字段或错误 mode 会快速失败。登录挑战只接受不含凭据的 HTTPS 地址；30 秒内未得到地址、provider 已结束但没有地址、退出登录或插件卸载时，所有 waiter 都会被清理。只有显式登录会输出授权 URL 或代码；状态输出会脱敏。doctor 只用 `lstat` 检查元数据，不打开文件。

浏览器账户与更新请求具有 45 秒期限，覆盖响应头和 JSON 响应体。账户修改超时后不会自动重试写操作：只要账户视图仍在观察状态，浏览器就会重新读取服务端状态，因为修改可能已经提交。状态读取失败后每五秒重试，即使尚未保存账户也一样。插件卸载会取消浏览器等待，但不会退出服务端账户。

## 搜索与图片

仅当 `enableSearch: true` 时注册 Codex 独立搜索提供方和不含凭据的请求事件。DSH `0.1.2-rc.1` 没有通过 settings 服务开放 WebRuntime 的 provider 选择，因此兼容适配器会先核对该版本的运行时字段，记录此前的提供方，并仅在能力开启期间选择 Codex。关闭能力或卸载插件时会恢复此前的提供方；如果另一个 owner 已经选择了更新的路由，则不会覆盖它。不支持的运行时会让能力启用失败，不会谎报路由已经变化。仅当 `enableImageTool: true` 且 tools、filesystem、attachments 服务存在时注册 `view_image`。本地文件继续受 Harness 文件系统边界与大小限制；远程图片只允许不含凭据的公共 HTTP(S)，所有 DNS 结果必须是公共单播地址，每次重定向都会重新验证，并把实际连接固定到已验证地址以关闭 DNS rebinding 缺口。

远程图片的每次重定向跳转共用一个 30 秒期限，覆盖 DNS、连接与响应体读取。取消会立即结束调用方等待；操作系统 DNS 查询可能稍后才完成，但其结果不能在取消或超时后启动新的 HTTP 请求。

图片预览恢复仅在原图保存成功、预览创建失败时使用新增的元数据及内容 envelope 版本 3。结果记录精确原图和 `previewStatus: unavailable`，不会伪造附件。原图落盘前先通过 Host 验证，避免预览失败绕过原图验证。原生及 PTC 历史可将这些原图用于创建会话或实际继承了该结果的 fork；任意文本不会授予权限。现有结果卡提供原图下载及显式编辑，无需重新发送生图请求。正常版本 1/2 结果不变，取消仍清理未发布的原图。详见[实施与验证记录](agent-notes/image-preview-recovery.md)。

## 冲突、诊断与兼容边界

注册前检查现有 provider id；发现 `openai-codex` 已被占用时，给出旧 bundle 或手动 provider 配置的定向迁移提示。boot-free CLI doctor 只报告包/运行时版本、OAuth 路径元数据、能力默认值和安全提示。

Alpha 4.27 固定使用 Harness `0.1.2-rc.1` 开发依赖，并跟随其 pi-ai 版本范围 `^0.84.2`。Node.js 支持范围仍为 `^22.19.0 || >=24.0.0`。keyed `settings.plugin.item` 集成保持不变，客户端类型继续从 Session Controller、Settings、Store 和 Renderer 的所属包导入。已发布兼容性记录列出 Alpha 4.27 与 DSH `0.1.2-rc.1` 的精确组合。资格、额度、模型、服务端上下文容量和后端协议仍由上游控制。测试仅使用临时 OAuth 文档和模拟网络响应，CI 不执行真实认证。
