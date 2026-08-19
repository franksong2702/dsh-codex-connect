# Codex Connect Images v4 设计与实施规格

状态：已完成阶段零实测与四轮 Claude Code 审查后的冻结设计
日期：2026-08-19
目标仓库：`/Users/xuefusong/Developer/experiments/dsh-codex-connect`
目标 DSH：`0.1.0-rc.7`

## 1. 完成标准

只有同时满足以下条件，首版才算完成：

1. 阶段零在 3081 隔离测试环境验证图片生成端点与响应协议，且报告不包含 OAuth、账号 ID、base64 图片或完整提示词。
2. 四个窄 PR 均通过各自测试和仓库总门禁。
3. 核心包单独安装时不出现任何图片能力或配置痕迹。
4. 主动安装图片包后功能默认启用，设置开关可即时关闭新调用，同时不破坏历史图片预览。
5. DeepSeek 与 Codex 等不同模型均能调用图片工具，工具只向模型回传文本摘要，不回传 image block。
6. 生成图片保存为 DSH 持久附件，刷新会话后仍可预览和下载；首版不写工作区。
7. 3081 完成一次用户自行授权的真实单图生成。3080 正式环境保持只读。
8. `pnpm run check:all`、两个隔离安装门禁、两个 pack 门禁和 `git diff --check` 全部 exit 0。
9. 发布前另行取得用户确认；本规格本身不授权 commit、push、PR、OAuth、npm 发布或生产部署。

## 2. 产品边界

采用同仓库双 npm 包：

- 核心包：`dsh-codex-connect`
- 图片包：`dsh-codex-connect-images`
- 图片包显示名：`Codex Connect — Images`
- 设置卡片标题：`Codex Connect — Images`

双包提供独立安装、卸载、版本、发布和功能边界，但不提供进程级凭据隔离。两个包运行在同一 DSH 进程、同一系统用户与同一 `$DSH_HOME`，属于同一个可信域。

首版只支持 Codex 上游端点的文生图：

- 所有模型均可调用。
- 安装图片包即启用；设置卡片可以关闭。
- 默认只保存 DSH 持久附件。
- 不提供 `output_dir`，不自动写工作区。
- 不支持图片编辑、Mask、参考图、多图输入、透明背景、后台任务和自动重试。
- 不支持与 `dsh-codex-connect-plus` 同时启用；Doctor 必须给出可读冲突提示。

## 3. 阶段零：真实协议验证

正式产品代码开始前，必须在 3081 隔离测试环境验证：

- 图片生成端点是否存在并可用。
- 图片生成端点与成功响应载体。
- 哪些请求字段真实生效，哪些字段会被静默忽略。
- 返回内容是 base64、URL 还是其他封装。
- 401、403、429、4xx、5xx 与 `retry-after` 的真实结构。
- 上游是否接受 request ID 或幂等字段。
- 调用取消后上游是否继续生成。
- 图片生成使用哪个额度桶。
- 单图耗时分布以及合理超时值。
- 隔离环境的 `ctx.attachments.imageLimits`：`maxImageBytes`、`maxMessageImageBytes`、`maxImagePixels`、`mediaTypes`。
- `dsh plugin add dsh-codex-connect-images@alpha` 对 peer dependency 的真实解析和复用行为。

安全要求：

- OAuth、refresh token、账号 ID、凭据文件内容不得进入日志或报告。
- 不复制凭据到临时脚本，不输出完整响应正文。
- 只记录状态码、字段名称、内容类型、大小、耗时和脱敏错误类别。
- 用户自行完成 OAuth。
- 如果端点或响应协议不能验证，停止项目，不根据竞品 bundle 猜测实现。
- 如果取消后上游仍继续生成，设置卡片必须常驻说明：取消只停止本地等待，上游可能继续生成并消耗额度。

阶段零产出一份脱敏验证报告，不提交产品代码。

阶段零已于 2026-08-19 完成，结论如下：

