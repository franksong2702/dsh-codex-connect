# 配置、诊断与恢复

[English](reference.md) | 中文

安装方法与已验证的发布组合见[用户指南](README.zh.md)。本参考文档说明账户行为、可选能力、配置和诊断命令。

## 账户、模型与额度

OAuth 凭据保存在运行 DSH 的主机上，由该主机用于向 OpenAI 认证和发起请求。“模型”卡片和“插件配置”页面共享同一份账户状态；选择账户不是会话级绑定。**管理账户**可以添加、选择或移除账户。浏览器响应只会包含插件生成的账户 key 和脱敏标签，不会暴露 OAuth token 或原始 OpenAI account id。

在 Harness 的常规模型选择器中选择一个 `openai-codex` 模型。所有界面语言均保留模型的规范名称。**更多设置 → 模型** 控制发现列表中显示哪些模型；隐藏模型不会禁用按精确 ID 路由。

Codex 目录来自已安装的 `@earendil-works/pi-ai` 包，不是实时查询账户可用模型的结果。DSH `0.1.2-rc.1` 使用 pi-ai `^0.84.2`，其中尚无 `gpt-6-astra`，因此由 Codex Connect 补充定义。已发布的 Alpha 4.35 也已分别验证精确版本 DSH `0.1.5-alpha.1`、`0.1.5-rc.1`、`0.1.5-rc.2` 与 pi-ai `0.85.1` 的组合；混装的宿主包以及其他 DSH/pi-ai 组合仍属未验证。遇到原生 Astra 条目时，插件保留其元数据，并维持 Low、Medium、High、Xhigh 和 Max 推理选择，不修改已安装的目录。用户无需单独升级 pi-ai 即可选择 Astra。发布说明记录了准确的已验证组合和验收限制；依赖声明本身不代表已验证。两种来源的目录条目都不能证明账户具有调用权限。

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

**源码变更，尚未发布：** 精确匹配 Codex `gpt-6-astra` 和 `gpt-6.1-sol` 的对话提供互斥的 Standard、Fast、Ultrafast 选择。只有显式选择当前对话的 Ultrafast 或明确配置启动偏好后才发送 `service_tier: 'ultrafast'`，模型、推理强度与 SSE 传输不变。省略新偏好时 Ultrafast 仍默认关闭，旧 Fast 布尔值不能启用它。所有 Codex GPT 对话都显示同一个 Composer 速度控件；只有这两个精确模型名之外的模型仅禁用 Ultrafast 一项。切换模型（包括切走再切回）、登录/退出及账户操作会使付费选择失效，请求派发前还会复核实际账户、模型和实时选择。辅助压缩/标题请求不会继承 Ultrafast。旧布尔 Fast 接口和已保存的 Fast 偏好继续支持；选择 Ultrafast 时，旧 GET 返回 409，避免错误显示为标准模式。

**源码后续变更，尚未发布：** Composer 中的三档选择改为单个紧凑的闪电按钮（沿用旧 Fast Mode 按钮样式），弹出的 Standard/Fast/Ultrafast 菜单基于与 Read Only/Workspace Write/Full Access 权限切换相同的锚定菜单原语，不再用整排内联分段按钮挤占 Composer。该菜单以门户方式固定于视口，自底部 Composer 行向上展开、始终保持在视口内，打开期间跟随窗口缩放与滚动。按钮与悬停标题显示当前模式；Ultrafast 生效时按钮旁常驻一个橙色小圆点。菜单标出当前选择，不再常驻文字页脚。Ultrafast 旁独立的 32×32 信息按钮可在选项上方展开或收起原文完整额度说明；段落明确限制宽度并换行，不会撑宽约 144px 的菜单，菜单向上增高而底部选项保持原位。说明在视觉隐藏时仍与 Ultrafast 选项关联供屏幕阅读器朗读；信息按钮支持触摸、Enter 与空格，只切换说明而不选择速度，Ultrafast 禁用时仍可使用，关闭菜单后说明恢复收起。方向键导航包含信息按钮，Escape、Tab 或点击菜单外部直接关闭且不做选择。视觉隐藏的 status 区域会朗读速度读取与每次写入结果。按钮仅在读取或写入进行中禁用；共享账户忙或未登录时，仅 Ultrafast 菜单项带简短原因禁用，Fast 与标准始终可选，账户约束与此前仅针对 Ultrafast 的行为一致。速度路由与请求行为不变。紧凑菜单是 Codex GPT 模型唯一的 Composer 速度控件：`gpt-6-astra` 与 `gpt-6.1-sol` 之外的模型仍可选择 Standard 与 Fast，只禁用 Ultrafast 一项。该项的禁用原因（模型不支持 Ultrafast，而非缺少账户）写入信息按钮在触摸下展开、并由 `aria-describedby` 关联的就地说明，同时保留悬停标题。旁边不会再出现单独的旧式一键 Fast 按钮或固定禁用的原生按钮。

