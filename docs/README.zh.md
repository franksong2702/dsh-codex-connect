# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

[English](../README.md) | 中文

通过 OAuth 将你的 ChatGPT 订阅连接到 DeepSeek Harness，并可选择使用 GPT Image 生成图片，同时保留用户自主默认项、Harness 原生审批、非敏感诊断和可靠的会话恢复。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/hero.jpg" alt="Codex Connect — 通过 ChatGPT OAuth 连接 DeepSeek Harness" width="100%">
</p>

`dsh-codex-connect` 提供 `openai-codex` 模型目录和独立的 ChatGPT OAuth 登录。模型仍走 Harness 标准 LLM 服务，因此流式输出、工具调用、reasoning replay、压缩、文件系统控制、权限门禁和审批提示仍由 Harness 负责。ChatGPT 订阅不会因此变成 OpenAI Platform API 凭据。选择符合条件的 GPT Codex 模型后，Composer 还会显示按对话绑定的 Fast Mode 开关和紧凑的周额度指示条。

安装是增量的：bundle 不会替换当前主模型或搜索路由；独立搜索、`view_image` 和图片生成也默认关闭，必须显式开启。

本中文指南中的 UI 截图均来自中文本地化的 Harness 界面；[English 版](../README.md) 使用同一状态的英文截图。模型与提供方标识保留其规范拼写，不随界面语言翻译。

## 五分钟快速开始

本快速指南适用于 DSH `0.1.2-alpha.2` 与 Codex Connect Alpha 4.22。请先运行 `dsh --version`。如果使用 DSH `0.1.1-rc.2` 或 `0.1.0-rc.7`，请在 [INSTALL.md](../INSTALL.md) 中选择匹配的插件版本。本指南使用 `web` profile；请把 `web` 替换成你已经在用的 Harness profile 名称。如果在 DeepSeek Harness 源码 checkout 中运行，请在命令前加 `pnpm`。

