# 配置、诊断与恢复

[English](reference.md) | 中文

安装方法与已验证的发布组合见[用户指南](README.zh.md)。本参考文档说明账户行为、可选能力、配置和诊断命令。

## 账户、模型与额度

OAuth 凭据保存在运行 DSH 的主机上，由该主机用于向 OpenAI 认证和发起请求。“模型”卡片和“插件配置”页面共享同一份账户状态；选择账户不是会话级绑定。**管理账户**可以添加、选择或移除账户。浏览器响应只会包含插件生成的账户 key 和脱敏标签，不会暴露 OAuth token 或原始 OpenAI account id。

在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。所有界面语言均保留模型的规范名称。**更多设置 → 模型** 控制发现列表中显示哪些模型；隐藏模型不会禁用按精确 ID 路由。

Codex 目录来自已安装的 `@earendil-works/pi-ai` 包，不是实时查询账户可用模型的结果。DSH `0.1.2-rc.1` 使用 pi-ai `^0.84.2`，其中尚无 `gpt-6-astra`，因此由 Codex Connect 补充定义。Alpha 4.33 也已验证 DSH `0.1.5-alpha.1` 与 pi-ai `0.85.1` 的组合；混装的宿主包以及其他 DSH/pi-ai 组合仍属未验证。遇到原生 Astra 条目时，插件保留其元数据，并维持 Low、Medium、High、Xhigh 和 Max 推理选择，不修改已安装的目录。用户无需单独升级 pi-ai 即可选择 Astra。发布说明记录了准确的已验证组合和验收限制；依赖声明本身不代表已验证。两种来源的目录条目都不能证明账户具有调用权限。

- 添加账户期间，当前账户仍可继续使用。
- 取消新的授权或等待超时，不会删除任何已有账户，并会关闭已接受的回调连接，包括未完成的 HTTP 请求。取消后，浏览器会一起读取账户标签与额度，再更新显示。待处理授权默认 10 分钟后过期；`oauthTimeoutMs` 接受 1,000–1,800,000 毫秒，并在插件加载时应用。
- 切换账户只影响后续请求。每个请求会在解析认证前固定当前账户，因此并发切换不会混用凭据。如果该账户在认证过程中变得不可用，请求会失败，需要使用所选账户显式重试。
- 额度、搜索、图片生成和自动审查会在 token 刷新期间保持同一请求账户。每次额度响应的用量与账户标签来自同一快照；并发切换时，旧快照可能显示到下次刷新，但不会把它的额度标为另一个账户的。
- 如果还有其他账户，移除当前账户时必须选择替代账户；移除最后一个账户即退出登录；**退出所有账户**会删除本地保存的全部 Codex 凭据。
- 请求被拒绝时，Codex Connect 不会自动轮换账户或进行故障切换。

凭据修改最多等待写锁 20 秒，以便正在进行的 token 刷新完成。等待超时会使操作失败，但不会删除其他写入者的锁或更改已保存的账户。进程崩溃遗留的锁需要操作者确认没有写入者运行后再恢复。

请求认证失败时使用固定提示，不包含上游响应正文或嵌套的提供方异常。刷新失败会保留已保存的凭据。

刷新时收到明确的 OAuth `invalid_grant` 拒绝，会显示重新授权提示。网络故障、超时和服务端错误会保留当前账户并显示额度查询错误，供你重试；不会删除凭据或启动新的登录。

GPT Codex 对话的 Composer 会显示 Fast Mode 与额度：

- **Fast Mode** 只为当前对话请求优先服务（`service_tier: 'priority'`）。默认关闭，也不会更换模型。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- **额度条**在已登录时通常每 60 秒刷新一次，只显示服务端实际返回的 `5h` 和 `7d` 窗口，并显示精确剩余百分比与重置时间。`gpt-5.3-codex-spark` 使用独立的 Spark 额度桶。Codex Connect 不会虚构缺失窗口，也不会根据套餐名称隐藏已返回窗口。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选能力

新安装只注册模型提供方，其他能力全部保持关闭：

```yaml
- id: llm-openai-codex
  config:
    enableProxy: false
    enableSearch: false
    enableImageTool: false
    enableImageGeneration: false
    enableAutoReview: false
```

请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑这些选项。修改会暂存到点击 **保存更改** 为止。保存会一次提交所有已编辑字段，并保留其他页面对未编辑字段的修改。发生编辑冲突或保存失败时会保留草稿；放弃草稿可重新加载最新设置。大多数设置只影响本插件；启用 Codex 搜索还会把它选为整个 profile 当前使用的搜索路由。

### 代理

关闭代理或卸载插件时，先给活动代理操作一秒收尾，再销毁本实例的连接池，最多再等待一秒完成。关闭期间拒绝新的代理操作；被中断的请求不会改走直连重试。代理管理器无法强制终止任意应用回调。作用域 dispatcher 会保留至迟到回调结束，防止它们绕过已销毁的代理；无关流量仍使用宿主 dispatcher。