Ultrafast 消耗更多额度。官方文档区分可用的 Pro500、Enterprise/Edu 账户与 Pro100/200；插件不会根据套餐名称或缓存目录推断资格。账户资格与实际服务等级始终保持**未核实**，成功响应也不构成确认。按钮表示请求偏好，不是计费、速度或服务端接受的证据。不新增私有资格端点、OAuth 权限、付费探测或资格缓存。普通 403/429/网络故障不会被判为无资格。选择器不会回退或重放失败请求；现有提供方/宿主重试策略继续用于同一请求等级。不确定的控件写入只能通过显式读取恢复，不会自动重放 POST。详见[实现与验收边界](agent-notes/ultrafast-conversation-speed.md)。

- **Fast Mode** 只为当前对话请求优先服务（`service_tier: 'priority'`）。默认关闭，不会更换模型或降低推理强度。新对话和新子代理的 Fast Mode 默认值也不改变推理强度。实际速度和额度消耗取决于服务端，不保证固定提速倍数。
- Profile 中的「新对话默认使用 Fast Mode」和「新子代理对话默认使用 Fast Mode」互相独立，初始均关闭。只在新会话启动时应用；修改设置不会倒改已有会话，也不会覆盖 Composer 中的手动选择。单个对话的 Fast Mode 状态仍保存在进程内，因此插件重启后恢复该对话会回到标准速度；之后新建的会话仍按已保存的默认值启动。
- **源码后续变更，尚未发布：** `newSessionSpeedMode` 与 `newSubagentSpeedMode` 可独立设置为 `standard`、`fast` 或 `ultrafast`。显式值优先于对应旧 Fast 布尔值；省略或 `null` 沿用保留的旧偏好。更多设置提供两个选择器，选定显式值后禁用对应旧开关。只在新会话启动时捕获一次，不改变恢复会话、已有会话或之后的手动选择。Ultrafast 须先登录再创建会话，且仅适用于精确受支持的 Codex 模型；其他初始路由使用 Standard，不据此认定付费权益。切换模型或账户（包括切走再切回）会使旧启动意图失效；异步读取账户期间的手动选择也优先。首个 Host 请求路由或 Composer 已有的速度读取负责绑定偏好，不增加提供方请求。受支持模型缺少登录时明确报错，重试不会自动降为 Standard，直到手动或生命周期变更解除。参见[启动默认值说明](agent-notes/new-session-speed-defaults.md)。
- **额度条**在已登录且标签页可见时通常每 60 秒刷新一次（隐藏时暂停，失败后延长重试间隔），只显示服务端实际返回的 `5h` 和 `7d` 窗口，并显示精确剩余百分比与重置时间。`gpt-5.3-codex-spark` 使用独立的 Spark 额度桶。Codex Connect 不会虚构缺失窗口，也不会根据套餐名称隐藏已返回窗口。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="DeepSeek Harness Composer 中的 Fast Mode 与额度控件" width="820">
</p>

## 可选的配置级推理默认值

**源码变更，尚未发布：** 可在 Codex Connect 插件配置行设置 `reasoningEffort: max`（或其他受支持强度），也可在更多设置中选择默认推理强度。仅在 Host 请求未显式指定强度时使用；请求值优先。省略保持提供方原行为，`null` 可屏蔽下层继承的默认值。保存后新准备的请求使用新值，已准备的请求保留原配置快照。不改变 Fast/Ultrafast 服务档位、输出上限或聊天模型。

