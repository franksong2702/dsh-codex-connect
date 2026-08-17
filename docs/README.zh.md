# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 将你的 ChatGPT 订阅连接到 DeepSeek Harness，同时保留用户自主默认项、Harness 原生审批、非敏感诊断和可靠的会话恢复。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 通过 ChatGPT OAuth 连接 DeepSeek Harness" width="100%">
</p>

`dsh-codex-connect` 提供 `openai-codex` 模型目录和独立的 ChatGPT OAuth 登录。模型仍走 Harness 标准 LLM 服务，因此流式输出、工具调用、reasoning replay、压缩、文件系统控制、权限门禁和审批提示仍由 Harness 负责。ChatGPT 订阅不会因此变成 OpenAI Platform API 凭据。

安装是增量的：bundle 不会替换当前主模型或搜索路由；独立搜索提供方和 `view_image` 工具也默认关闭，必须显式开启。

本中文指南中的 UI 截图均来自中文本地化的 Harness 界面；[English 版](../README.md) 使用同一状态的英文截图。模型与提供方标识保留其规范拼写，不随界面语言翻译。

## 五分钟快速开始

本指南使用 `web` profile。请把 `web` 替换成你已经在用的 Harness profile 名称。你需要先有可用的 `dsh` 安装；如果在 DeepSeek Harness 源码 checkout 中运行，请在命令前加 `pnpm`。

### 1. 将插件装入一个 profile

```sh
dsh plugin --profile web add dsh-codex-connect@alpha
```

预期结果：包被加入该 profile。这个动作不会更改 profile 的默认模型或全局搜索路由。

如需精确复现这个版本，使用 `dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.7`。对应 GitHub prerelease 已创建但 npm 不可用时，可使用 `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.7'`。本地 checkout 可安装为 `link:/absolute/path/to/dsh-codex-connect`。

### 2. 启动 Harness

```sh
dsh web
```

预期结果：所选 profile 的 Harness Web UI 打开。

### 3. 找到 Codex Connect 卡片

打开 **设置 → 插件 → 插件配置 → Codex Connect**。

预期结果：新安装时账户区显示 **尚未登录**，并出现 **使用 ChatGPT 登录** 按钮。之后管理可选能力也在同一张卡片中完成。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/plugin-entry.jpg" alt="Harness 插件配置中的中文 Codex Connect 折叠入口" width="720">
</p>

### 4. 使用 ChatGPT 登录

点击 **使用 ChatGPT 登录**，并自行完成浏览器审批。不要把授权 URL、授权码、token 或账户标识复制到 Issue、日志或配置文件中。

预期结果：账户区变为 **已登录**。下图展示的是完成本步骤后的成功状态，不是开始登录前的页面。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/oauth-status.jpg" alt="Harness 插件配置中的中文 Codex Connect 已登录状态" width="720">
</p>

### 5. 选择模型并做一次安全检查

打开 Harness 原生模型选择器，为当前正在使用的 agent 或会话选择一个 `openai-codex` 模型。这个选择与写入 profile 的默认模型或全局搜索路由是两件事。

选择器会把可用项归在 **OpenAI Codex** 下。`GPT-5.6 Luna` 一类模型标识是规范名称，因此会保留原样，不翻译。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/model-selector.jpg" alt="中文 DeepSeek Harness 模型选择器中的 OpenAI Codex 模型分组" width="360">
</p>

如需在本机确认插件配置行，运行：

```sh
dsh --profile web --dump-config
```

预期结果：配置中恰好有一条 `llm-openai-codex`。请只在本机查看这份配置输出，它可能包含无关的 profile 设置。

如需不启动 OAuth 的非敏感状态和诊断输出，运行：

```sh
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

预期结果：`status --json` 报告 `signed-in` 并以 `0` 退出，`doctor --json` 只输出一条非敏感 JSON。尚未登录时 `status --json` 会以 `1` 退出；回到第 4 步登录即可，不要把它当作插件故障。

## 可选能力（默认关闭）

安装后的 bundle 只注册模型提供方，默认不额外启用任何能力：

```yaml
- id: llm-openai-codex
  config:
    enableSearch: false
    enableImageTool: false
```

打开 **设置 → 插件 → 插件配置 → Codex Connect**，即可在同一张卡片中管理账户和这些选项。**保存更改**只影响本插件的能力配置并即时生效，绝不会选择默认模型或全局搜索路由。

### 只开启你准备使用的能力

- `enableSearch: true` 会把 Codex 注册为可选择的搜索提供方，不会把它选为 profile 的全局搜索路由。
- `enableImageTool: true` 会为具备视觉能力的模型启用 `view_image`，用于审批后的本地读取和公网图片获取。

下图是有人显式开启能力之后的配置示例，不是新安装的默认状态。本中文指南使用中文本地化截图；English 版展示同一状态的英文截图。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/plugin-configuration.jpg" alt="中文 Codex Connect 显式开启可选能力后的配置示例" width="720">
</p>

### 单独更改默认模型或全局搜索路由

如需把 Codex 模型设为新 agent 的默认模型，需要自行添加或修改独立的 Harness 配置项：

```yaml
- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

