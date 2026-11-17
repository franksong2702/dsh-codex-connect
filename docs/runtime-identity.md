# Runtime identity and read-only diagnostics

This describes development builds containing the runtime-identity change. Older published packages can lack the card/receipt; absence is **unknown**, not a broken installation. The published-version recommendation and exact Host support set do not change with this document.

## Start with the running page

In **Settings → Plugins → Codex Connect → Runtime identity**, one bounded, uncached same-origin read compares:

- **This page's plugin**: the version embedded in the browser code, never copied from an update response.
- **Host-loaded plugin**: the version embedded in the code answering the authenticated request.
- **Installed package**: the current public manifest of that same plugin installation, not evidence that new code has loaded.
- **Selected DSH installation**: metadata from the Host launcher's optional public installation anchor. The DSH manifest and all three diagnostic API peers must agree. No anchor means unknown, with no fallback to another profile or an ancestor installation.

The Host response requires both current DSH Connection admission and the plugin's Origin restrictions. Missing authentication, unavailable services, old/malformed responses and failed rechecks never become a match. A failed recheck clears earlier evidence. This identity check does not poll, install, refresh the page, restart DSH, change settings, request an account/model, or read OAuth contents. Adjacent existing account controls retain their ordinary status/quota reads; this is not a claim that the entire settings page is credential-free.

Matching **plugin version declarations** does not prove identical archive bytes, the Desktop shell version, model access, or full feature acceptance. A Host response observes this request's handler, not the byte identity of every loaded DSH module. The selected DSH version is installation metadata. If only the page differs, refresh it; if installed and Host-loaded plugin versions differ, save work before a normal Host restart. Unknown evidence alone is not grounds to reinstall, downgrade, delete shared dependencies, or restart a working application.

**View diagnostic receipt** shows a local, allowlisted JSON projection. It contains versions/statuses and a browser observation timestamp, not account identifiers, credentials, file paths, raw errors, prompt/tool content or conversation state. It is not uploaded automatically. It does not inherit the registry update card's 24-hour cache or use an `up-to-date` registry result as runtime proof.

The decoder recomputes compatibility from decoded versions using the same Node-free policy as the Host; it rejects contradictory status labels or changed support ranges. Mixed peers stay unverified even without `currentDshVersion`. A compatible peer tuple without root-coherence evidence cannot claim selected-installation compatibility. Truthful incompatible/unverified reports remain readable; malformed evidence instead clears the observation to unknown.

## Direct standalone doctor

For package-manager-free diagnostics, execute the **already installed** bin directly with a suitable existing Node runtime. These are placeholders for paths you have independently identified, not commands to discover/download an executable:

```sh
node /absolute/profile/node_modules/dsh-codex-connect/lib/bin.js doctor --json \
  --install-anchor /absolute/dsh/node_modules/@deepseek-ai/dsh/package.json
```

Set `DSH_HOME` deliberately for the intended installation before invoking diagnostics. Do not copy or inspect an OAuth document to locate it. **ASAR-member metadata deliberately remains unknown**, including in an ASAR-capable Electron runtime: a generic file descriptor cannot prove a virtual member's identity, and opening it can implicitly extract a file. The reader rejects ASAR path components before opening members; it does not extract, use an unbounded fallback or substitute another installation. The running-page receipt can still observe the Host-loaded plugin declaration while selected DSH metadata stays unknown. Do not replace Desktop's bundled runtime, install a separate Host, or select an unrelated CLI merely to obtain a green diagnostic.

The direct `doctor` entry reads public package metadata and uses `lstat` for credential-file metadata only. It never opens the OAuth document, fetches a provider, invokes a package manager, writes a profile, or starts a Host. `dsh plugin exec`, `pnpm exec` and `npx` are wrappers with their own dependency reconciliation/install behavior; they are **not** a guarantee of a read-only invocation. Do not use such a wrapper merely to collect a no-write receipt.