`GET /plugins/dsh-codex-connect/models` 返回 Host 实际提供的 `reasoning.efforts` 和可选 `reasoning.defaultEffort`，不读取凭据，也不查询账户访问权限。元数据来自已安装的 adapter，包含插件对静态目录的受支持补充。配置不受某模型支持的强度不会隐藏该模型，但发送前会报 `UNSUPPORTED_REASONING_EFFORT`，不解析凭据或访问网络；请求显式指定的受支持强度仍可覆盖默认值。配置接受 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`，实际可用值由所选模型决定。Workflow `agent()` 参数白名单由 Host 控制，此设置不会扩展该白名单。

## 普通子代理的推理强度

DSH `0.2.0-rc.2` 和 `0.2.1-alpha.1` 的普通 Harness 子代理支持显式指定推理强度。先启用宿主的子代理模型选择设置，授权精确的 `openai-codex` / `gpt-6.1-sol` 路由，再新建主对话，让会话记录这项策略。子代理工具需使用支持 `agentOptions` 的后端，例如 Harness 进程内后端或 DSH SDK，并设置 `modelSelectionSettings: true`。外部 Codex、Claude Code 和 ACP 后端不支持这个选择接口。

先通过 `list_subagent_models` 查看已授权路由与公开的推理强度，再在普通 `subagent` 工具调用中，连同必需的任务参数传入 `provider: "openai-codex"`、`model: "gpt-6.1-sol"` 和 `reasoning_effort: "max"`。允许模型列表记录的是提供方／模型组合；强度是每次调用的独立字段，由所选模型校验。插件供账户卡片使用的 `/models` 响应不是宿主发现推理强度的接口。这不启用已冻结的 Adaptive Task，也不需要插件级强度默认值。

Workflow 的 `agent()` 是宿主的另一个接口：这两个精确 DSH 版本仅接受 `label`、`phase`、`schema`、`provider` 和 `model`，不接受 `reasoningEffort` 或 `reasoning_effort`；普通子代理设置不会为 Workflow 添加这些参数。模型元数据与本地路由校验不能证明账户具有调用权限。

## 请求重试策略

源码配置允许在 Codex Connect 插件行中添加仅加载时读取的可选 `retryPolicy`。这不是 **更多设置** 中的新控件；编辑配置后通过宿主重新加载插件。省略该键时保留宿主当前的普通策略：初次尝试后最多重试五次，可重试码为 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT` 和 `TRANSPORT`，初始退避 500 ms、上限 10,000 ms、抖动比例 0.1。

```yaml
retryPolicy:
  mode: normal
  maxRetries: 10
  retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
  backoff:
    initialDelayMs: 1000
    maxDelayMs: 20000
    jitterRatio: 0.1
```

配置复用已安装宿主的 `RetryPolicySchema` 和解析器。`normal` 模式的 `maxRetries` 必须是非负安全整数；零表示不执行策略重试。错误码列表不能为空，条目须为不重复的非空字符串。退避延迟须为不超过 2,147,483,647 ms 的正有限数，且 `initialDelayMs <= maxDelayMs`；抖动比例须在 0 到 1 之间。策略及退避对象中的未知键、当前模式的非法有效值会使加载失败，不会被静默忽略。删除该键即可恢复默认值，不要用 `null` 作为策略。

宿主还支持显式 `mode: always` 和 `backoff`：对所有模型请求失败持续重试，不限制次数，直到成功、取消或卸载；它从不默认启用。切换分层配置到 `always` 时，宿主会忽略保留的普通模式专用字段，它们不会限制重试次数。已注册策略由宿主重试插件执行，本配置不会安装或启用该插件，也不改变 OAuth、额度、Search、图片或 Auto-review 的重试。调用方取消、请求计量、preflight 截止时间和其他宿主限制均保留。适配器创建时捕获策略，已经准备的调用保留各自捕获的策略。

更多重试可能增加计费尝试次数并消耗额外额度。退避计划不是总请求截止时间，也不保证某个故障恢复窗口；请求耗时、服务端延迟、抖动、取消和其他限制仍会影响结果。这项源码变更不会追溯进入不可变的 Alpha 7 npm 安装包；合成检查不代表真实代理或账号的恢复验收。

## 可选能力

新安装只注册模型提供方，其他能力全部保持关闭：

