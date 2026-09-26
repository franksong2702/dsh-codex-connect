# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 把你的 ChatGPT 订阅接入 DeepSeek Harness，并提供可选的 GPT Image 图片生成与编辑、由用户控制的默认设置、Harness 原生审批、诊断与可靠的会话恢复。

社区 Alpha 项目——与 OpenAI、ChatGPT、Codex、DeepSeek 或 DeepSeek Harness 不存在隶属关系，也未获得其背书。

Codex Connect 为标准 Harness agent loop 添加 `openai-codex` 模型提供方。工具、权限、审批、附件、会话持久化、压缩与恢复继续由 Harness 管理。安装插件不会改变默认模型或搜索路由，也不会把 ChatGPT 订阅变成 OpenAI Platform API Key。

## 快速开始

本指南介绍下方已发布的组合。请先运行 `dsh --version`，再用 `doctor --json` 做本地诊断；单凭 CLI 版本无法证明实际安装的模型运行库版本，缺少版本元数据时会报告未知。其他版本请查阅[安装与升级](../INSTALL.md)。`alpha` 等会移动的 npm tag 不代表兼容性保证。

| 要求 | 已验证组合 |
|---|---|
| Codex Connect | `0.1.0-alpha.4.50` |
| DeepSeek Harness | `0.1.7-rc.1` 或 `0.1.7-rc.2`（包版本必须一致） |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| 账户 | 通过 ChatGPT OAuth 使用所请求的 Codex 模型；可用性由 OpenAI 决定 |

截至 2026-09-26，npm `alpha` 指向 4.50，`latest` 仍为 4.47；本次发布没有提升 `latest`。安装此 DSH 组合请使用下方精确版本命令；会移动的 npm tag 不保证其他宿主版本的兼容性。

该安装包已通过原版 DSH `0.1.7-rc.1` 和 `0.1.7-rc.2` 的安装及运行回归验证；Task 控件仍暂停：激活请求会被拒绝，新 Session 不显示这些控件。跨 Harness 升级迁移旧任务授权尚未验证。较旧组合及其任务行为见[安装与升级](../INSTALL.md)。

### 1. 安装

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.50
dsh web
```

将 `web` 替换为正在使用的 profile 名，启动 Harness 时也使用同一个 profile。从 DSH 源码 checkout 执行时，请在命令前加 `pnpm`。其他 profile 的用法和安装检查见 [INSTALL.md](../INSTALL.md)。

### 2. 授权并选择模型

打开 **设置 → 模型 → Openai-Codex → 授权**，然后亲自在浏览器中完成批准。如果内嵌窗口被拦截，请用 **打开 ChatGPT 登录页面**。在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。

不要把授权 URL、code、token 或账户标识粘贴到 issue、日志、聊天或配置文件中。在另一台设备上使用浏览器时，可通过默认收起的手动回调表单完成当前登录，无需转发 localhost 回调端口；请遵循[远程浏览器授权](reference.zh.md#远程浏览器授权)说明。

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
- **模型与 Astra 支持：**当前已验证的 DSH 与插件组合已支持 `gpt-6-astra`。插件补充缺失的模型定义，提供 Low、Medium、High、Xhigh 和 Max 五档推理强度；Default 保持提供方默认值。已保存的 Off/Minimal 选择需要[明确更新](../MIGRATION.md#astra-reasoning-selections)。安装的依赖目录包含 Astra 时，插件保留其原生元数据，同时维持这五档已校准的推理选择。模型出现在列表中，不代表当前账户具有调用权限；新依赖版本的整体兼容性仍需单独验证。
- **Fast Mode：**为单个对话请求优先服务，默认关闭。可分别为新建主对话和新建子代理对话启用默认值，不改变已有对话。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- **额度：**显示服务端返回的 `5h`、`7d` 窗口及重置时间，已登录且标签页可见时通常每 60 秒刷新一次；失败后延长重试间隔。不虚构缺失窗口；Spark 使用独立额度桶。
- **插件更新：**检查 Codex Connect 新版本，不自动安装，也不建议更改 DSH。宿主兼容性信息通过主动运行的本地诊断查看。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选能力

**较早的 Alpha 4.40/4.41 组合：**任务级模型安排默认关闭。用户明确授予任务权限后，由 GPT-5.6 Sol／Medium 起步；当前模型可以在授权范围内继续、调档或交接主任务。请求共用同一任务账本与预算；停止、手动接管和重启恢复都保留授权边界。Phase 2 的只读委派需要单独同意，不会给委派工作者写入权限。原版 DSH `0.1.7-rc.1` 配合 Alpha 4.43 时，这些 Task 控件仍暂停；不能从旧组合推断它们可用。参见 [Phase 1](experiments/adaptive-task-phase1.md) 与 [Phase 2 同意边界](experiments/adaptive-task-phase2-consent.md)。

Alpha 4.40 还会在旧提供方目录缺失时补充 `gpt-6-sol` 和 `gpt-6-luna`，已有原生定义时保留其元数据。两者提供 Low 到 Max（含 Xhigh），Default 不指定推理档位；尚未实现 Codex Sol 的 Ultra 编排模式。新任务可明确授权使用它们，但已有授权、GPT-5.6 Sol／Medium 起步与 Luna Reserve 不变。模型出现在目录中不代表账户具有调用资格。参见[兼容范围与验证](experiments/gpt6-sol-luna-compatibility.md)。

以下选项在新安装时全部关闭。请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑，再点击 **保存更改**。发生冲突或保存失败时会保留草稿。

| 能力 | 启用字段 | 重要行为 |
|---|---|---|
| 代理 | `enableProxy` | 不带凭据的 HTTP(S)，只作用于本插件流量，包括压缩的 OAuth 和额度响应；无关的 Fetch 请求仍使用宿主原来的传输方式。代理请求失败不会静默改走直连。 |
| Codex 搜索 | `enableSearch` | 将整个 profile 的搜索路由切换为 Codex；关闭后恢复之前的路由。 |
| Luna Reserve | `enableReserveFallback` | 只在服务端为当前已固定账户明确授权时使用隐藏的 Reserve 路由；不修改全局默认模型，也不因普通 `429` 重试。 |
| 图片查看 | `enableImageTool` | 为视觉模型添加 `view_image`，读取本地文件和经过校验的公网 HTTP(S) 图片。 |
| GPT Image 图片生成与编辑 | `enableImageGeneration` | 根据提示词生图，或编辑明确选定的会话图片并使用有顺序的参考图；可用性、尺寸和额度仍由账户及服务端控制。 |
| 自动审查 | `enableAutoReview` | 将有界的审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`，首次启用需要确认。失败时交还人工审批。 |