### 1. 将插件装入一个 profile

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.22
```

预期结果：包被加入该 profile。这个动作不会更改 profile 的默认模型或全局搜索路由。

请使用上面的精确版本，确保已验证的 DSH 与插件组合可以复现。`alpha` 是会移动的 npm 标签，不是兼容性保证。

### Alpha 4.22 更新内容

- 同时适配 DSH `0.1.2-alpha.2` 的客户端设置、会话控制器接口及其声明的 `@earendil-works/pi-ai` 版本范围 `^0.84.2`。
- 在 **设置 → 模型** 中提供紧凑的 **Openai-Codex** 卡片，用于 ChatGPT 授权、额度和共享 Codex Connect 设置，同时保留原插件设置入口。
- 浏览器授权中断后，可以继续、取消或重试，不需要重启 DSH，也不会删除已有凭据；完整授权流程使用可配置且有范围限制的期限。
- 使用联动的滑条和数字输入框，逐模型调整有范围限制的本地上下文预算。保存覆盖值前继续使用目录默认值；配置上限不代表服务端上下文容量。
- 使用跟随主题的前景色和填充色，确保深色模式下主按钮文字清晰可读。

### 版本更新提醒

Codex Connect 会通过 DSH Web 服务定期检查公开的 npm 包信息，以及本仓库维护的 `verified-compatibility.json`。同一张卡片会读取本机实际加载的 DSH 软件包版本，与本项目记录的最新 DSH 版本并列显示，并对当前安装的插件版本和 DSH 版本这一组精确组合进行判断。本机版本检测只使用插件已经能够取得的软件包元数据，不要求 DSH Core 作出任何修改。

兼容性清单按插件版本和 DSH 版本精确记录，不假设后续版本天然兼容。维护者确认新的 DSH 版本后，只需更新仓库文件，不必重新发布插件。绿色表示当前安装组合已经通过验证；黄色表示最新插件已与当前 DSH 版本通过验证，应先升级插件；红色表示清单中已有当前 DSH 版本，但当前插件和最新发布的插件都没有对应记录；灰色表示清单尚未记录当前 DSH 版本，或暂时无法检查公开清单。红色状态会按当前安装的 DSH 版本提供预填内容的 GitHub Issue 链接，让用户无需自行组织报告就能提醒维护者。

发现插件新版本后，即使你切换了对话，DSH 界面也会显示全局更新提醒。提醒会先展示从你当前版本到最新版本之间对用户有用的功能；完整技术发布说明放在次级详情或发布页面中。插件不会自动执行升级命令。

完成升级的建议流程是：把提醒里的简短请求复制给你正在使用的 Agent。Agent 会查看项目说明，自行判断合适的安装或更新方式；插件不会替你执行任何操作。

Agent 报告完成后，回到提醒或设置卡片，点击 **已完成，重新检查**。如果运行中的 DSH Web 仍显示旧版本，再重启当前 profile 的 DSH Web，然后重新检查。

如果你要手动在终端更新，本指南使用的 profile 命令如下：

```sh
dsh plugin --profile web update dsh-codex-connect
```

如果你使用的是其他 Harness profile，请把 `web` 换成对应的 profile 名称。如果重新检查时仍显示旧版本，请先重启该 profile 的 DSH Web，再检查一次。公开包信息暂时不可用时不会显示更新提醒，账户和模型功能仍可正常使用。

### 2. 启动 Harness

```sh
dsh web
```

预期结果：所选 profile 的 Harness Web UI 打开。

### 3. 找到 Openai-Codex 账户卡

打开 **设置 → 模型**，找到 **Openai-Codex**。这是 Alpha 4.22 的主要账户入口。如果当前 profile 没有模型设置分区，请改用 **设置 → 插件 → 插件配置 → Codex Connect**。

模型页账户卡标注“由 Codex Connect 插件提供支持。”，用于 ChatGPT 授权、重新授权、退出和查看额度。两个设置页面共用同一份内存账户状态及轮询。**更多设置** 会在弹窗中打开代理、模型显示、搜索、图片和上下文预算配置表单，原插件设置入口仍保留。两处保存到同一份配置；关闭弹窗或按 Escape 会放弃弹窗内未保存的修改。模型页底部入口是可选增强：没有该设置分区的 profile 仍保留原插件入口。

模型页紧凑卡片在未登录时显示 **授权**，已登录时显示 **退出登录** 和 **查看额度**。展开后只显示服务端返回的额度条目，不再重复账户操作。浏览器授权中断后，可以点击模型页的 **继续授权**（插件页为 **重新打开授权**）继续原登录，或点击 **取消登录** 后，从任一设置页或另一个受信任浏览器重试。取消不会退出已有账户。未完成的授权默认在 10 分钟后到期；插件配置 `oauthTimeoutMs` 可设为 1,000–1,800,000 毫秒，在插件加载时生效。获取初始授权链接仍有独立的 30 秒等待上限。取消和到期都不需要重启 DSH。

预期结果：新安装时模型页显示 **授权**。插件配置备用入口显示 **尚未登录** 和 **使用 ChatGPT 登录**。

下图展示的是保留的插件配置备用入口。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/plugin-entry.jpg" alt="Harness 插件配置中的中文 Codex Connect 折叠入口" width="586">
</p>

### 4. 使用 ChatGPT 登录

在模型页点击 **授权**，或在插件配置中点击 **使用 ChatGPT 登录**，然后自行完成浏览器审批。如果内嵌 WebView 阻止登录窗口，请点击页面显示的 **打开 ChatGPT 登录页面**，在系统浏览器中继续。不要把授权 URL、授权码、token 或账户标识复制到 Issue、日志或配置文件中。

预期结果：模型页显示 **退出登录** 和 **查看额度**；插件配置的账户区显示 **已登录**。下图展示的是成功登录后的备用入口，不是开始登录前的页面。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/oauth-status.jpg" alt="Harness 插件配置中的中文 Codex Connect 已登录状态" width="720">
</p>

### 5. 选择模型并做一次安全检查

打开 Harness 原生模型选择器，为当前正在使用的 agent 或会话选择一个 `openai-codex` 模型。这个选择与写入 profile 的默认模型或全局搜索路由是两件事。

选择器会把可用项归在 **OpenAI Codex** 下。`GPT-5.6 Luna` 一类模型标识是规范名称，因此会保留原样，不翻译。

如需缩短这个列表，打开 **设置 → 插件 → 插件配置 → Codex Connect**，取消勾选不想显示的模型，然后点击 **保存更改**。这个设置只控制模型发现：已有会话中保存的隐藏模型，或通过精确模型 ID 指定的隐藏模型，仍可继续使用。全新安装默认显示完整目录。

也可以在 profile 中通过 `models` 设置初始显示子集；无论这里如何排列，选择器仍保持提供方的原始顺序：

```yaml
- id: llm-openai-codex
  config:
    models:
      - gpt-5.6-luna
      - gpt-5.6-sol
      - gpt-5.6-terra