```yaml
- id: llm-openai-codex
  config:
    enableProxy: false
    enableSearch: false
    enableReserveFallback: false
    enableImageTool: false
    enableImageGeneration: false
    enableAutoReview: false
```

请在 **设置 → 插件 → 插件配置 → Codex Connect** 或 **设置 → 模型 → Openai-Codex → 更多设置** 中编辑这些选项。修改会暂存到点击 **保存更改** 为止。保存会一次提交所有已编辑字段，并保留其他页面对未编辑字段的修改。发生编辑冲突或保存失败时会保留草稿；放弃草稿可重新加载最新设置。大多数设置只影响本插件；启用 Codex 搜索还会把它选为整个 profile 当前使用的搜索路由。

### 代理

关闭代理或卸载插件时，先给活动代理操作一秒收尾，再销毁本实例的连接池，最多再等待一秒完成。关闭期间拒绝新的代理操作；被中断的请求不会改走直连重试。代理管理器无法强制终止任意应用回调。作用域 dispatcher 会保留至迟到回调结束，防止它们绕过已销毁的代理；无关流量仍使用宿主 dispatcher。

默认使用直连。启用后，不带凭据的 HTTP(S) proxy 只应用于本插件的模型、OAuth、刷新、额度、搜索、图片和自动审查流量。检测只检查标准代理环境变量和文档列出的 loopback 候选地址，不调用模型、不消耗额度，也不保存设置。代理请求失败时，绝不会静默改走直连。加载 Codex Connect 不会替换 Node 的环境代理 dispatcher，因此其他 Harness 请求会继续使用进程已有的代理策略。

### Luna Reserve 回退

**已移除。** `enableReserveFallback` 仅作为旧配置的惰性兼容字段保留。合法旧布尔值可被读取，但有效值始终为 `false`；不会创建路由、授权 permit、协商 header、JWT entitlement 解析或后台刷新。界面不再提供该开关。

旧 `gpt-reserve` 请求会在解析账户或发送请求前报告功能已移除。请通过宿主模型选择器明确选择普通模型后继续；若宿主不支持原会话切换，保留原会话并用所选普通模型开始新对话。不会猜测目标、继承旧授权或自动更换账户。旧私有 return 文件原样保留，不读取、迁移或删除。

共享额度服务、账户 UI 和只读额度工具仍保留：绑定账户及凭据指纹的 60 秒缓存、并发 GET 合并、独立调用者取消、失败指数冷却及 Retry-After、配置失效和卸载清理。没有后台轮询。额度观测不授权改变模型或账户。

### 搜索与图片工具

- `enableSearch: true` 将 Codex 注册为可用搜索提供方，并用于整个 profile 的搜索。关闭时会注销该提供方，并恢复底层 Host 路由，保留 Host 后续的新选择；rc.2 源码候选允许新的实时选择直接生效，无需重启服务。
- 搜索从认证开始到读完响应共用 30 秒总期限。超过 1 MiB 的响应会被拒绝，失败时会取消尚未读完的响应体。调用方也可以提前取消搜索。
- `enableImageTool: true` 为具备视觉能力的模型注册 `view_image`。远程读取只接受不带凭据的公网 HTTP(S)，并重新检查 DNS 与重定向。
- `enableImageGeneration: true` 注册 GPT Image 图片生成；Alpha 4.48 构建还支持编辑明确选定的会话图片。原有纯文字生图保留，可用性、尺寸和额度仍由账户及服务端控制。
- `imageModelHint` 是“插件配置”或 profile config 中的可选设置，按 profile 保存。留空使用 `gpt-image-2`；自定义值接受 1–128 个 ASCII 字母、数字、点、下划线或连字符，且必须以字母或数字开头。保存后会修改后续请求的 `model` 字段，仍使用固定的生成或编辑端点；清空可恢复默认值。Alpha 4.47 只接受 `prompt`；Alpha 4.48 还接受显式编辑输入。这是未经验证的路由提示：服务端可能忽略或拒绝，也不保证返回指定模型。

生成的原文件保存在 `$DSH_HOME/dsh-codex-connect/images/v1`；对话会收到另一份 DSH 附件预览。结果卡片会报告尺寸和文件大小，并可下载任一版本。原文件仅允许所有者访问，下载前会校验完整性，并且只对创建会话及继承了该结果的 fork 开放。关闭能力或卸载插件不会自动删除这些文件。