默认使用直连。启用后，不带凭据的 HTTP(S) proxy 只应用于本插件的模型、OAuth、刷新、额度、搜索、图片和自动审查流量。检测只检查标准代理环境变量和文档列出的 loopback 候选地址，不调用模型、不消耗额度，也不保存设置。代理请求失败时，绝不会静默改走直连。加载 Codex Connect 不会替换 Node 的环境代理 dispatcher，因此其他 Harness 请求会继续使用进程已有的代理策略。

### 搜索与图片工具

- `enableSearch: true` 将 Codex 注册为可用搜索提供方，并用于整个 profile 的搜索。关闭时会注销该提供方，并恢复启用 Codex 搜索之前的路由。
- 搜索从认证开始到读完响应共用 30 秒总期限。超过 1 MiB 的响应会被拒绝，失败时会取消尚未读完的响应体。调用方也可以提前取消搜索。
- `enableImageTool: true` 为具备视觉能力的模型注册 `view_image`。远程读取只接受不带凭据的公网 HTTP(S)，并重新检查 DNS 与重定向。
- `enableImageGeneration: true` 注册只接受提示词的 GPT Image 图片生成。使用你当前 GPT 订阅计划提供的图片生成能力。可用性、尺寸和额度仍由账户及服务端控制。

生成的原文件保存在 `$DSH_HOME/dsh-codex-connect/images/v1`；对话会收到另一份 DSH 附件预览。结果卡片会报告尺寸和文件大小，并可下载任一版本。原文件仅允许所有者访问，下载前会校验完整性，并且只对创建会话及继承了该结果的 fork 开放。关闭能力或卸载插件不会自动删除这些文件。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/image-generation.png" alt="包含提示词、下载操作与图片详情的 GPT Image 结果" width="780">
</p>

### 自动审查

`enableAutoReview: true` 允许 Codex reviewer 在 DSH 策略已经判定需要审批后，评估符合条件的 Harness 审批请求。每个 profile 首次启用时都需要确认，因为有界的近期审批上下文、工具参数、工作目录和待执行动作会发送到 `chatgpt.com`；隐藏推理和已保存凭据不会发送。只有完整、结构化的允许结果才能授权一次执行；歧义、格式错误、传输失败和超时都会交还人工审批。完整决策与重试规则见[自动审查](auto-review.zh.md)。

## 路由与配置

安装 Codex Connect 不会选定默认模型或搜索提供方。启用 Codex 搜索后，插件会在该能力保持开启期间选中它；默认模型仍需在确实需要时另行选择。等价配置如下：

```yaml
- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol

- id: llm-openai-codex
  config:
    enableSearch: true
    searchMode: live
    searchContextSize: medium

```

主要插件选项如下：

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `models` | 完整目录 | 可见的 Codex model id；空数组隐藏全部条目 |
| `enableProxy` | `false` | Codex Connect 流量是否使用 `proxyUrl` |
| `proxyUrl` | `http://127.0.0.1:7890` | 不带凭据的 HTTP(S) proxy origin；启用前不生效 |
| `contextWindowOverrides` | 无 | 按模型设置客户端上下文预算 |
| `enableSearch` | `false` | 注册 Codex 搜索，并在保存时将它选为搜索提供方 |
| `enableImageTool` | `false` | 注册 `view_image` |
| `enableImageGeneration` | `false` | 注册 GPT Image 图片生成 |
| `enableAutoReview` | `false` | 使用 Codex 审查符合条件的审批请求 |
| `searchModel` | `gpt-5.6-sol` | 独立搜索使用的模型 |
| `searchMode` | `cached` | `cached`、`indexed` 或 `live` |
| `searchContextSize` | `medium` | `low`、`medium` 或 `high` |
| `searchMaxOutputTokens` | `10000` | 搜索使用的正整数输出预算 |

`contextWindowOverrides` 修改的是客户端预算，不是 OpenAI 服务端容量。未知模型 ID 或超过插件文档配置上限的值会明确失败。将整个字段设为 `null` 可屏蔽继承的全部覆盖值；将单个模型设为 `null` 可恢复其目录默认值，同时保留其他条目。请为输出和协议开销预留空间，并把更大的数值视为特定部署的实验，不能当作账户权限证据。所有权与持久化规则见 [Alpha 设计](design.zh.md)。

## 诊断与恢复

### 本地安装诊断