- 端点为 `POST https://chatgpt.com/backend-api/codex/images/generations`。
- 成功响应通过 `data[].b64_json` 返回图片；实测为单张 PNG。
- 唯一确认生效的用户输入是 `prompt`。
- `model`、`size`、`n`、`count`、`quality`、`background`、`output_format`、
  `moderation`、`id` 与 `request_id` 均被静默忽略，且仍会产生一次计费生成。
- 实测单图耗时约 12 到 23 秒，尺寸为 1254×1254；尺寸必须从解码后的图片文件头读取。
- `gpt-image-2` 仅可作为内部、未验证的路由提示，不得作为用户可见的模型身份声明。
- 401、403、429、5xx、取消后的上游行为、额度桶归属留待模拟测试或未来单独授权的验证阶段；
  不为这些项目继续消耗真实图片额度。

安全补充：上游对上述已测试的非 `prompt` 字段没有有效输入护栏。插件必须在本地完成所有
输入校验。任何尚未验证的新字段都视为可能产生计费请求；未经用户对独立验证阶段的明确授权，
不得再次用真实上游请求探测协议。

## 4. 仓库与包结构

仓库根目录继续承载核心包，不迁移现有源码：

```text
/
├── package.json
├── src/
├── tests/
├── packages/
│   └── images/
│       ├── package.json
│       ├── cordis.patch.yml
│       ├── compatibility.json
│       ├── LICENSE
│       ├── NOTICE
│       ├── SECURITY.md
│       ├── RELEASING.md
│       ├── README.md
│       ├── docs/README.zh.md
│       ├── src/
│       ├── tests/
│       └── scripts/check-pack.mjs
└── pnpm-workspace.yaml
```

`pnpm-workspace.yaml` 增加 `packages/*`。图片包的最终开发依赖必须使用：

```json
{
  "peerDependencies": {
    "dsh-codex-connect": ">=0.1.0-alpha.4.11 <0.1.0-alpha.5"
  },
  "devDependencies": {
    "dsh-codex-connect": "workspace:*"
  }
}
```

分阶段约束：PR-1 的非功能骨架暂时使用
`dsh-codex-connect: ">=0.1.0-alpha.4.10 <0.1.0-alpha.5"`，因为核心 Transport
尚未存在且 workspace 根包仍是 4.10。PR-2 在引入 Transport 并把核心升到 4.11 时，
必须同步把图片包 peer 下限升到 4.11。PR-1 图片包必须保留 `private: true`，直到
PR-4 完成功能、测试和发布前置条件后才可移除，避免误发布一个空骨架。

不得使用 `workspace:.`，也不得把核心包放进图片包的普通 `dependencies`。

PR-1 必须验证：

使用 Node `fs.realpath` 同时解析 workspace 根目录与
`packages/images/node_modules/dsh-codex-connect`，并断言两者相等；不得混用
`realpath` 与 `git rev-parse` 的未规范化路径。

隔离安装还要用 `npm ls dsh-codex-connect` 或等价检查证明只存在一个核心包实例。

## 5. 核心 Transport 服务

核心目标版本：`dsh-codex-connect@0.1.0-alpha.4.11`。

新增 Host-only Cordis 服务 `openaiCodexTransport`，采用 `Service` 子类，并由核心 fiber 管理生命周期：

```ts
interface OpenAICodexTransportV1 {
  readonly apiVersion: 1
  generateImages(
    input: ImageGenerationRequest,
    context: ImageRequestContext,
  ): Promise<ImageGenerationResponse>
}
```

