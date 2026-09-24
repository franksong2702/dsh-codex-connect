# Codex Connect Alpha 4.46 — Windows proxy response decoding

## English

When the optional Codex proxy is enabled on Windows, Alpha 4.45 can receive a successful compressed response but expose its gzip bytes without the encoding header. OAuth token exchange or quota refresh can then fail while parsing JSON. Alpha 4.46 routes Fetch calls inside the plugin's proxy scope through the same Undici runtime as its proxy agent; unrelated Fetch calls keep the host's original transport. A failed proxy request still does not retry directly.

This release targets DeepSeek Harness `0.1.7-rc.1`. The published 4.45 failure was reproduced without credentials on a Windows PC. The fix passed keyless Windows CI, including compressed JSON and proxy ownership checks. Real Chrome OAuth and quota refresh with the patched package on that PC remain unverified. This release does not address the separate, still-unconfirmed message-source report in Issue #261. Publishing to `alpha` does not promote npm `latest` or install the plugin in an existing profile.

After npm publication is independently confirmed, install this exact version with:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.46
```

## 中文

在 Windows 上启用可选的 Codex 代理时，Alpha 4.45 可能收到成功的压缩响应，却丢失编码标头、把 gzip 原始字节交给调用方，导致 OAuth 换取凭据或额度刷新在解析 JSON 时失败。Alpha 4.46 让插件代理作用域内的 Fetch 使用与代理组件相同的 Undici 运行时；无关的 Fetch 仍使用宿主原有传输方式。代理请求失败时仍不会静默改走直连。

本版针对 DeepSeek Harness `0.1.7-rc.1`。已在 Windows PC 上不使用凭据复现发布版 4.45 的故障；修复通过了无凭据的 Windows CI，包括压缩 JSON 和代理所有权测试。该 PC 上安装修复包后的真实 Chrome OAuth 与额度刷新仍未验收。本版不处理 Issue #261 尚未确认的消息来源报告。发布到 `alpha` 不会同步提升 npm `latest`，也不会自动安装到现有 profile。

独立确认 npm 发布后，可使用上面的精确版本命令安装。
