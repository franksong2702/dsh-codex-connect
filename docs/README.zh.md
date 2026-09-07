# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 把你的 ChatGPT 订阅接入 DeepSeek Harness，并提供可选的 GPT Image 图片生成、由用户控制的默认设置、Harness 原生审批、诊断与可靠的会话恢复。

社区 Alpha 项目——与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

Codex Connect 为标准 Harness agent loop 添加 `openai-codex` 模型提供方。工具、权限、审批、附件、会话持久化、压缩与恢复继续由 Harness 管理。安装插件不会改变默认模型或搜索路由，也不会把 ChatGPT 订阅变成 OpenAI Platform API Key。

## 快速开始

本指南介绍下方已发布的组合。请先运行 `dsh --version`；其他 DSH 版本请查阅[安装与升级](../INSTALL.md)。`alpha` 等会移动的 npm tag 不代表兼容性保证。

| 要求 | 已验证组合 |
|---|---|
| Codex Connect | `0.1.0-alpha.4.29` |
| DeepSeek Harness | `0.1.2-rc.1` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| 账户 | 通过 ChatGPT OAuth 使用所请求的 Codex 模型；可用性由 OpenAI 决定 |

### 1. 安装

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.29
dsh web
```

将 `web` 替换为正在使用的 profile 名，启动 Harness 时也使用同一个 profile。从 DSH 源码 checkout 执行时，请在命令前加 `pnpm`。其他 profile 的用法和安装检查见 [INSTALL.md](../INSTALL.md)。

### 2. 授权并选择模型

打开 **设置 → 模型 → Openai-Codex → 授权**，然后亲自在浏览器中完成批准。如果内嵌窗口被拦截，请用 **打开 ChatGPT 登录页面**。在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。

不要把授权 URL、code、token 或账户标识粘贴到 issue、日志、聊天或配置文件中。在另一台设备上使用浏览器时，请遵循[远程浏览器授权](reference.zh.md#远程浏览器授权)说明。

### 3. 检查安装

```sh
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

`status --json` 在已登录时返回 `0`，未登录时返回 `1`，不会启动 OAuth。`doctor --json` 输出本地安装诊断，不发送网络请求，也不包含原始凭据。诊断通过不代表账户具有模型权限；实际可用性仍需通过真实请求验证。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 为 DeepSeek Harness 接入 ChatGPT OAuth" width="100%">
</p>

## 核心能力

- **账户：**在 DSH 主机上保存最多 16 个账户，手动选择后续请求使用的活动账户，不按会话绑定。请求保持已固定的账户，插件不会自动轮换或静默故障切换。
- **模型与 Astra 支持：**当前已验证的 DSH 与插件组合已支持 `gpt-6-astra`。插件为当前依赖目录尚未收录的 Astra 补充了模型定义，让用户无需单独升级底层库即可选择该模型。未来使用的依赖目录包含 Astra 时，插件会优先采用其原生定义。模型出现在列表中，不代表当前账户具有调用权限；新依赖版本的整体兼容性仍需单独验证。
- **Fast Mode：**为单个对话请求优先服务，默认关闭。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- **额度：**显示服务端返回的 `5h`、`7d` 窗口及重置时间，已登录时通常每 60 秒刷新一次。不虚构缺失窗口；Spark 使用独立额度桶。
- **更新指引：**将已安装的 DSH/plugin 组合与公开验证记录比较，但不会自动执行升级。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选能力

以下选项在新安装时全部关闭。请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑，再点击 **保存更改**。发生冲突或保存失败时会保留草稿。

| 能力 | 启用字段 | 重要行为 |
|---|---|---|
| 代理 | `enableProxy` | 不带凭据的 HTTP(S)，只作用于本插件流量。代理请求失败不会静默改走直连。 |
| Codex 搜索 | `enableSearch` | 将整个 profile 的搜索路由切换为 Codex；关闭后恢复之前的路由。 |
| 图片查看 | `enableImageTool` | 为视觉模型添加 `view_image`，读取本地文件和经过校验的公网 HTTP(S) 图片。 |
| GPT Image 图片生成 | `enableImageGeneration` | 只接受提示词；可用性、尺寸和额度仍由账户及服务端控制。 |
| 自动审查 | `enableAutoReview` | 将有界的审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`，首次启用需要确认。失败时交还人工审批。 |

使用你当前 GPT 订阅计划提供的图片生成能力。生成原文件与附件预览分开保存；关闭能力或卸载插件不会删除这些文件。存储和访问规则见[配置与恢复](reference.zh.md#搜索与图片工具)。

自动审查在 Harness 策略判定需要审批后执行，不会绕过该策略。启用前请阅读[自动审查行为](auto-review.zh.md)。

## 常见问题与重要限制

### 凭据保存在哪里？

OAuth 凭据保存在运行 DSH 的主机上，由该主机用于向 OpenAI 认证和发起请求。正常浏览器账户响应只返回账户摘要，不返回原始 token。远程浏览器设备不一定是 DSH 主机。

### 卸载插件会退出登录吗？

不会。OAuth 状态单独保存在 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`），插件不会复制或修改 `~/.codex/auth.json`。只有确实要删除凭据时，才使用 **退出所有账户**，或在卸载前运行 `logout`。

### 可以给不同对话分别切换账户吗？

后续 Codex 请求使用所选活动账户，每个对话不会各自绑定账户。Fast Mode 才是会话级设置。取消新的授权会保留已有账户；明确的刷新凭据撤销响应会提示重新授权，临时故障则保留账户供重试。详见[账户行为](reference.zh.md#账户模型与额度)。

### 为什么列表中的模型调用失败？

账户权限、插件与宿主兼容性、网络条件都会影响可用性。其他客户端可以使用，不代表此集成一定可用。OpenAI 控制模型权限、额度、上下文容量和服务行为；目录条目不是账户权限证明。

### 可以保留原来的 `dsh-codex` 插件吗？

不能在同一份有效配置中并存：两者都会注册 `openai-codex`。请遵循 [MIGRATION.md](../MIGRATION.md)，只移除已经确认冲突的条目，不删除凭据或无关提供方。

### 诊断能证明什么？

`doctor` 只做本地检查。能力与 reviewer 探针在满足前置条件时可能联网并消耗额度。`auto-review-probe` 只检查 reviewer 路由和结构化响应，不验证完整 Harness 审批集成，也不执行被审查的动作。命令、限制与退出码见[诊断参考](reference.zh.md#能力探针)。

[verified-compatibility.json](../verified-compatibility.json) 缺少某个 DSH/plugin 组合，只表示尚未验证，不表示已知不可运行。不要根据旧组合推断新版宿主支持情况。

## 文档与开发

- [安装与升级](../INSTALL.md)
- [配置、诊断与恢复](reference.zh.md)
- [从 `dsh-codex` 迁移](../MIGRATION.md)
- [架构与安全细节](design.zh.md)
- [自动审查行为](auto-review.zh.md)
- [发布运行手册](../RELEASING.md)、[贡献指南](../CONTRIBUTING.md)和[安全政策](../SECURITY.md)

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-install
```

`check` 包含静态检查、单元测试、构建、兼容性和打包检查；浏览器回归与隔离 DSH 安装是另外两个命令。这些检查不使用真实 OAuth 授权，也不能替代真实账户验收。

## 许可证与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。