**已发布的实验功能：** Alpha 4.35 包含 Luna Reserve 回退，仍默认关闭。真实账户进入 Reserve 及恢复普通模型的过程仍未验证；Alpha 4.34 不包含该功能。

启用 `enableReserveFallback: true` 后，账户 UI 和 agent 路由共用一份绑定身份的额度状态，最近有使用需求时按服务端返回的额度窗口后台刷新；有效状态可跨 agent step 复用。普通额度读取也共用缓存，即使 Reserve 已关闭。只有身份完整、非 FedRAMP 且服务端授权时，插件才进入 `gpt-reserve`；普通额度确认恢复后，切回该会话先前的模型和推理强度。Reserve 有自己的额度，不出现在模型选择器中，也不是无限额度。资格由服务端决定，重置时间本身不授权切换。当前版本只支持已知的 `gpt-5.6-luna` 元数据。刷新、身份和验证限制见 [Luna Reserve 回退](reference.zh.md#luna-reserve-回退)。

使用你当前 GPT 订阅计划提供的图片生成能力。成功生成的图片会显示在对话回复下方，无需展开处理过程；原工具卡片仍保留在处理过程里。生成原文件与附件预览分开保存；关闭能力或卸载插件不会删除这些文件。存储和访问规则见[配置与恢复](reference.zh.md#搜索与图片工具)。

Alpha 4.49 修复了 4.48 中重新上传的副本与历史原图混淆、以及安全失败原因未显示的问题。输入有歧义时要求明确选择，不会静默更换编辑对象。旧安装包保持不变；Alpha 4.50 保留这两项修复，并在继续支持 rc.1 的同时增加精确的 DSH rc.2 兼容。不要混装 rc.1／rc.2 的包，也不要绕过插件管理器的版本检查。

自动审查在 Harness 策略判定需要审批后执行，不会绕过该策略。启用前请阅读[自动审查行为](auto-review.zh.md)。

## 常见问题与重要限制

### 凭据保存在哪里？

OAuth 凭据保存在运行 DSH 的主机上，由该主机用于向 OpenAI 认证和发起请求。正常浏览器账户响应只返回账户摘要，不返回原始 token。远程浏览器设备不一定是 DSH 主机。

### 卸载插件会退出登录吗？

不会。OAuth 状态单独保存在 `$DSH_HOME/.openai-codex-auth.json`（默认 `~/.dsh`），插件不会复制或修改 `~/.codex/auth.json`。只有确实要删除凭据时，才使用 **退出所有账户**，或在卸载前运行 `logout`。

### 可以给不同对话分别切换账户吗？

后续 Codex 请求使用所选活动账户，每个对话不会各自绑定账户。Fast Mode 才是会话级设置。取消新的授权会保留已有账户；明确的刷新凭据撤销响应会提示重新授权，临时故障则保留账户供重试。详见[账户行为](reference.zh.md#账户模型与额度)。

### 为什么列表中的模型调用失败？

模型 HTTP/SSE 请求失败时，会在原错误消息后附加有界、仅属于该请求的诊断信息。单凭 `overloaded` 消息不能认定账户被封锁。范围与复现方式见[持续错误诊断](experiments/issue-219-diagnostics.md)。

账户权限、插件与宿主兼容性、网络条件都会影响可用性。其他客户端可以使用，不代表此集成一定可用。OpenAI 控制模型权限、额度、上下文容量和服务行为；目录条目不是账户权限证明。

### 修改客户端请求头就能避免持续授权失败吗？

目前没有这样的保证。Codex Connect 是第三方集成，不冒充 Codex Desktop，也不伪造安装标识或 attestation 请求头。pi-ai 模型/OAuth 路由与辅助路由目前采用不同的客户端身份。OpenAI 的 [App Server 文档](https://developers.openai.com/codex/app-server/)要求集成通过 `clientInfo` 标识自己的客户端，但这不能证明本插件直接调用后端接口的接受规则。`overloaded` 本身不是封锁证据。应保留有界诊断信息，对照成功和失败时段后再判断原因；请求 ID 仅私下提供，不公开 token 或完整会话归档。

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

`check` 包含静态检查、单元测试、构建、兼容性和打包检查。`lint:metadata` 检查包元数据与发布规则；`lint:source` 检查宿主与浏览器 TypeScript 中未处理或误用的 Promise、无效 await、重复 case 和不可达代码。浏览器回归与隔离 DSH 安装是另外两个命令。这些检查不使用真实 OAuth 授权，也不能替代真实账户验收。

## 许可证与致谢

Codex Connect 的修改与新增工作 Copyright 2026 Frank Song。本项目包含派生自 [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex) 的软件；上游内容继续保留 Copyright 2026 Yan-Zero。两部分均按 Apache-2.0 发布，详情见 [NOTICE](../NOTICE)。
