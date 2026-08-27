# Codex Connect 图片生成：单插件设计

状态：实现契约
适用包：`dsh-codex-connect`
适用 DSH：`0.1.1-rc.2`

## 1. 产品结论

图片生成是 Codex Connect 的一项可选能力，不是第二个产品，也不是第二个 DSH 插件。

- npm 只安装 `dsh-codex-connect`。
- DSH 配置只出现 `llm-openai-codex`。
- 设置页只显示一张 **Codex Connect** 卡片。
- 图片生成默认关闭，由用户在这张卡片中显式开启。
- 开启后立即注册图片生成工具；关闭后不再接受新的图片生成调用。
- 关闭能力不影响已经保存在会话里的图片继续预览和下载。对话预览初始完整适配窗口，放大后可拖动或滚动查看任意区域，并可恢复适屏显示；精确原文件通过单独下载动作获取。

不再发布、安装或维护 `dsh-codex-connect-images`、`llm-openai-codex-images`、独立设置卡、独立发布 workflow 或第二套版本号。

## 2. 用户界面

现有设置卡新增一个与搜索、`view_image` 并列的开关：

- 中文标题：`启用图片生成`
- 中文说明：`使用你当前 GPT 订阅计划提供的图片生成能力。`
- English title: `Enable image generation`
- English help: `Use the image generation capability included with your current GPT subscription.`

界面不展示具体图片模型名称，不使用“上游”等实现术语，也不把图片生成与现有 `view_image` 混为一项能力。

配置契约：

```yaml
- id: llm-openai-codex
  config:
    enableSearch: false
    enableImageTool: false
    enableImageGeneration: false
```

`enableImageTool` 继续只控制 `view_image`；`enableImageGeneration` 只控制生成新图片。

## 3. Host 生命周期

主插件 fiber 继续独占 OAuth credential store 和 `openaiCodexTransport`。图片工具不得自行读取 credential 文件，也不得建立第二套认证或网络 transport。

设置变化通过主插件已有的 staged Save/Discard 契约进入 Host：

1. `enableImageGeneration: false`：不注册 `codex_connect_image_generate`。
2. 从 `false` 保存为 `true`：在 `tools` 与 `attachments` 可用时注册工具。
3. 从 `true` 保存为 `false`：dispose 工具 fiber；已经开始的调用按 DSH 工具生命周期处理。
4. 插件停止：等待 capability tail，随后 dispose 图片工具 fiber。

搜索、`view_image` 和图片生成使用独立 fiber 与串行 reconcile tail，任一能力切换不得改变另外两项。

## 4. 工具契约

工具名固定为 `codex_connect_image_generate`。

输入只有一个字段：

```json
{ "prompt": "1 到 32000 个字符的图片描述" }
```

约束：

- 拒绝额外字段、空白 prompt 和超长 prompt。
- 工具按 exclusive 模式执行，避免一次模型回复并行触发多次生成。
- 插件不自动重试。
- transport 请求体由核心 transport 统一构造，工具层不接受尺寸、质量、背景、张数或模型参数。
- 取消信号直接传给 transport；失败文案固定且脱敏，不回显响应正文、OAuth 数据或账户信息。

## 5. 图片校验与保存

返回内容在写入附件存储前必须全部通过校验：

1. 图片数量为 1 到 4，并且不超过运行期 `ctx.attachments.imageLimits.maxImagesPerMessage`。
2. base64 必须是 canonical 编码；先估算字节数，再分配解码缓冲区。
3. 单张与整批字节数分别符合 `maxImageBytes` 和 `maxMessageImageBytes`。
4. 文件头只接受有效 PNG、JPEG 或 WebP，并从文件本身解析宽高。
5. media type 必须在运行期 allowlist 中。
6. 像素数不超过 `maxImagePixels`。
7. 校验完成后先把服务返回的精确字节写入插件自有的版本化目录 `$DSH_HOME/dsh-codex-connect/images/v1`，文件和 metadata 权限仅限 owner；资产使用随机不透明 id，并记录所属 session、SHA-256、格式、尺寸和字节数。
8. 再把同一批输入交给 `ctx.attachments.saveImages` 生成对话预览。DSH 可以按运行期策略缩放或重新编码，插件必须把返回的引用和 metadata 视为权威预览结果，不能要求它与原文件相同。
9. DSH 返回的 `attachmentId` 必须是非空字符串，但继续视为不透明标识，不假定哈希格式。
10. DSH 预览保存失败、返回数量不完整或 metadata 非法时，回滚本次新建的精确原文件；任何一张图片失败时，不向模型返回部分成功结果。