如需把 Codex 选为 profile 的全局搜索路由，还需要另做一次显式配置：

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
    searchMode: live
    searchContextSize: medium

- id: web
  config:
    searchProvider: openai-codex
```

| 字段 | 默认值 | 可选值 |
|---|---:|---|
| `enableSearch` | `false` | boolean |
| `enableImageTool` | `false` | boolean |
| `searchModel` | `gpt-5.6-sol` | Codex model id |
| `searchMode` | `cached` | `cached`、`indexed`、`live` |
| `searchContextSize` | `medium` | `low`、`medium`、`high` |
| `searchMaxOutputTokens` | `10000` | 正整数 |

## 重新登录、诊断与冲突

- 卡片显示 **重新登录**，或服务端要求重新认证时，点击该操作并完成同一套安全的浏览器流程。它会保留本插件的能力配置，不会偷偷改动默认模型或全局搜索路由。不要为了刷新会话而运行 `logout`。
- `doctor` 只读取进程与文件系统元数据。`doctor --json` 只输出一条可解析的非敏感 JSON，包含 schema version 1、包/版本/Node 信息、认证文件状态与安全 mode、能力、冲突状态和提示；它省略认证文件绝对路径以及 OAuth、账户和过期时间信息。
- `status --json` 只输出 signed-in 或 signed-out 状态及包元数据。它只为判断登录态读取认证文件，但不会输出认证文件内容或启动 OAuth。
- OAuth 单独存储于 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`）。`~/.codex/auth.json` 不会被复制或修改。支持的平台上，父目录与文件使用仅所有者可访问权限；写入采用原子替换，刷新写入使用跨进程文件锁。
- 默认情况下，OAuth 路由只接受 loopback 浏览器请求。当 DSH 在一台设备运行，而你从可信网络中的另一台设备打开 DSH 时，请在运行 DSH 的设备上显式批准浏览器地址栏中的 origin：

  ```sh
  dsh plugin --profile web exec dsh-codex-connect trust-origin http://192.168.1.20:3080
  dsh plugin --profile web exec dsh-codex-connect trusted-origins
  dsh plugin --profile web exec dsh-codex-connect untrust-origin http://192.168.1.20:3080
  ```

  将示例替换为浏览器地址栏中的精确 origin，包括协议和端口；不要填写当前访问设备的 IP、裸主机、路径、query 或 fragment。只在你信任的网络中使用，不要把该路由暴露到公网；不适合显式信任网络时，请使用 SSH tunnel。浏览器页面只会显示并复制这条命令，不会自行修改授权列表。
- 启动报告 `openai-codex` 冲突时，旧 `dsh-codex` bundle 或手动 provider 配置可能已占用该 adapter。先检查有效配置，只移除已确认的冲突所有者。不要删除认证文件或无关 provider。
- 移除包不会删除 OAuth 状态；只有确实需要删除凭据时才运行 `logout`。

## 兼容性与安全边界

- 当前唯一已验证的兼容组合是 DSH 插件 API packages `0.1.0-rc.6`、`@earendil-works/pi-ai` `0.82.1` 和 Node.js `^22.19.0 || >=24.0.0`；详见 [compatibility.json](../compatibility.json)。
- 升级时请将 DSH 插件 API packages 与 `@earendil-works/pi-ai` 作为一组升级，再运行 `dsh-codex-connect doctor --json` 和兼容性检查。本契约不对未来版本作判断。
- ChatGPT 套餐资格、模型权限、额度和后端行为由 OpenAI 控制，可能变化。
- Codex 端点不会强制普通 Responses 的 `max_output_tokens` 字段。Harness 压缩仍可工作，但这个摘要上限不能由服务端在该路由上强制。
- shell、文件系统、skills、MCP、subagents、审批、权限、附件、会话持久化、压缩与恢复继续由当前 Harness profile 提供。
- 远程 `view_image` 只允许公共 HTTP(S) 目标；每一次 DNS 结果与重定向都会重新检查，并将连接固定到已验证地址，从而阻止 localhost、私网、link-local 服务和云元数据地址。
- 安装、构建、测试、doctor 和包内容验证均不需要真实 OAuth。

详见 [安装运行手册](../INSTALL.md)、[Alpha 发布清单](../RELEASING.md)、[MIGRATION.md](../MIGRATION.md) 与 [架构说明](design.zh.md)。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## 发布

维护者通过[手动 OIDC 发布 workflow](../.github/workflows/release.yml)发布 Alpha；`latest` 的独立短期提升步骤见 [Alpha 发布清单](../RELEASING.md)。

## 法律与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。本项目与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

## 许可证

Apache-2.0