JSON keeps schema version 1 and adds an `identity` record. `standalone`/`selected-installation` describe the observation context, not a running Host or browser. An explicit anchor selects only the named DSH installation's metadata; an invalid anchor never falls back. Without an anchor, lookup is limited to this plugin's own logical dependency roots, including normal pnpm peer symlinks. Foreign ancestor dependencies are not treated as the active Host. Plugin-owned pi-ai remains separate from Host peers.

In builds with range admission, `compatible` means the exact version pairing has verified coverage. `unverified-in-range` means the selected DSH root and its peers form one coherent version allowed by the host range, with no exact verified entry. `known-bad` means an explicitly excluded version. Other results include `unverified` for mixed or out-of-range tuples, `unknown` for missing metadata and `incompatible` for unsupported Node engines. These are local metadata checks. Non-compatible results, unsafe credential metadata and unknown or mismatched plugin identity return exit 1. Missing credentials alone allow diagnostics to succeed.

## 中文

“运行身份”仅在包含本改动的开发构建中提供；旧发布包没有该卡片或回执时应视为未知，不应直接判断安装损坏。本改动不更换已发布推荐版本，也不扩大精确宿主支持集合。

在 **设置 → 插件 → Codex Connect → 运行身份** 中分别核对页面自身编译版本、正在响应的 Host 插件编译版本、该插件磁盘清单版本和宿主启动时所选 DSH 安装元数据。DSH 主清单与三项诊断 API 必须一致；无安装锚点时不沿其他 profile、祖先目录、PATH 或可执行文件位置猜测。服务端要求当前 DSH 认证与 Origin 防护同时通过。失败重查会清除旧结果，未知不会伪装成一致。

本次身份检查只做有期限、不缓存的同源读取；不请求账户/模型、不读 OAuth 内容、不安装依赖、不改配置、不刷新页面、不重启。相邻的既有账户控件仍会按原有行为查询登录状态/额度，不能因此声称整个设置页不访问凭据。版本声明一致不代表包字节、Desktop 主程序、实际模型权限或所有功能已经验收。仅页面不同可刷新；Host 与磁盘不同应先保存工作再正常重启。仅凭未知不得重装、降级、删除共享测试依赖或重启正常工作的应用。

回执由用户主动查看，不自动上传；只包含允许输出的版本、状态和浏览器观察时间，不包含凭据、账户标识、路径、原始错误、提示词、工具参数或会话内容。发布版本检查的“已最新”及其缓存，不是实际运行身份的证明。

解码器与 Host 共用不依赖 Node 的规则，从版本重新计算兼容性，拒绝矛盾状态或被更换的支持范围。支持区间准入的构建会区分已验证的精确组合、在范围内但未验证，以及明确排除的版本。范围内的回执也要求主清单和 peer 版本一致。混版、超出范围、缺失元数据与 Node 版本不合要求各自保留相应状态。回执畸形时会清除观察并回到未知。

严格只读的 CLI 诊断应直接执行已经安装的 bin，明确正确 `DSH_HOME` 与 DSH 安装锚点；上面的路径只是占位。**ASAR 成员元数据有意保持未知**，即使 Electron 自身能读 ASAR：普通文件句柄不能证明虚拟成员身份，open 还可能隐式解包写临时文件。因此读取器在打开成员前拒绝 ASAR 路径组件，不解包、不回退无界读取，也不替换成另一安装。运行页面仍可观察 Host 已加载插件的版本声明，但所选 DSH 元数据可保持未知。不得为了变绿替换 Desktop 运行时、另装 Host 或选用无关 CLI。`dsh plugin exec`、`pnpm exec`、`npx` 自身可能核对或安装依赖，不能作为“无写入”的保证。

独立 doctor 只观察本地安装，不证明任何 Host/页面正在运行。未指定锚点时不再读取祖先的旧测试依赖；指定锚点无效时也不会回退猜测。JSON 保留 schema 1 并增加身份字段；原有兼容性与凭据权限检查保持严格，插件身份未知/不一致也返回 1。凭据缺失本身不算故障，更不要求重新登录。