插件不自动删除已发布的原文件：关闭能力后历史结果仍可下载；卸载插件会保留文件，但结果卡片下载需要安装插件。数据保留策略由设备所有者管理。

## 6. 稳定结果格式

工具结果保留一份版本化、可严格解码的展示 metadata：

```ts
{
  kind: 'codex-connect-images',
  schemaVersion: 1,
  prompt: string,
  images: Array<{
    original: {
      assetId: string,
      mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
      bytes: number,
      width: number,
      height: number,
      name: string,
      sha256: string
    },
    preview: ImageAttachmentRef
  }>
}
```

解码器拒绝未知 kind/version、空数组、超过 4 张、非法 media type、非正整数尺寸与字节数、非法 asset id、文件名、SHA-256 或空 attachment id。为兼容已经落盘的早期会话，缺少 `schemaVersion` 且 `images` 仍为 `ImageAttachmentRef[]` 的旧 metadata 会被解码为仅含 preview 的结果；其他未知格式不做自由文本猜测。

原文件二进制不写入 session JSON；session 只持久化上述有界引用。

## 7. 浏览器展示

主包 client entry 始终注册 `tool.call.toolview`，key 为 `codex_connect_image_generate`。该注册不受 `enableImageGeneration` 当前值影响，这样关闭能力后仍能回放历史图片。

展示要求：

- 工具结果视图自带纯 props 图片画廊和 Lightbox；rc.2 的 `dsh-client-ui-attachment` React atoms 只通过对话 slots 提供，工具视图不读取其私有 `src/*` 路径。
- 通过当前 `sessionId` 的 session binding 读取附件，不能跨会话猜测或拼接路径。
- 校验读回 attachment id 与请求 id 一致。
- Blob URL 按 session 缓存，在 session 切换或组件卸载时 revoke。
- 错误、取消、重新认证和未知旧结果使用固定本地化状态，不显示私密响应内容。
- **下载预览**继续使用同一条 session-bound 附件读取路径。
- **下载原文件**使用插件注册的同源 GET 路由。路由必须复用可信 origin 判定，同时校验不透明 asset id。请求会话必须是创建时的 owner，或在 DSH 持久化的 fork 前缀中继承了完整匹配的原图引用；仅有父子关系不授予读取父会话全部图片的权限。读取后复核文件权限、SHA-256、格式、尺寸和字节数；不接受路径或客户端提供的继承证明作为输入。
- 原文件下载路由由主插件常驻注册，不受 `enableImageGeneration` 当前值影响，以保证关闭生成能力后历史结果仍可下载。

`@deepseek-ai/dsh-client-ui-slots` 是 DSH Web 的静态平台模块，只作为构建期依赖并 externalize，不得写进 `dsh.client.inject`。工具结果不依赖 `@deepseek-ai/dsh-client-ui-attachment`；后者的 rc.2 React atoms 只服务它注册的对话 slots。

## 8. 打包与发布

- 根 `package.json` 是唯一 manifest，版本仍由 Codex Connect 的现有发布流程管理。
- 根 `lib/index.js`、`lib/index.d.ts` 和 `lib/client.js` 同时包含图片能力。
- 根包只有现有 `.github/workflows/release.yml`；不保留图片专用发布 workflow。
- `pnpm run check` 覆盖 lint、Host/browser typecheck、所有测试、build、兼容性与 pack 内容。
- 隔离安装门禁必须确认三个可选能力都为 `false`，默认模型和搜索路线保持不变，而且只安装一个插件。

## 9. 验收

代码门禁：

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm --silent run check:dsh-install
git diff --check
```

3081 隔离验证：

1. profile manifest 只有 `dsh-codex-connect`，没有 companion package。
2. `dump-config` 只有一个 `llm-openai-codex`，新字段默认为 `false`。
3. 设置页只有一张 Codex Connect 卡片，并显示精确中英文说明。
4. 关闭时工具不可用；保存为开启后工具出现；再次关闭后新调用不可用。
5. 关闭状态下仍能回放一条历史图片结果，画廊、Lightbox、原文件下载和预览下载工作正常。
6. 使用真实 `LocalAttachmentStore` 的测试证明：DSH 把预览缩小后，插件保存并下载的原文件仍与服务返回字节完全一致。
7. 下载路由允许继承图片结果的 fork 会话（包括嵌套 fork 和恢复后的会话），拒绝提前 fork、无关会话、篡改引用、非法 asset id、非 GET 方法和不可信远端请求；损坏文件不会作为原图返回。
8. 测试环境验证不读取或输出 OAuth 文件内容，不触碰 3080。

只有上述门禁全部有可复查证据后，重构 PR 才具备合并条件。