```

省略 `models` 时显示完整目录；空列表会在选择器中隐藏全部 Codex 模型，但不会禁用精确模型 ID 路由。

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

### GPT Codex 对话中的 Composer 控件

只有当前对话选择了 `openai-codex` 提供方的 GPT 模型时，Composer 才会显示下面两个小控件。它们都是当前对话级别的控制，不是 profile 全局设置：

- **Fast Mode（闪电图标）**：每个对话默认关闭。点击后请求更快的 `1.5 倍` 模式，再点一次恢复标准速度。它只绑定当前对话，不会改变模型选择，也不会影响其他对话。鼠标悬停或键盘聚焦闪电图标，可以看到当前状态和额度消耗提示。
- **周额度进度条**：位于模型选择器旁边的短横条。剩余额度越低，颜色会从绿色经过黄色/橙色变为红色。鼠标悬停或键盘聚焦时，会显示精确剩余百分比和服务端提供的重置时间。非 GPT 模型或额度暂时不可用时不会显示。
- 对于精确模型 `gpt-5.3-codex-spark`，Composer 读取 Spark 的每周额度；其他 GPT Codex 模型读取标准 Codex 周额度，两者是分开的额度桶。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中按对话绑定的 Fast Mode 闪电控件和周额度进度条" width="820">
</p>

## 可选能力（默认关闭）

安装后的 bundle 只注册模型提供方，默认不额外启用任何能力：

```yaml
- id: llm-openai-codex
  config:
    enableProxy: false
    enableSearch: false
    enableImageTool: false
    enableImageGeneration: false
    enableAutoReview: false
