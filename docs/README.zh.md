# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 将你的 ChatGPT 订阅连接到 DeepSeek Harness，同时保留用户自主默认项、Harness 原生审批、非敏感诊断和可靠的会话恢复。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/hero.jpg" alt="Codex Connect — 通过 ChatGPT OAuth 连接 DeepSeek Harness" width="100%">
</p>

`dsh-codex-connect` 提供 `openai-codex` 模型目录和独立的 ChatGPT OAuth 登录。模型仍走 Harness 标准 LLM 服务，因此流式输出、工具调用、reasoning replay、压缩、文件系统控制、权限门禁和审批提示仍由 Harness 负责。ChatGPT 订阅不会因此变成 OpenAI Platform API 凭据。

安装是增量的：bundle 不会替换当前主模型或搜索路由；独立搜索提供方和 `view_image` 工具也默认关闭，必须显式开启。

## 在 Harness 中的样子

在 **设置 → 插件 → 插件配置 → Codex Connect** 中登录并管理插件。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/oauth-status.jpg" alt="Harness 插件配置中的 Codex Connect ChatGPT OAuth 状态" width="720">
</p>

Codex 搜索与 `view_image` 都是显式、按 profile 控制的可选能力：

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/plugin-configuration.jpg" alt="DeepSeek Harness 中的 Codex Connect 可选能力设置" width="720">
</p>

Codex 模型会和现有提供方一起出现在 Harness 原生模型选择器中：

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/model-selector.jpg" alt="DeepSeek Harness 模型选择器中的 OpenAI Codex 模型" width="320">
</p>

## 安装

```sh
dsh plugin --profile web add dsh-codex-connect@alpha
dsh web
```

如需精确固定此版本，使用 `dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.5`。若 npm 不可用，可使用 GitHub tag 兜底：`dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.5'`。在 DeepSeek Harness 源码 checkout 中运行时，在命令前加 `pnpm`。本地开发可安装 `link:/absolute/path/to/dsh-codex-connect`。

可在 **设置 → 插件 → 插件配置 → Codex Connect → 使用 ChatGPT 登录**，也可使用 CLI：

```sh
dsh plugin --profile web exec dsh-codex-connect login
dsh plugin --profile web exec dsh-codex-connect status
dsh plugin --profile web exec dsh-codex-connect doctor
```

`doctor` 只读取进程与文件系统元数据，不打开 OAuth 文件，也不会输出 token、授权 URL、授权码、账户 ID 或认证文件内容。

## 显式配置

打开 **设置 → 插件 → 插件配置 → Codex Connect**，可以在同一张卡片中管理 ChatGPT 账户和可选能力。更改通过 Harness 带 revision 防护的设置存储保存，并即时生效；**保存更改**只影响本插件的能力配置，绝不会选择默认模型或全局搜索路由。

安装后的 bundle 行仍是 composition base，只注册模型提供方，不改变路由：

```yaml
- id: llm-openai-codex
  config:
    enableSearch: false
    enableImageTool: false
```

如需把 Codex 模型设为新 agent 的默认模型，需要自行添加或修改 Harness 的独立配置项：

```yaml
- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

卡片可以启用 Codex 独立搜索；如需把它选为 profile 的全局搜索提供方，仍需单独显式配置：

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

如需图片加载工具，在 `llm-openai-codex` 上设置 `enableImageTool: true`。浏览器粘贴/拖放属于 Harness 附件能力，不依赖该工具。

## 凭据、诊断与冲突

- OAuth 单独存储于 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`），不会复制或修改 `~/.codex/auth.json`。
- 支持的平台上，父目录与文件使用仅所有者可访问权限；写入采用原子替换，刷新写入使用跨进程文件锁。
- 状态和诊断只返回非敏感信息；OAuth 交互只会由显式 `login` 操作触发。
- 浏览器 OAuth 路由只接受 loopback 客户端和 loopback Host/Origin；30 秒内没有得到有效的 HTTPS 授权地址时会安全失败，不会一直挂起。
- 两个 adapter 不能同时占用 `openai-codex`。旧 `dsh-codex` bundle 或手动 provider 配置冲突时，启动会给出明确迁移提示。
- 移除包不会删除 OAuth 状态；只有确实需要删除凭据时才运行 `logout`。

## 兼容性与安全边界

- Alpha 面向当前 Harness `0.1.0-rc.5` 主线组合与兼容的 `0.1.0-rc.6` 插件 API、Node.js `^22.19.0 || >=24.0.0` 和固定版本的 `@earendil-works/pi-ai` Codex provider。
- ChatGPT 套餐资格、模型权限、额度和后端行为由 OpenAI 控制，可能变化。
- shell、文件系统、skills、MCP、subagents、审批、权限、附件、会话持久化、压缩与恢复继续由当前 Harness profile 提供。
- 远程 `view_image` 只允许公共 HTTP(S) 目标；每一次 DNS 结果与重定向都会重新检查，并将连接固定到已验证地址，从而阻止 localhost、私网、link-local 服务和云元数据地址。
- 安装、构建、测试、doctor 和包内容验证均不需要真实 OAuth。

详见 [安装运行手册](../INSTALL.md)、[Alpha 发布清单](../RELEASING.md)、[MIGRATION.md](../MIGRATION.md) 与 [架构说明](design.zh.md)。

## 法律与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。本项目与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

## 许可证

Apache-2.0
