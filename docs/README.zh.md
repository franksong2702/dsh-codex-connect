# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 把你的 ChatGPT 订阅接入 DeepSeek Harness，并提供可选的 GPT Image 图片生成、由用户控制的默认设置、Harness 原生审批、诊断与可靠的会话恢复。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 为 DeepSeek Harness 接入 ChatGPT OAuth" width="100%">
</p>

Codex Connect 为 DeepSeek Harness 添加 ChatGPT OAuth 和 `openai-codex` 模型提供方。所选模型仍运行在标准 Harness agent loop 中，因此工具、权限、审批提示、附件、会话持久化、压缩与恢复继续由 Harness 管理。

插件采用增量安装：不会替换默认模型或全局搜索提供方。搜索、`view_image`、GPT Image 图片生成和自动审查均需显式开启。它不会把 ChatGPT 订阅变成 OpenAI Platform API Key。

## 主要能力

- 从 **设置 → 模型** 登录 ChatGPT，管理最多 16 个本地保存的账户，并选择后续请求使用的账户。
- 读取已安装的上游 Codex 模型目录；如果目录尚未包含 `gpt-6-astra`，Codex Connect 会补充兼容元数据，上游一旦提供同名模型便原样优先使用上游定义。
- 为 GPT Codex 对话显示会话级 Fast Mode，以及服务端返回的 `5h` 和 `7d` 额度窗口。
- 将当前 DSH/plugin 组合与公开兼容性记录比较，只给出更新指引，不执行升级。
- 可选接入 Codex 搜索、安全的本地或公网图片查看、GPT Image 图片生成和 Codex 自动审查。
- 无需打印凭据或启动 OAuth 即可诊断安装状态。

发现模型不等于账户获得权限。OpenAI 会在每次请求时判断所选账户能否使用该模型；无权限时请求会明确失败，Codex Connect 不会静默切换模型或账户。

## 快速开始

下面的命令是 DSH `0.1.2-rc.1` 已验证的公开组合。请先运行 `dsh --version`；其他 DSH 版本请查阅 [INSTALL.md](../INSTALL.md)。`alpha` 是会移动的 npm tag，不代表兼容性保证。本 README 描述当前 `main`；在所示包版本之后合入的改动，要等下一次 Alpha 发布才会进入公开包。

### 1. 安装一个精确版本

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.27
```

将 `web` 替换为你正在使用的 profile 名。从 DeepSeek Harness 源码 checkout 执行时，请在命令前加 `pnpm`。安装后，profile 的默认模型和搜索路由必须保持不变。

### 2. 启动 Harness 并授权

```sh
dsh web
```

打开 **设置 → 模型 → Openai-Codex**，点击 **授权**，然后亲自在浏览器中完成批准。如果内嵌窗口被拦截，请用 **打开 ChatGPT 登录页面** 在系统浏览器中继续。

不要把授权 URL、code、token 或账户标识粘贴到 issue、日志、聊天或配置文件中。

### 3. 选择模型

在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。所有界面语言均保留模型的规范名称。若要缩短列表，请打开 **更多设置 → 模型**；隐藏模型只影响发现，不会禁用按精确 ID 路由。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/model-selector.jpg" alt="DeepSeek Harness 模型选择器中的 OpenAI Codex 模型" width="360">
</p>

### 4. 验证安装

```sh
dsh --profile web --dump-config
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

有效配置应当恰好包含一条 `llm-openai-codex`。已登录时 `status --json` 返回 `0`；未登录时返回 `1`，但不会启动 OAuth。`doctor --json` 输出一份不含敏感信息的诊断文档。

## 账户、模型与额度

“模型”卡片和“插件配置”页面共享同一份账户状态。**管理账户**可以添加、选择或移除账户。浏览器响应只会包含插件生成的账户 key 和脱敏标签，不会暴露 OAuth token 或原始 OpenAI account id。

- 添加账户期间，当前账户仍可继续使用。
- 取消新的授权或等待超时，不会删除任何已有账户。待处理授权默认 10 分钟后过期；`oauthTimeoutMs` 接受 1,000–1,800,000 毫秒，并在插件加载时应用。
- 切换账户只影响后续请求。每个请求会在解析认证前固定当前账户，因此并发切换不会混用凭据。
- 如果还有其他账户，移除当前账户时必须选择替代账户；移除最后一个账户即退出登录；**退出所有账户**会删除本地保存的全部 Codex 凭据。
- 请求被拒绝时，Codex Connect 不会自动轮换账户或进行故障切换。

GPT Codex 对话的 Composer 会显示两个会话级控件：

- **Fast Mode** 只为当前对话请求更快的 `1.5×` 模式。默认关闭，也不会更换模型。
- **额度条**只显示服务端实际返回的 `5h` 和 `7d` 窗口，并显示精确剩余百分比与重置时间。`gpt-5.3-codex-spark` 使用独立的 Spark 额度桶。Codex Connect 不会虚构缺失窗口，也不会根据套餐名称隐藏已返回窗口。

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

请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑这些选项。修改会暂存到点击 **保存更改** 为止。大多数设置只影响本插件；启用 Codex 搜索还会把它选为整个 profile 当前使用的搜索路由。

### 代理

默认使用直连。启用后，不带凭据的 HTTP(S) proxy 只应用于本插件的模型、OAuth、刷新、额度、搜索、图片和自动审查流量。检测只检查标准代理环境变量和文档列出的 loopback 候选地址，不调用模型、不消耗额度，也不保存设置。代理请求失败时，绝不会静默改走直连。加载 Codex Connect 不会替换 Node 的环境代理 dispatcher，因此其他 Harness 请求会继续使用进程已有的代理策略。

### 搜索与图片工具

- `enableSearch: true` 将 Codex 注册为可用搜索提供方，并用于整个 profile 的搜索。关闭时会注销该提供方，并恢复启用 Codex 搜索之前的路由。
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

### 能力探针

本地报告不发送网络请求。增加 `--probe` 后会发送一条固定短请求，并可能消耗额度：

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

### 迁移与冲突

如果启动报告 `openai-codex` 冲突，请检查有效配置，只移除已经确认的旧 `dsh-codex` bundle 或手动 provider 条目。不要删除凭据或无关 provider。包迁移及 Alpha 4.10 搜索历史修复见 [MIGRATION.md](../MIGRATION.md)。

OAuth 单独保存在 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`）；`~/.codex/auth.json` 绝不会被复制或修改。移除包不会删除 OAuth 状态。只有确实要删除凭据时才运行 `logout`。

## 兼容性与安全

- [verified-compatibility.json](../verified-compatibility.json) 是精确 DSH/plugin 组合的权威记录。请遵循 [INSTALL.md](../INSTALL.md)，不要根据当前记录推断未来兼容性。
- 缺少兼容性记录只表示组合尚未验证，不表示已知不可运行。更新提醒会说明已有升级路径，但绝不会自动安装。
- ChatGPT 套餐资格、模型权限、额度、服务端上下文容量和服务行为均由 OpenAI 控制，并可能变化。
- shell、文件系统、skills、MCP、subagents、审批、权限、附件、会话持久化、压缩和恢复继续由 Harness 负责。
- 安装、构建、测试、`doctor` 和包验证均不需要执行真实 OAuth。
- 这是社区 Alpha 项目，与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

## 项目文档

- [安装与升级](../INSTALL.md)
- [从 `dsh-codex` 迁移](../MIGRATION.md)
- [架构与安全细节](design.zh.md)
- [自动审查行为](auto-review.zh.md)
- [Alpha 发布运行手册](../RELEASING.md)

## 开发

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## 许可证与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。