核心必须增加 Cordis 类型增强：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    openaiCodexTransport: OpenAICodexTransportV1
  }
}
```

构建/pack 门禁必须确认 `lib/index.d.ts` 含 `declare module '@deepseek-ai/cordis'` 和 `openaiCodexTransport`。

Transport 职责：

- OAuth 刷新和重新授权错误分类。
- 固定、阶段零已验证的 HTTPS 上游地址。
- 不接受调用者提供 URL、模型名或任意请求头。
- `redirect: 'manual'`，非 2xx 不跟随。
- 统一账号请求头，但不向图片包或浏览器返回账号 ID。
- 透传取消信号。
- 自动重试固定为 0。
- 限制成功响应和错误正文大小。
- 错误脱敏，不返回凭据、原始上游错误或完整提示词。

Transport 是统一出口和审计边界，不是两个 npm 包之间的权限隔离。现有 Credential Store 公开导出保持兼容，本项目不做破坏性移除。

## 6. 图片包服务生命周期

图片包 `apply()` 的行为顺序固定为：

1. 用 `ctx.reflect.get('openaiCodexTransport')` 做非阻塞探针。
2. 缺失时只在 `apply()` 探针分支输出一次“等待核心服务”的 warning 和精确安装命令。
3. 同时注册 `ctx.inject(['openaiCodexTransport'], callback)`，让核心后加载或热重载时自动恢复。
4. 不在 `ctx.inject` 回调中重复输出缺失 warning。
5. 不在回调外缓存 Transport 引用。
6. 回调开始时先检查 `apiVersion`；不等于 1 时不注册工具并输出 error。
7. 服务消失时依靠 Cordis 自动卸载回调和工具，不写额外的失效引用管理代码。

运行时只比较结构化 `apiVersion` 和固定错误 code，不使用跨包 `instanceof`、共享 Symbol 或类身份判断。

PR-2 必须证明：

- 核心缺失时有一次可读诊断，且图片工具零注册。
- 核心后加载时自动注册图片工具。
- 核心 fiber dispose 后 `ctx.reflect.get('openaiCodexTransport')` 返回 `undefined`。
- `apiVersion !== 1` 时图片工具零注册。
- 构建后的 d.ts 保留 Cordis 类型增强。

## 7. 配置与安装语义

图片包插件 ID：`llm-openai-codex-images`。

图片包配置：

```ts
interface ImagesConfig {
  enabled?: boolean
}
```

默认值为 `true`。语义：

- 只安装核心包时，零图片工具、零图片设置卡片、零图片配置。
- 用户主动安装图片包即构成显式授权，图片能力默认启用。
- 关闭设置时，只卸载新调用的 Host 工具能力。
- 浏览器图片卡片常驻，不随开关卸载，历史图片继续预览和下载。
- 关闭或卸载图片包不删除 OAuth 和历史附件。

图片包必须包含独立 `cordis.patch.yml`，`dsh --dump-config` 必须显示 `llm-openai-codex-images` 且 `enabled: true`。

安装门禁必须同时确认核心原有 `enableSearch: false`、`enableImageTool: false`、默认模型和搜索路线保持不变。

## 8. 图片生成工具

工具名固定为：

```text
codex_connect_image_generate
```

输入：

```ts
{
  prompt: string
}
```

约束：

- `prompt` 为 1 到 32,000 字符。
- 空白 prompt 和超长 prompt 必须在本地拒绝，且不得发出上游请求。
- 内部请求体只发送 `{ model: 'gpt-image-2', prompt }`。
- `model` 仅是未验证的内部路由提示；用户界面和文档不得把它描述为已确认的模型身份。
- 不接受尺寸、张数、清晰度、背景、输出格式、moderation、自定义 URL 或输出路径参数。

输出：

```ts
{
  images: Array<{
    attachmentId: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
    width: number
    height: number
    bytes: number
    name: string
  }>
}
```

图片包根据真实媒体类型生成确定性名称：`codex-image-1.png`、`codex-image-2.jpg` 等，并在保存附件时显式传入 name。

`width` 与 `height` 必须从 PNG、JPEG 或 WebP 的文件头解码，不采信上游 `size` 回显。
张数一律由 `images.length` 推导，不在顶层重复返回 `count`。

`output.render` 只向模型返回由 `images.length` 推导的张数、解码尺寸、格式、字节数和 attachment ID 的文本摘要，不返回 image block。因此所有模型均可调用，生成图片不会重新进入模型视觉上下文。

## 9. 去重、取消与计费

- 自动重试次数固定为 0。
- 同一 DSH tool call 在进程内只允许一个进行中请求。
- 使用 DSH 可获得的 session/call execution identity 建立去重键。
- 不发送 `id`、`request_id` 或其他幂等字段；阶段零已经确认这些字段会被静默忽略。
- 不得宣传请求幂等。
- 超时、取消或断网提示必须说明再次生成可能再次消耗额度。
- 日志只记录插件内部生成的追踪 ID、状态、耗时、由 `images.length` 推导的数量和字节数；不记录完整提示词。

## 10. 图片验证与附件保存

处理顺序：

1. 有上限地读取上游响应。
2. 严格解析 JSON/base64 或阶段零确认的返回格式。
3. 检查 PNG、JPEG、WebP 真实文件签名。
4. 检查数量、尺寸、像素、单图字节和总响应大小。
5. 所有图片验证完成后统一调用 DSH 批量附件保存。
6. 验证失败时不开始写入。
7. 存储失败时不返回部分引用、不返回伪成功；不承诺底层绝对没有产生不可达内容对象。

插件在保存前读取运行期 `ctx.attachments.imageLimits`，并使用其中的
`maxImageBytes`、`maxMessageImageBytes`、`maxImagePixels` 与 `mediaTypes` 先行拦截，
以便由插件控制错误文案。总响应硬限制为 48 MB，错误正文硬限制为 64 KB，
最多接受 4 张作为防御性上限；阶段零实测上游始终返回 1 张。

首版不写工作区，避免路径逃逸、符号链接、覆盖和部分文件写入语义。

## 11. 浏览器图片卡片

通过 rc.7 keyed slot 注册：

```text
slot: tool.call.toolview
key: codex_connect_image_generate
```

卡片状态：

- 等待：标题、不确定进度状态、通常需要 13 到 23 秒的提示，以及单张 PNG 的预期；
  不显示未经验证的模型名或可配置张数。
- 完成：DSH `ImageGallery`。
- 点击缩略图：DSH 原生 `ImageLightbox`。
- 失败：脱敏错误和重新授权提示。
- 取消：明确本地已取消，但不保证上游停止生成。

首版不实现 Lightbox 上一张/下一张。多张图片通过分别点击缩略图打开。

下载按钮放在卡片操作区，使用图片包自己的中英文词条，不把 download 塞入 `MessageImageLabels`。

用户可见的模型说明固定为：

- 中文：`图片由 Codex 上游端点生成。具体使用哪个模型由上游决定，本插件不指定、也不作声明。`
- English: `Images are generated by the Codex upstream endpoint. The upstream decides which model runs; this plugin does not specify it and makes no claim about it.`

图片包手工构造 DSH rc.7 要求的 labels：

- `image`
- `open`
- `openNamed`
- `loading`
- `loadFailed`
- `lightbox.dialog`
- `lightbox.close`

图片加载路径：

```text
sessionId
→ ctx.sessions.binding(sessionId)
→ session.readAttachment(attachmentId)
→ Blob
→ URL.createObjectURL()
```

Blob URL 只存在于组件生命周期内，不进入会话、工具结果、日志或附件元数据；图片替换和组件卸载时必须 `URL.revokeObjectURL()`。

扩展未加载时，通用工具卡只显示文本摘要和 attachment ID，并明确提示需要 Codex Connect Images UI 才能预览；不承诺通用卡显示图片。

## 12. 客户端依赖与 Compatibility

图片包 `dsh.client.inject` 至少包含：

- `@deepseek-ai/dsh-client-ui-tool`
- `@deepseek-ai/dsh-client-ui-attachment`
- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-locale`