已发布的 Alpha 4.33 在 DSH `0.1.5-rc.1` 上列出或准备 Codex 模型时，可能报 `Cannot read properties of undefined (reading 'get')`。新宿主要求按模型记录错误的索引，旧插件 profile 没有提供。包含 [Issue #178 修复](https://github.com/franksong2702/dsh-codex-connect/issues/178)的构建会初始化该索引；重新授权不能补齐这个字段。请选择与宿主版本完成验证的精确插件版本，不能仅凭属于同一 Alpha 系列判断。

运行 `dsh plugin --profile web exec dsh-codex-connect doctor --json` 可检查本地安装元数据，不会联网。兼容性状态含义：`compatible` 表示符合声明的版本要求，不是行为测试通过；`unverified` 表示包版本超出声明的支持集合；`unknown` 表示缺少必要版本元数据或无法读取；`incompatible` 表示 Node 版本不满足声明的 engine 要求。汇总状态依次优先采用 `incompatible`、`unknown`、`unverified`。任何非 compatible 结果或不安全的凭据文件元数据都会让 doctor 返回 `1`，但这并不授权或建议更改 DSH。

常规更新卡片只检查 Codex Connect 发布版本。插件版本检查成功后最多缓存 24 小时，页面挂载期间每五分钟重试不可用的检查；手动检查会绕过缓存。它不会查询宿主兼容性，也不会建议升级或降级宿主。未列入记录的 DSH/plugin 组合需要验证，不能据此认定无法运行。

### 能力探针

本地能力报告不发送网络请求。本地凭据有效且调用受支持时，`capabilities --probe` 会发送一条固定短请求，并可能消耗额度。`auto-review-probe` 只检查 OAuth reviewer 路由及结构化响应，不验证完整 Harness 审批集成，也不执行被审查的动作；满足前置条件时，它也可能发起请求并消耗额度：

```sh
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --json
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --probe --json
dsh plugin --profile web exec dsh-codex-connect auto-review-probe --json
```

除非传入 `--proxy <http(s)-origin>`，探针使用直连。`--timeout-ms <1..60000>` 可覆盖 30 秒期限。命令不跟随重定向、不重试，把响应限制在 64 KiB，并且不会刷新凭据。每项结果标为 `supported`、`rejected` 或 `unknown`；仅有模型目录条目不能证明账户权限。返回 `0` 表示该命令要求的检查均为可用，`1` 表示至少一项被拒绝，`2` 表示证据未知或调用无效。报告会省略凭据、account id、路径、proxy origin、response id、header 和生成文本。

### 远程浏览器授权

OAuth 路由默认只接受 loopback 浏览器。如果 DSH 运行在可信网络中的另一台设备，请在 DSH 主机上添加浏览器地址栏中的精确 origin：

```sh
dsh plugin --profile web exec dsh-codex-connect trust-origin http://192.168.1.20:3080
dsh plugin --profile web exec dsh-codex-connect trusted-origins
dsh plugin --profile web exec dsh-codex-connect untrust-origin http://192.168.1.20:3080
```

必须包含协议和端口，不能包含路径、query 或 fragment。不要把 OAuth 路由暴露到公网；网络不可信时请使用 SSH tunnel。Web 客户端只显示这些命令，不会自行修改 allowlist。

origin allowlist 只控制访问 DSH 的权限，不会把 OpenAI 跳转到浏览器设备的 localhost 回调转发给 DSH 主机。不转发 1455 端口时，可这样完成当前登录：

1. 在模型或插件账户设置中点击 **授权**（或 **添加账户**），在打开的浏览器标签页中完成批准。
2. 跳转到 `http://localhost:1455/auth/callback` 后，远程浏览器可能显示连接错误。复制**地址栏中的完整 URL**，包括 query string。不要复制初始授权链接，也不要只复制 code。
3. 返回同一个 DSH 账户界面，展开可选的手动回调表单，将 URL 粘贴到回调 URL 输入框并提交。表单默认收起；原有自动回调登录行为不变。
4. 等待账户状态更新。URL 无效不会取消当前登录，可粘贴本次授权的正确回调并重试。若授权过期或已取消，请重新开始，并使用新流程的回调。刷新 DSH 页面后，可点击 **继续授权** 重新加入仍在等待的登录。

回调必须匹配当前流程的 redirect URI 和 OAuth state；仅 code、缺少或不匹配的 state、重复参数及重复使用的回调都会被拒绝。提交使用现有同源／可信 origin 检查以及大小受限的 JSON POST。插件不会访问、记录或持久化粘贴的 URL，提交时会清空输入。token 仍保存在 DSH 主机上。只应粘贴到此专用输入框：URL 包含短期凭据，不能分享至聊天、issue、日志或配置中。网络不可信时请使用 SSH tunnel；手动回调不代表可以安全地公开无认证的 DSH 服务，也不会放宽 origin 策略。

### 迁移与冲突

如果启动报告 `openai-codex` 冲突，请检查有效配置，只移除已经确认的旧 `dsh-codex` bundle 或手动 provider 条目。不要删除凭据或无关 provider。包迁移及 Alpha 4.10 搜索历史修复见 [MIGRATION.md](../MIGRATION.md)。

OAuth 单独保存在 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`）；`~/.codex/auth.json` 绝不会被复制或修改。移除包不会删除 OAuth 状态。只有确实要删除凭据时才运行 `logout`。
