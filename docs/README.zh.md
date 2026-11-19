# Codex Connect

把你的 ChatGPT 订阅作为 `openai-codex` 模型提供方接入 DeepSeek Harness。Codex Connect 是社区 Alpha 插件。

[English](../README.md) | 中文

## 快速开始

### 1. 安装

先运行 `dsh --version`。如果版本是 DSH `0.2.2-rc.5`，请将下方的精确版本安装到 Web profile。

```sh
dsh plugin --profile web add dsh-codex-connect@0.2.0-alpha.16
dsh web
```

| 要求 | 已验证的默认组合 |
| --- | --- |
| DeepSeek Harness | `0.2.2-rc.5`（2026-11-19 的 DSH npm `latest`，宿主包版本须一致） |
| Codex Connect | `0.2.0-alpha.16`（2026-11-19 的 npm `latest` 和 `alpha`） |
| Node.js | 此宿主要求 `>=24.9.0` |
| Cordis | `~4.1.0`（实测原版随附的 `4.1.0`） |
| 账户 | 支持所选 Codex 模型的 ChatGPT OAuth 账户 |

在原版 DSH `0.2.2-rc.5` 的全新 Web profile 中，`dsh-codex-connect@latest` 解析为 Alpha 16，已通过隔离安装和无凭据运行检查。需要可重复安装时，请使用上方的精确版本。其他 DSH 版本和 Desktop 请先查安装指南，选择精确配对。[安装与升级](../INSTALL.md) · [Alpha 16 晋升和验证记录](release-notes/0.2.0-alpha.16.md#latest-promotion-on-2026-11-19)

将 `web` 替换为现有 profile 名，启动 Harness 时也使用同一个 profile。从 DSH 源码目录执行时，请在命令前加 `pnpm`。

### 2. 授权并选择模型

打开 **设置 → 模型 → Openai-Codex → 授权**，然后亲自在浏览器中完成批准。如果内嵌窗口被拦截，请用 **打开 ChatGPT 登录页面**。在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。

不要把授权 URL、code、token 或账户标识粘贴到 issue、日志、聊天或配置文件中。在另一台设备上使用浏览器时，可通过默认收起的手动回调表单完成当前登录，无需转发 localhost 回调端口；请遵循[远程浏览器授权](reference.zh.md#远程浏览器授权)说明。

### 3. 检查安装

若要求诊断不经过包管理器，请直接运行已经安装的 bin（替换为已经独立识别的实际路径）：

```sh
node /absolute/profile/node_modules/dsh-codex-connect/lib/bin.js doctor --json \
  --install-anchor /absolute/dsh/node_modules/@deepseek-ai/dsh/package.json
```

`doctor --json` 只读本地安装元数据，不请求网络或输出原始凭据；指定安装锚点不证明该安装正在运行。`dsh plugin exec` 等包装命令自身可能核对或安装依赖。详见[运行身份与直接诊断](runtime-identity.md)，包括 Desktop/ASAR 限制。包含本改动的开发构建还会在设置中区分页面、Host 已加载和磁盘安装版本。诊断通过不代表模型权限，实际请求须另获授权。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 为 DeepSeek Harness 接入 ChatGPT OAuth" width="100%">
</p>

## 核心能力

Codex Connect 提供模型接入。工具、权限、审批、附件、会话、压缩和恢复由 Harness 管理。安装插件会保留现有默认模型和搜索路由。本社区项目独立于 OpenAI 和 DeepSeek，通过 ChatGPT OAuth 接入订阅。

- **账户：**在 DSH 主机上保存最多 16 个账户，手动选择后续请求使用的活动账户，不按会话绑定。请求保持已固定的账户，插件不会自动轮换或静默故障切换。
- **模型与 Astra 支持：**当前已验证的 DSH 与插件组合已支持 `gpt-6-astra`。插件补充缺失的模型定义，提供 Low、Medium、High、Xhigh 和 Max 五档推理强度；Default 保持提供方默认值。已保存的 Off/Minimal 选择需要[明确更新](../MIGRATION.md#astra-reasoning-selections)。安装的依赖目录包含 Astra 时，插件保留其原生元数据，同时维持这五档已校准的推理选择。模型出现在列表中，不代表当前账户具有调用权限；新依赖版本的整体兼容性仍需单独验证。
- **Fast Mode：**为单个对话请求优先服务，默认关闭。可分别为新建主对话和新建子代理对话启用默认值，不改变已有对话。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- **额度：**显示服务端返回的 `5h`、`7d` 窗口及重置时间，已登录且标签页可见时通常每 60 秒刷新一次；失败后延长重试间隔。不虚构缺失窗口；Spark 使用独立额度桶。
- **插件更新：**检查 Codex Connect 新版本，不自动安装，也不建议更改 DSH。宿主兼容性信息通过主动运行的本地诊断查看。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选能力

Alpha 4.40 还会在旧提供方目录缺失时补充 `gpt-6-sol` 和 `gpt-6-luna`，已有原生定义时保留其元数据。两者提供 Low 到 Max（含 Xhigh），Default 不指定推理档位；尚未实现 Codex Sol 的 Ultra 编排模式。新任务可明确授权使用它们，但已有授权及 GPT-5.6 Sol／Medium 起步不变；Luna Reserve 后续已移除。模型出现在目录中不代表账户具有调用资格。参见[兼容范围与验证](experiments/gpt6-sol-luna-compatibility.md)。

以下选项在新安装时全部关闭。请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑，再点击 **保存更改**。发生冲突或保存失败时会保留草稿。

| 能力 | 启用字段 | 重要行为 |
|---|---|---|
| 代理 | `enableProxy` | 不带凭据的 HTTP(S)，只作用于本插件流量，包括压缩的 OAuth 和额度响应；无关的 Fetch 请求仍使用宿主原来的传输方式。代理请求失败不会静默改走直连。 |
| Codex 搜索 | `enableSearch` | 将整个 profile 的搜索路由切换为 Codex；关闭后恢复之前的路由。 |
| 图片查看 | `enableImageTool` | 为视觉模型添加 `view_image`，读取本地文件和经过校验的公网 HTTP(S) 图片。 |
| GPT Image 图片生成与编辑 | `enableImageGeneration` | 根据提示词生图，或编辑明确选定的会话图片并使用有顺序的参考图；可用性、尺寸和额度仍由账户及服务端控制。同时作为跨路由图片句柄桥接的开关：在非 Codex 路由上把 Codex Connect 图片选择句柄持久化到图片工具结果中，使图片编辑在这些路由上同样可用；`openai-codex` 路由会跳过，因为其适配器已在每次请求时注入相同句柄。可选 `imageHandleBridgeTools` 可将桥接限定到指定工具。 |
| 自动审查 | `enableAutoReview` | 将有界的审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`，首次启用需要确认。失败时交还人工审批。 |

**Luna Reserve 已移除。** 旧 `enableReserveFallback` 开关会被忽略，不再协商或自动切换模型。旧 `gpt-reserve` 会话须由用户明确选择普通模型；如宿主不支持在原会话切换，请保留原会话并用所选普通模型新建对话。旧 return 文件原样保留，不读取、迁移或删除。账户额度 UI 和只读额度工具仍使用普通 60 秒缓存及失败冷却，不后台轮询。参见[迁移说明](reference.zh.md#luna-reserve-回退)。

使用你当前 GPT 订阅计划提供的图片生成能力。成功生成的图片会显示在对话回复下方，无需展开处理过程；原工具卡片仍保留在处理过程里。生成原文件与附件预览分开保存；关闭能力或卸载插件不会删除这些文件。存储和访问规则见[配置与恢复](reference.zh.md#搜索与图片工具)。

自动审查在 Harness 策略判定需要审批后执行，不会绕过该策略。启用前请阅读[自动审查行为](auto-review.zh.md)。

**可选的模型额度查询：** 在插件 profile 配置中显式设置 `enableQuotaTool: true` 并重新加载插件后，会注册只读工具 `codex_connect_quota`。默认关闭，自定义设置卡没有该开关。它只返回共享 Codex 窗口的剩余比例、重置时间和新鲜度，不返回余额或账户标识。详见[额度查询](quota-tool.md)及可选的 [skill 示例](skills/codex-quota-awareness/SKILL.md)。百分比不是任务预算；资源限制不能成为降低要求、跳过测试或安全检查的理由。

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
- [发布历史](release-notes/README.md)
- [配置、诊断与恢复](reference.zh.md)
- [本地请求计量：启用、报告与停用](request-metrics.zh.md)
- [明确授权、有界的 bili 预处理活动（源码改动；默认关闭）](preflight-activity.zh.md)
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

已发布的 `0.2.0-alpha.1` 将 `gpt-6.1-sol` 加入手动模型目录与配置选择器，支持 Low、Medium、High、Xhigh、Max；Default 不显式发送推理强度，不支持 Ultra 编排。该版本当时的 Codex 回退值为 272,000，允许的本地配置上限为 872,000；这不是 API 产品窗口，也不能证明账户访问权限。详见[元数据与验证](agent-notes/gpt61-sol-support.md)。不会扩大 Adaptive Task 授权。

Alpha 5 能力校准：[来源对照](agent-notes/gpt61-capability-calibration.md) 区分锁定目录的 272k 回退值／872k 本地上限、搜索结果收录的官方 Work/Codex 产品文字所宣称的 500k，以及另一 API 产品的限制。该历史变更仅更新 Sol61 的策略来源锁定；当时的默认值、原生提供方元数据优先级和 Fast／effort 行为不变。没有验证账户或端点的实际容量。

已发布的 #338 基础默认值后续修复：按官方 Work/Codex 产品默认策略，将 Sol61 缺失条目和已知旧内置静态元数据的基础默认值校准为 **500,000 token**。显式提供方元数据与用户覆盖值仍优先；其他模型、输出上限和 872,000 本地配置上限不变。[范围与证据](agent-notes/sol61-context-default.md) 区分校准默认值与真实路由容量。

Alpha 11 已发布：手动模型目录与配置选择器新增 `gpt-6.1-terra`，保留文字/图片输入和既有 Responses 工具。官方 Codex 回退默认 500,000 tokens，本地可选上限 872,000、输出上限 128,000；上游原生元数据优先，但与 Sol61 一样仍套用 effort 遮罩。提供 Low、Medium、High、Xhigh、Max；Default 不发送 effort。锁定的 OAuth 目录未列出 API 的 `none`，Ultra 客户端编排不受支持。本轮不新增桌面 Computer Use 执行器、不扩大 Ultrafast 范围。[来源、范围及合成验证](agent-notes/gpt61-terra-support.md)；真实账户可用性尚未验证。

Alpha 16 在手动模型目录和配置选择器中新增 `gpt-6.2-sol` 和 `gpt-6.2-astra`，保留文字/图片输入和既有 Responses 工具。两者的官方 Codex 回退默认值分别为 500,000 和 272,000 tokens，本地可选上限均为 872,000、输出上限为 128,000。上游原生元数据优先，同时沿用既有 effort 遮罩。提供 Low、Medium、High、Xhigh 和 Max。Default 省略 effort 参数。Ultra 客户端编排不受支持，既有 Ultrafast 范围不变。真实账户可用性尚未验证。[官方 Codex 模型目录](https://github.com/openai/codex/blob/6c0cee502d215e5df2dd9a303cf2e252229c9e12/codex-rs/models-manager/models.json)