这些是最终 PR-4 客户端所需的注入声明。PR-1 不把尚未使用的客户端包写进图片包
manifest 或 lockfile，避免改变核心包现有的 peer 解析图；客户端 `inject` 和 `apply()`
均保持空。PR-4 在真正使用这些契约时再同步加入依赖、注入和兼容声明。

`compatibility.json` 的声明清单记录所有使用的 Host/Client rc.7 公共契约。

运行时 compatibility 解析集只包含 Host 能解析且有运行意义的包：

- `@deepseek-ai/dsh-attachment`
- `@deepseek-ai/dsh-tools`
- `dsh-codex-connect`

`dsh-client-*` 只进入声明清单，不进入 Host 运行时 `import.meta.resolve` 校验，避免 Doctor 假报 incompatible。

## 13. 设置卡片

设置卡片显示：

- 图片能力启用状态。
- 核心包版本和 Transport API 版本。
- OAuth 登录或重新授权状态。
- 图片由 Codex 上游端点生成，具体模型由上游决定，本插件不作模型身份声明。
- 单次生成通常需要 13 到 23 秒；实测输出为单张 PNG，尺寸由上游决定且不可指定。
- 图片调用可能消耗额外额度。
- 社区 Alpha、非官方背书和未公开上游接口可能变化。
- 启用/关闭开关。
- 如果阶段零确认取消不会停止上游，常驻显示对应计费提示。

