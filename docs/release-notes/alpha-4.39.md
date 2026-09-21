# Alpha 4.39 — unified Codex backend request governance

## English

Alpha 4.39 delivers the backend-request architecture follow-up from #219 and merged PR #227. It centralizes authenticated `chatgpt.com/backend-api` traffic behind one plugin-owned governance layer without claiming that the reporter's persistent upstream condition was caused by request identity or traffic shape.

- Model/pi-ai, Search, quota, image generation, Auto-review, and native compaction now share request admission, cancellation/deadline composition, Codex-only proxy scope, per-attempt request correlation, and bounded response metadata.
- Direct plugin routes use the existing honest plugin identity; the model route preserves pi-ai's provider identity. The plugin does not impersonate Codex CLI/Desktop or invent undocumented first-party headers.
- Authenticated backend requests fail closed outside `https://chatgpt.com/backend-api/`, reject credential-bearing URLs, and do not automatically follow redirects.
- One plugin instance admits at most eight simultaneously open backend responses. Queue waits remain cancellable, cooldown waits do not consume a slot, and an already queued request rechecks cooldown before dispatch.
- HTTP 429/503 with valid Retry-After creates lane-local server-directed cooldown. The client does not infer an account block, truncate a longer service-directed deadline, or automatically replay failed model turns.
- Follow-up review hardened stream cancellation/body cleanup, queued deadlines, Request-signal propagation, redirect protection, and response cleanup when hooks fail.

Existing route-specific semantics remain in place: pi-ai owns ordinary model/SSE retries, quota keeps its credential-bound cache/backoff, native compaction keeps its bounded retry loop, and Search/Image/Auto-review do not gain automatic replay.

For a declared compatible DSH host, pin the exact version after checking the installed host:

~~~sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.39
dsh plugin --profile web exec dsh-codex-connect doctor --json
~~~

All optional capabilities remain disabled by default. This release does not close #219 or establish undocumented OpenAI risk-control behavior. It does not change OAuth credentials, daily services, or the separately managed `latest` npm channel.

## 中文

Alpha 4.39 交付 #219 暴露出的后续架构工作以及已合并的 #227：把经过认证的 `chatgpt.com/backend-api` 流量统一收敛到插件内部的一层请求治理中，但不把“请求身份/流量形态触发了上游风控”当作已经证实的因果关系。

- Model/pi-ai、Search、额度、图片生成、Auto-review 和 Native Compaction 共享请求准入、取消/超时组合、Codex 专用代理作用域、每次 HTTP 尝试的 request ID 与有界响应诊断。
- 插件直连路径使用一致且诚实的插件身份；模型路径继续保留 pi-ai 自己的 provider 身份，不伪装 Codex CLI/Desktop。
- 携带认证的请求只允许发送到 `https://chatgpt.com/backend-api/`，拒绝 URL 中嵌入凭据，也不会自动跟随重定向。
- 单个插件实例最多同时持有 8 个开放的后端响应；排队和冷却等待可以取消，冷却不占并发槽位，排队完成后会再次检查是否仍需冷却。
- 只有 HTTP 429/503 且服务端提供有效 Retry-After 时才建立对应 lane 的冷却；不会据此推断“账户被封”，不会缩短服务端要求的更长等待，也不会自动重放失败的模型请求。
- 合并前二次 review 进一步修复了流取消/响应体清理、排队超时、Request signal 传递、重定向保护以及诊断 hook 失败后的资源释放。

原有各路径的协议语义保持不变；所有可选能力仍默认关闭。这个版本不代表 #219 原始持续故障已经由报告者确认恢复，也不会修改 OAuth 凭据、日常服务或单独维护的 npm `latest` 渠道。