```

打开 **设置 → 插件 → 插件配置 → Codex Connect**，即可在同一张卡片中管理账户和这些选项。**保存更改**只影响本插件的能力配置并即时生效，绝不会选择默认模型或全局搜索路由。

### 网络连接与代理检测

Codex Connect 默认使用**直连**。代理是可选项，只作用于本插件的 Codex 请求：模型流式请求、OAuth 登录和 token 刷新、额度、独立搜索以及图片生成。其他提供方和未进入插件作用域的网络请求仍使用进程原来的 dispatcher。

点击 **检测代理** 时，只会测试标准代理环境变量，以及文档列出的本机候选地址：`127.0.0.1:7890`、`127.0.0.1:7897` 和 `127.0.0.1:10809`。检测不调用模型、不消耗额度，也不会写入设置。规范 Codex 端点返回任何 HTTP 响应都表示网络可达；`401/403`、代理 `407`、DNS、连接被拒绝、超时、TLS 和 CONNECT 失败会分别显示为诊断类别。

请先检查候选地址，再选择 **使用此代理**，最后点击 **保存更改**。**手动配置**可以先测试一个不带凭据的 HTTP(S) proxy origin，再启用它。**停用代理**始终可用。检测失败会保留原来的模式；代理已启用但请求失败时，界面会给出可操作的错误，绝不会静默改走直连。

### 只开启你准备使用的能力

- `enableSearch: true` 会把 Codex 注册为可选择的搜索提供方，不会把它选为 profile 的全局搜索路由。
- `enableImageTool: true` 会为具备视觉能力的模型启用 `view_image`，用于审批后的本地读取和公网图片获取。
- `enableImageGeneration: true` 会启用只接受文字描述的图片生成工具。使用你当前 GPT 订阅计划提供的图片生成能力。Codex Connect 会把生成结果的精确原文件保存到插件自有存储，同时另存一份 DSH 附件作为对话预览。

下图是有人显式开启能力之后的配置示例，不是新安装的默认状态。本中文指南使用中文本地化截图；English 版展示同一状态的英文截图。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/plugin-configuration.jpg" alt="中文 Codex Connect 显式开启可选能力后的配置示例" width="550">
</p>

### 使用 GPT Image 生成图片

1. 在 Codex Connect 卡片中开启 **启用 GPT Image 图片生成**，然后点击 **保存更改**。
2. 为当前对话选择一个 `openai-codex` GPT 模型。
3. 用自然语言描述你想要的图片；Agent 可以在调用 GPT Image 前将这段描述扩展为更完整的提示词。
4. 图片生成后，精确原文件会与用于对话展示的 DSH 附件分开保存。你可以在结果卡片里查看和复制完整提示词、分别下载原文件或预览，并比较两者的尺寸与文件大小。

此能力使用你当前 GPT 订阅计划提供的图片生成权限，不需要 OpenAI Platform API Key；具体可用性仍取决于当前对话所选的 GPT 套餐和模型。

输出尺寸由订阅服务决定。工具只接受提示词，不提供尺寸设置，也不保证生成 4K 图片。要求“4K 级细节”不代表文件具有 4K 像素尺寸，请以结果卡片显示的尺寸为准。下载原文件会保留服务实际返回的图片，不会将其放大。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/image-generation.png" alt="Codex Connect 中文 GPT Image 结果卡片，包含图片预览、可复制提示词、下载操作和图片详情" width="780">
</p>

图片的详细提示词由当前选择的 GPT 模型生成。Codex Connect 不会偷偷添加图片参数：它只校验“提示词”请求，并通过 ChatGPT 订阅提供的图片能力发送。服务返回的精确字节保存在 `$DSH_HOME/dsh-codex-connect/images/v1`；对话中使用的是另一份 DSH 附件预览，可能按照当前 DSH 附件策略缩放或重新编码。点击 **下载原文件** 得到的一定是插件保存的精确文件，**下载预览** 得到的是 DSH 表示。原文件仅允许文件所有者访问，下载前会校验完整性；创建图片的会话以及继承了该图片结果的 fork 会话均可下载，恢复会话后仍然有效。在该结果之前创建的 fork 会话和无关会话不能下载。关闭图片生成或卸载插件不会自动删除这些文件；通过结果卡片下载仍需安装插件。结果卡片里的提示词可以滚动查看和复制。点击 **再次尝试** 或 **再生成一张** 时，会重新发送这张卡片自己的提示词，不会因为后来出现了新的对话消息而误用最新上下文。点击 **基于此图修改** 时，模型会先询问你想改什么，再基于这张卡片的提示词继续处理。

### 插件配置中的额度说明

登录后，Codex Connect 设置卡片可能显示多个服务端额度窗口。它们是不同的额度桶，不是同一个数字重复显示：

- **Codex · 每周额度**：普通 GPT Codex 模型使用的标准 Codex 周额度。
- **GPT-5.3-Codex-Spark · 5 小时额度** 和 **GPT-5.3-Codex-Spark · 每周额度**：Spark 模型返回的两个独立窗口。

每条进度条都会显示剩余百分比和按本地时区格式化的重置时间。额度窗口、模型资格和重置时间由 OpenAI 返回；数据缺失时界面会显示不可用，不会自行猜测。

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
| `models` | 完整目录 | Codex model id 数组；空数组隐藏全部条目 |
| `enableProxy` | `false` | boolean；除非显式启用，否则使用直连 |
| `proxyUrl` | `http://127.0.0.1:7890`（未启用的占位值） | 不带凭据的 HTTP(S) proxy origin |
| `contextWindowOverrides` | 无 | 按模型覆盖 contextWindow 的映射；见下文 |
| `enableSearch` | `false` | boolean |
| `enableImageTool` | `false` | boolean |
| `enableImageGeneration` | `false` | boolean |
| `searchModel` | `gpt-5.6-sol` | Codex model id |
| `searchMode` | `cached` | `cached`、`indexed`、`live` |
| `searchContextSize` | `medium` | `low`、`medium`、`high` |
| `searchMaxOutputTokens` | `10000` | 正整数 |

### 上下文窗口覆盖

当你有证据表明内置目录不适合当前部署时，可通过 `contextWindowOverrides` 主动设置每个模型的客户端上下文预算。它不能扩大 OpenAI 后端的上下文容量。默认不启用；此功能并未验证社区报告的更大窗口。

在插件配置和“模型 → 更多设置”中，每个模型行显示具体的上下文预算，并保留显示勾选框。“上下文 → 调整”展开双向同步的滑条和整数输入框，同时显示已安装目录的默认值及配置上限。“恢复默认”使用目录值，即使启动配置中有覆盖值也不例外。隐藏模型会保留其预算。“保存”提交暂存修改，“放弃”撤销修改。清空输入框属于无效输入，不等于恢复默认。