不得显示 Token、账号 ID、凭据路径、原始上游错误、OAuth URL 或授权码。

## 14. CI、Pack 与发布

保留核心根脚本 `pnpm run check` 的现有字符串结构，避免破坏 `check-release-workflow.mjs` 契约。

新增仓库总门禁：

```bash
pnpm run check:all
```

它至少执行：

```bash
pnpm run check
pnpm --filter dsh-codex-connect-images run check
pnpm run check:release-workflow-images
```

图片发布 workflow 使用独立标签：

```text
images-v0.1.0-alpha.1
```

核心继续使用：

```text
v0.1.0-alpha.4.11
```

新增 `scripts/check-release-workflow-images.mjs`，继承核心发布门禁：

- 禁止长期 `NPM_TOKEN`。
- Actions 固定 SHA。
- GitHub Environment 人工审批。
- npm OIDC Trusted Publishing。
- package path、name、version 和 `images-v*` 标签一致。
- `npm publish --tag alpha --provenance` 只能在完整检查之后执行。
- 发布动作前必须重新执行核心与图片包两个隔离 DSH 安装门禁。
- 禁止 workflow 自动修改 dist-tag。
- PR-1 到 PR-3 期间图片包保持 `private: true`，workflow 必须检测该字段并失败关闭；
  PR-4 移除 private 后才具备发布资格。

图片包 `check-pack.mjs` 必须验证：

- 必需文件：`LICENSE`、`NOTICE`、`README.md`、`package.json`、`cordis.patch.yml`、`compatibility.json`、`lib/index.js`、`lib/client.js`。
- 不包含 `src/`、`tests/`、`scripts/`、`.env`、`.git`、`node_modules`。
- 不包含 `auth.json`、credential、token 或其他敏感文件。

npm `latest` 策略不在本项目中自动改变。所有 Alpha 安装文档明确使用 `@alpha`。

发布本身必须在四个 PR 合并、3081 真实 smoke 通过且用户再次确认后执行。

## 15. PR 拆分

### PR-1：Workspace 与发布治理

- 将本规格原样纳入仓库 `docs/design/codex-connect-images-v4.md`，作为后续 PR 的版本化依据。
- workspace 扩展。
- 图片包 skeleton、`cordis.patch.yml`、`compatibility.json`。
- 图片包 skeleton 的 `Config` 与默认启用配置是真实契约，但 Host 与浏览器 `apply()`
  均为空，不注册工具、服务、路由、设置卡或网络请求。
- `workspace:*` 和单核心实例门禁。
- 图片包 build/lint/test/pack/install gate。
- `check:all` 和图片包独立 release workflow contract。