**开发中变更，尚未发布：** 启用图片工具后，可保持当前聊天模型（包括 DeepSeek），无需切换模型。如果原图已保存、但对话预览保存失败，结果会明确提示，仍可**下载原图**或**基于此图修改**。直接继续使用该结果即可，无需重新生图来取回原图。原图仍须通过 Host 图片验证及会话所有权检查；取消请求或原图保存失败不会返回可恢复结果。已有安装版本仍保持原先行为。

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/zh/image-generation.png" alt="包含提示词、下载操作与图片详情的 GPT Image 结果" width="780">
</p>

#### Alpha 4.49 图片编辑

**发布后复审：** 已发布的 Alpha 4.48 存在两个已确认缺陷：重新上传的预览可能错误选中历史原图；安全的编辑失败详情未显示。以下修复适用于 Alpha 4.49；已发布的 4.48 安装包不会改写或重新发布。

Alpha 4.49 中，完整 `attachment` 选择器匹配到实际用户上传记录时使用该副本的字节，即使编号、文件名和尺寸与生成预览相同也不自动换成原图。单独的 `attachmentId` 同时对应上传图和生成结果时会提示歧义；`assetId` 仍明确选择历史原图。删除历史原图后，重新上传的副本仍可使用。模型会在图片旁收到完整、有界的附件引用，普通用户无需查找内部编号。输入有误时，界面只显示白名单内的固定原因和处理办法，不再提供原样重试；未知服务端错误仅显示安全的通用说明。


开启原有图片能力后，上传一张主图和可选参考图，并说明用途，例如：“修改第一张，只参考第二张的颜色，保留主体。”也可以在旧结果上点击“基于此图修改”。表单会等待你填写修改说明，不会一打开就提交。

工具 `codex_connect_image_generate` 接受 `{"operation":"edit","prompt":"修改背景","target":{"attachmentId":"<当前会话的精确附件 ID>"},"references":[]}`。每张参考图使用 `{"image":{"attachmentId":"<精确 ID>"},"purpose":"仅参考颜色"}`；已保存的原图也可用 `{"assetId":"<精确原图 ID>"}`。占位符仅用于说明，不能直接使用，也不授予读取权限。普通用户不需要查找这些编号，模型会收到稳定的图片句柄。

每次编辑保留旧图，并保存新的原图、预览和来源关系；可接着修改新结果，也可选旧结果另改。图片缺失、无权读取或选择有歧义时明确失败，不丢掉必要参考图继续，也不改成重新生图。旧历史只有预览时，需要明确选择低清预览。只有本次选定的图片会发送给编辑服务，原有图片开关仍默认关闭。

插件接受 PNG、JPEG 和 WebP，最多五张输入；宿主限制更严格时以宿主为准。这些是防护上限，不是服务端权限保证。输出尺寸和主体保留效果由服务端决定。超时或结果未确认时不会自动重发；手动重试可能再次消耗额度。详见[完整约定与验收边界](experiments/issue-270-image-edit.md)。

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
| `enableReserveFallback` | `false` | 已退役功能的兼容字段；合法旧值被接受但忽略 |
| `enableImageTool` | `false` | 注册 `view_image` |
| `enableImageGeneration` | `false` | 注册 GPT Image 图片生成及 Alpha 4.48 的显式编辑 |
| `imageModelHint` | 空字符串 | 可选的未验证图片路由提示；留空保持默认请求 |
| `enableAutoReview` | `false` | 使用 Codex 审查符合条件的审批请求 |
| `searchModel` | `gpt-5.6-sol` | 独立搜索使用的模型 |
| `searchMode` | `cached` | `cached`、`indexed` 或 `live` |
| `searchContextSize` | `medium` | `low`、`medium` 或 `high` |
| `searchMaxOutputTokens` | `10000` | 搜索使用的正整数输出预算 |
| `requestMetricsDirectory` | 不设置／关闭 | 启动配置中的私有绝对路径，记录[本地请求计量](request-metrics.zh.md)，不上传遥测 |
| `enableQuotaTool` | `false` | 启动时注册只读 `codex_connect_quota`；修改 profile 配置后重载插件。见[额度查询](quota-tool.md)。 |
| `requestMetricsMaxBytes` | `16777216` | 每进程单日志上限，整数 `4096`–`67108864`；不配置目录则不采集 |