配置上限依据于 2026-08-28 核对的 [Codex 官方目录快照](https://github.com/openai/codex/blob/7625343977154efed8c0dadba956374992a1580b/codex-rs/models-manager/models.json)：GPT-5.6 Sol/Terra/Luna 为 872,000 tokens，GPT-5.4 为 1,000,000，GPT-5.5/GPT-5.4 mini 为 272,000。没有已记录上限的模型（包括 Spark）暂以已安装提供方目录的默认值为上限；如果更新后的提供方默认值高于已记录上限，也以该默认值为上限。界面会标明依据；这些数值不是从用户账号动态获取的，也不是实测的服务端容量。默认值保持不变；超过默认值会提示额度消耗及请求失败风险，账号和通道限制可能不同。

```yaml
- id: llm-openai-codex
  config:
    contextWindowOverrides:
      # 仅为示例：350000 不是已验证或推荐的服务端上限。
      gpt-5.6-sol: 350000
```

键必须与已安装 Codex 目录中的模型 ID 完全一致。映射最多包含 256 项，token 数必须是模型配置上限内的正安全整数。未知 ID 或超范围数值会使配置或设置注册、写入明确报错；已有的超范围覆盖值需要调低或用 `null` 恢复默认，不会被静默截断。其他模型保留目录元数据。输出 token 上限、SSE 传输和 DSH 的压缩策略不变。请在独立验证过的服务端上限内，为输出及协议开销预留空间。如果部署设置为在 80% 时压缩，客户端窗口 `350000` 对应的名义阈值是 `280000`；这个算式不证明服务端接受这么大的输入。

插件加载时会应用持久化的 Host 设置，运行中修改会作用于下一次模型解析或请求准备。已经准备好的请求保留当时的预算快照。原始模型目录不会被修改。

恢复默认值时，需要区分配置层：

- 最终生效的映射为 `{}` 或没有覆盖时，使用目录窗口。
- DSH 会递归合并设置映射，因此用 `{}` 更新已有映射不等于清空。
- 设置 `contextWindowOverrides: null` 可明确关闭所有覆盖，包括从启动配置继承的值。
- 将某个模型条目设为 `null`，可只恢复该模型的目录默认值，保留其他覆盖。界面保存时会为默认模型写入明确的空值标记，防止恢复默认后重新继承启动配置值。
- 删除持久化字段会重新继承启动配置；启动配置没有覆盖时，恢复目录窗口。删除某个持久化模型条目，同样会恢复该模型的启动配置值或目录值。

## 重新登录、诊断与冲突

- 卡片显示 **重新登录**，或服务端要求重新认证时，点击该操作并完成同一套安全的浏览器流程。它会保留本插件的能力配置，不会偷偷改动默认模型或全局搜索路由。不要为了刷新会话而运行 `logout`。
- `doctor` 只读取进程与文件系统元数据。`doctor --json` 只输出一条可解析的非敏感 JSON，包含 schema version 1、包/版本/Node 信息、认证文件状态与安全 mode、能力、冲突状态和提示；它省略认证文件绝对路径以及 OAuth、账户和过期时间信息。
- Alpha 4.10 用户若因未知的 `web/openai-codex-search-llm-request` 事件而无法读取搜索历史，可先运行 `dsh-codex-connect migrate-history --json`，停止 DSH 后再以 `migrate-history --apply --confirm-stopped --json` 应用修复。该命令默认只预检，会备份每个被修改的压缩 JSONL 文件，Windows 仅支持预检；详见 [MIGRATION.md](../MIGRATION.md)。
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

### 按需能力报告

请从目标插件安装位置运行独立的 `capabilities` 命令。不传 `--probe` 时，它只读取本地主机包版本与认证文件元数据，不打开认证文件内容，也不发送网络请求。现有 `doctor` 行为和设置页兼容性卡不变。

```sh
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --json
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --probe --json
```

`--probe` 显式向普通 Codex Responses 路由发送一条固定短请求，可能消耗额度。它读取尚未过期的已存凭据，但不刷新或写入凭据。除非传入 `--proxy <http(s)-origin>`，否则命令使用直连，不读取正在运行的 profile 代理设置或环境代理变量。默认期限为 30000 ms，可通过 `--timeout-ms <1..60000>` 调整。命令不跟随重定向、不重试，响应上限为 64 KiB，并在返回前销毁自有连接。达到期限或大小上限不保证服务端生成已经停止。可复用诊断实例仅将完整响应和明确请求拒绝在内存中缓存至多 60 秒，按凭据、模型、版本与网络策略隔离。不同 CLI 调用之间不共享缓存证据。

报告为每项检查标注 `supported`（可用）、`rejected`（拒绝）或 `unknown`（未验证），并提供原因与修复动作。运行时可用仅表示声明的主机包版本匹配，不代表 Web profile 或某个 Node 补丁版本经过集成验证。模型目录条目或私有认证文件只能令模型权限与 OAuth 有效性保持 `unknown`。只有 HTTP 200 有限 SSE 响应包含所选模型完整、非空的助手输出，才能确认独立路由；重定向、超时、限流和不完整流仍为 `unknown`。HTTP 400/404 拒绝的是本次请求，并非所有模型或可选功能；HTTP 401/403 还表示本次请求的授权被拒绝。报告省略 token、账号 ID、路径、代理 origin、响应 ID、headers 和生成文本。

本报告仅涵盖独立路由，不验证活动 profile 路由、搜索/图片工具、浏览器兼容性、provider 重试行为或会话恢复。本插件没有实现自动 provider 故障切换，因此该项为 `rejected`，需要用户明确选择其他 provider。有限 SSE 默认路径不会触发 WebSocket 到 SSE 的回退。`contextManagement` 和续接仍为 `unknown`；原生 compaction 和 WebSocket reuse 在当前集成策略下为 `rejected`。诊断结果不会启用这些能力，也不会更改 Harness 历史。退出码只覆盖运行时、OAuth、所选模型、Responses 和 SSE：`0` 表示五项均可用，`1` 表示至少一项被拒绝，`2` 表示证据未知、选项无效或检查失败。被拒绝的可选能力不影响该退出码。

### Codex 自动审查与能力探针

Codex 自动审查是 **设置 → 插件 → Codex Connect** 中默认关闭的可选能力。启用后，它会在 DSH 策略检查之后审查符合条件的 Harness 审批请求。启用即允许插件把有界的最近审批上下文、工具参数、工作目录和待执行动作发送到 `chatgpt.com`；隐藏推理和已保存凭据会被排除。只有完整的结构化允许结果才能授权一次执行。拒绝会注入理由和禁止绕行指引；连续拒绝会打开当前轮熔断器；存在可选命令服务时，`/approve <拒绝记录 ID>` 可以授权一次完全相同的重试。详见[自动审查](auto-review.zh.md)和 [Auto-review](auto-review.md)。

独立探针继续用于诊断隐藏路由。它不会把 `codex-auto-review` 加入模型选择器，也不会审查或执行真实的 Harness 命令。

```sh
dsh plugin --profile web exec dsh-codex-connect auto-review-probe --json
```

该命令通过 ChatGPT OAuth Responses 路由向隐藏 reviewer 发送一条固定的合成空操作。它要求已存凭据尚未过期，不刷新或写入凭据，不跟随重定向、不重试，响应上限为 64 KiB，并在返回前销毁自有连接。`--proxy <http(s)-origin>` 和 `--timeout-ms <1..60000>` 与普通能力探针具有相同的显式网络含义。

`supported` 只表示路由接受了精确的隐藏模型 ID，并返回一条符合 reviewer JSON 字段的完整审查结果。`rejected` 表示请求或本地前置条件被明确拒绝。超时、取消、格式错误、不完整流、限流和网络故障均保持 `unknown`。输出会省略凭据、账号 ID、response ID、服务端消息、模型文本、路径、headers 和代理 origin。只有运行时、OAuth 和 reviewer 三项均为可用时才返回 `0`；至少一项被拒绝时返回 `1`；证据未知或输入无效时返回 `2`。该报告只提供证据：它绝不会修改自动审查设置、DSH 策略或授权状态。

## 兼容性与安全边界

- Alpha 4.22 已与 DSH 插件 API packages `0.1.2-alpha.2`、`@earendil-works/pi-ai` `^0.84.2`（验证时解析为 `0.84.4`）和 Node.js `^22.19.0 || >=24.0.0` 完成验证。已发布 Alpha 4.21 仍与 DSH `0.1.1-rc.2` 和 pi-ai `0.82.1` 保持已验证状态。[verified-compatibility.json](../verified-compatibility.json) 记录精确组合；安装命令见 [INSTALL.md](../INSTALL.md)。
- 新版 DSH 将原来的 client runtime 拆分为 Session Controller、Settings、Store 和 Renderer 包。Codex Connect 通过这些公开接口接入设置和图片操作。规范化预览的编码与尺寸由 DSH 决定；Codex Connect 另行保留字节完全一致的原图。
- 升级时请将 DSH 插件 API packages 与 `@earendil-works/pi-ai` 作为一组升级，再运行 `dsh-codex-connect doctor --json` 和兼容性检查。本契约不对未来版本作判断。
- 每日上游检查发现新的 DSH `latest` 或 `next` 候选版本时，会把 Codex Connect 安装到隔离 Profile 中，在没有 OAuth 凭据的情况下启动已安装的模型运行时，验证模型与推理强度发现，并确认提供方可被正确卸载。真实登录、额度和模型请求仍需在测试 Profile 中人工验证。
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