### PR-2：核心 Transport 服务

- Cordis `Service` 子类。
- 类型增强和 d.ts pack 断言。
- OAuth 刷新、固定路线、脱敏、超时、取消、响应上限。
- 服务缺失 warning、后加载恢复、热重载和 API version 测试。

PR-2 未验证服务生命周期、d.ts 和 API version 前，不进入 PR-3。

### PR-3：图片 Host 能力

- 工具注册和默认启用设置。
- 输入/输出协议。
- 去重、零重试和取消语义。
- 图片验证、确定性名称、批量附件保存。
- 所有模型可调用且 output.render 仅文本。

### PR-4：聊天 UI 与发布准备

- ImageGallery、ImageLightbox、session-authorized loader。
- Blob URL 生命周期。
- 卡片级下载和手工 labels。
- 历史回放、设置卡片、双语文档、安全声明和发布准备。

每个 PR 必须是窄 diff，可独立审查和回滚。不得把四个 PR 合成一个巨型 PR。

## 16. 测试矩阵

必须覆盖：

- 未登录、重新授权、401、403、429、4xx、5xx。
- 重定向拒绝和自定义 URL 不可注入。
- 超时、取消、零自动重试和同 call 去重。
- 非法 JSON/base64、错误签名、超限响应、零图片。
- 实测单张结果，以及上游意外返回多张时的防御性处理。
- 附件验证失败零写入；存储失败不返回部分引用或伪成功。
- 确定性文件名和真实媒体类型扩展名。
- 所有模型均可调用，但结果无 image block。
- 安装默认启用、即时关闭和重新启用。
- 关闭后历史会话图片仍可预览。
- 页面刷新后的附件回放。
- Blob URL 创建和回收。
- 等待、完成、失败、取消、Lightbox、下载和通用回退。
- 核心单独安装时默认配置完全不变。
- 两个 npm 包的 pack 内容、版本、标签和 workflow 不混淆。
- 空、空白或超过 32,000 字符的 prompt 被本地拒绝，且不发出上游请求。
- 响应回显尺寸与解码尺寸不一致时，以文件头解码结果为准。
- `data[]` 为空或缺少 `b64_json` 时零附件写入、零伪成功。
- 运行期 `imageLimits` 小于图片实际值时，由插件先行拒绝。

最终验收命令：

```bash
pnpm run check:all
pnpm --silent run check:dsh-install
pnpm --silent run check:dsh-images-install
npm pack --dry-run --json
pnpm --filter dsh-codex-connect-images exec npm pack --dry-run --json
git diff --check
```

## 17. 明确不在首版实施

- 图片编辑、Mask、局部重绘。
- 参考图、多图输入。
- 透明背景。
- 写入工作区和 `output_dir`。
- 自动重试、一键重新生成。
- Lightbox 上一张/下一张。
- 后台任务队列。
- 额度预测和成本估算。
- 尺寸、张数、清晰度和背景选项。
- 请求幂等。
- 额度桶归因。
- 与 `dsh-codex-connect-plus` 共存。
- 将生成图片重新注入模型上下文。

## 18. 实施纪律

- 开始前核对真实 cwd、`AGENTS.md`、分支、HEAD、远端 main 和工作树。
- 当前历史 checkout 可能落后远端；不得在旧 main 上直接修改。
- 每个 PR 使用独立 exact-head worktree，冻结文件范围。
- 保留用户已有脏改动，不 reset、clean 或覆盖。
- 阶段零之外不读取或显示 OAuth 信息。
- 不写 3080 正式环境。
- 未经用户明确授权，不 commit、push、开 PR、合并、tag 或发布。
- 同一错误连续两次仍未解决时停止，报告现状、尝试和剩余假设。
- 每个完成声明必须报告验证命令、exit code、结果和证据路径。
- 交付前做一次初见审查，写出多疑资深工程师的具体反驳及回应。