Sol61（`gpt-6.1-sol`）的缺失条目或已知旧内置静态元数据使用 500,000 token 基础默认值。显式提供方元数据及用户覆盖值依次优先；重置恢复有效基础默认值。872,000 本地覆盖上限及输出上限不变。这遵循[官方 Work/Codex 产品默认策略](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)，不是端点容量实测。详见[来源校准边界](agent-notes/sol61-context-default.md)。宿主压缩策略不变，但计算预算可能随更大的上下文输入而变化。

`contextWindowOverrides` 修改的是客户端预算，不是 OpenAI 服务端容量。未知模型 ID 或超过插件文档配置上限的值会明确失败。将整个字段设为 `null` 可屏蔽继承的全部覆盖值；将单个模型设为 `null` 可恢复其目录默认值，同时保留其他条目。请为输出和协议开销预留空间，并把更大的数值视为特定部署的实验，不能当作账户权限证据。所有权与持久化规则见 [Alpha 设计](design.zh.md)。

## 诊断与恢复

### 本地安装诊断

已发布的 Alpha 4.33 在 DSH `0.1.5-rc.1` 上列出或准备 Codex 模型时，可能报 `Cannot read properties of undefined (reading 'get')`。新宿主要求按模型记录错误的索引，旧插件 profile 没有提供。包含 [Issue #178 修复](https://github.com/franksong2702/dsh-codex-connect/issues/178)的构建会初始化该索引；重新授权不能补齐这个字段。请选择与宿主版本完成验证的精确插件版本，不能仅凭属于同一 Alpha 系列判断。

若要求诊断不经过包管理器，请按[直接运行已安装 bin](runtime-identity.md#direct-standalone-doctor)的方法执行 `doctor --json`；`dsh plugin exec` 包装器自身可能核对或安装依赖。doctor 只读本地元数据且不联网，不证明另一进程的实际运行身份。兼容性状态含义：`compatible` 表示符合声明的版本要求，不是行为测试通过；`unverified` 包括未声明/混装版本，以及 peer 与明确选定 DSH 主清单不一致；`unknown` 表示缺少必要元数据或无法读取；`incompatible` 表示 Node 不满足 engine 要求。汇总依次优先采用 `incompatible`、`unknown`、`unverified`。非 compatible、不安全的凭据文件元数据或未知/不一致的插件身份会让 doctor 返回 `1`，凭据缺失本身不算错误；这不授权或建议更改 DSH。

DSH `0.1.7-rc.1` 的 `plugin exec` 会启动独立进程，普通模块解析无法看见宿主的 peer 包。Alpha 4.43 的 CLI 自带所需代码，因此所有命令都能在该进程中启动。若要让 `doctor` 核对确切宿主包版本，给 `--install-anchor` 传入该 DSH 安装中 `@deepseek-ai/dsh/package.json` 的绝对路径；该选项只读包元数据，也不会输出路径。未提供 anchor 且无法解析版本时，`doctor` 报 `unknown`，不能据此认定运行时不兼容。安装运行时检查另行启动 DSH 自身的 profile 解析器后再导入插件，保持宿主包身份一致。

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

### DSH alpha.3 的旧 Task 恢复（尚未发布）

精确的 `0.2.2-alpha.3` 保留旧状态查看、经认证的停止／转手动，以及原有严格校验的停用委派／归档安全退出。自动路由、续跑和证据子任务创建均被拒绝，包括内部直接入口；陈旧客户端不能重新激活。所有 Host 的公共入口原本就拒绝新建、续跑、升级和启用委派；原十四个 Host 的行为不变。

owner／会话绑定、已消耗计数、回执和 ledger 数据保留。恢复不会重建子任务或发送模型请求；转手动后使用明确选择的普通模型，不退还旧预留请求。清理必须有真实 Host 存活／ownership 证明；仍存活子任务、缺失／损坏状态或未确认投递继续阻断。取消信号、函数返回值不能替代投递／归档证明。不删除旧文件，不猜测账户／模型，也没有可重新打开自动化的运行时开关。
