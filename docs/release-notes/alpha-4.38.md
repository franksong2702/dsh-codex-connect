# Alpha 4.38 — persistent-error diagnostics and quota traffic

## English

This release addresses confirmed client-side defects from #219, not a proven account-block cause or verified recovery of the reporter's 23-hour condition.

- Preserve bounded HTTP/SSE error code/type and request IDs through the model adapter, with a unique client ID per HTTP attempt. Append diagnostics after Harness classification; leave model retries and client identity unchanged. No raw payload, token or account ID is added to the diagnostic suffix.
- Pause quota polling in hidden pages; share and coalesce ordinary quota reads even when Reserve is disabled. Apply increasing failure backoff, valid server Retry-After hints, and credential-bound rejection state. Reserve background polling stops after two minutes without foreground demand.
- Fix expiry timers cancelling fresh requests and prevent unread later SSE errors from being attributed to earlier malformed/oversized/terminal frames.

Validated with 1012 local tests, 32 Chromium UI tests, both Node CI targets and a four-host identical-artifact installation matrix. A separate DSH 0.1.6-alpha.1 synthetic canary passed on macOS / Node 22.22.3; that is not full declared support or Windows/live-account acceptance.

For the four declared DSH versions (0.1.2-rc.1, 0.1.5-alpha.1, 0.1.5-rc.1, 0.1.5-rc.2), pin the exact plugin version after checking the installed host:

~~~sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.38
dsh plugin --profile web exec dsh-codex-connect doctor --json
~~~

Keep your current profile name and host version. npm alpha now points to 4.38; latest intentionally remains 4.34. No automatic OAuth, account rotation, first-party impersonation or service restart is part of this release.

npm processing delayed public availability beyond the original workflow's readback window. The recovery-only workflow completed the missing GitHub prerelease after exact archive verification; npm was not republished. The released tag and package identify commit `40dae54cac2561eb153cb217353a0b7345a43b8d`.

#219 remains open pending comparable normal-use verification or service-side evidence. If the failure recurs, retain the timestamp and bounded error fields; share request IDs privately with the service operator, never tokens or complete session archives.

## 中文

本版修复 #219 中已确认的客户端诊断与额度查询缺陷，不把 overloaded 文案当作封号证据，也不声称已验证原始持续故障恢复。

错误信息现在保留有界的 HTTP/SSE 错误码、类型和请求标识；每次 HTTP 尝试具有独立标识，且在 Harness 完成分类后追加诊断，避免误分类。不会在新增诊断中保存 token、账户 ID 或完整响应正文，也不修改客户端身份或增加模型请求重试。

隐藏页面暂停额度轮询，普通查询也共享缓存并合并并发请求；失败逐步退避并遵守 Retry-After。Reserve 在两分钟无人读取后停止后台查询。同时修复旧定时器误取消新请求、错误归因到未读取的后续 SSE 帧两处回归。

完整测试、浏览器测试、Node CI 和四个声明支持的 DSH 安装组合均通过。报告者所用 DSH 0.1.6-alpha.1 的额外模拟检查也通过，但不等于 Windows 实机或真实账户验收。请保留现有 DSH 和 profile，使用上方精确版本命令；本版不自动登录、切换账户或重启服务。#219 仍等待报告者确认同类正常使用下是否恢复。
