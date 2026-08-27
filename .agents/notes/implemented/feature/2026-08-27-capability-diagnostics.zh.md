# Agent Note: 独立且按证据范围判定的能力诊断

Status: implemented

## Problem

[Issue #66](https://github.com/franksong2702/dsh-codex-connect/issues/66) 要求可执行地区分兼容性、凭据存在、路由访问与可选能力。现有 doctor 与更新卡提供有用的元数据，但不能证明模型执行成功。[Issue #64](https://github.com/franksong2702/dsh-codex-connect/issues/64) 记录了不兼容的 DSH 版本线；[Issue #65](https://github.com/franksong2702/dsh-codex-connect/issues/65) 说明 schema 识别不能证明 compaction 可用。

## Decision

独立 CLI 调用诊断操作，将已安装版本和认证文件元数据检查与显式请求的有界 Responses 探测组合起来。不添加 Cordis hooks、浏览器端点、后台任务或会话事件。诊断请求独立于 Harness 对话，永远不进入模型历史。现有 doctor 输出、provider 路由、有限 SSE 默认设置与持久化历史保持不变。

诊断检查现有兼容声明中的主机 DSH 包列表以及 pi-ai 和 Node。本地版本结果仅描述声明的要求，不认证每个 Node 补丁版本、浏览器包或运行中的 profile。公开已验证版本目录仍由现有更新卡负责，不随探测更改。

网络提供方是独立的固定第一方路由探测，不是替代 PiAiAdapter。它要求未过期、仅所有者可访问的凭据，不跟随重定向、不刷新、不重试，并独立持有 Undici dispatcher。成功结果要求有限 EOF 和所选精确模型的完整非空输出。错误正文直接丢弃。白名单观测仅包含结果类别和 HTTP 状态。调用方产生固定修复信息，provider 文本和凭据不会通过基于字符串的错误分类泄漏。

每个诊断实例只保留一条完整或拒绝观测，以凭据、所选模型、版本、超时与代理策略的私有摘要作键。缓存惰性过期，上限为 60 秒，不创建定时器。退出登录或本地前置条件不可用时清除缓存。进程重启后所有证据丢失。CLI 调用之间不共享缓存，也不自动解析 profile 设置。

## Alternatives considered

**观测每次对话请求。** 这要求观测始终绑定实际账号、模型、transport、设置修订和请求生命周期。DSH 公共 adapter 不会同时暴露这些诊断观测。在现有推理路径中加入包装会扩大回归风险，并需要 assembled session、Fork/restart 和 SDK projection 覆盖。本 CLI 不对该路径作验证声明。

**通过 pi-ai 通用流操作探测。** 公共选项提供 HTTP 状态回调，但其 transport 负责全局 fetch 行为、重试和响应读取。独立探测将拒绝重定向、输出限制与连接销毁统一交给一个所有者。代价是不证明 PiAiAdapter 执行，用户报告会明确标注这一较窄范围。

**从元数据推断 OAuth 或模型权限，或从被识别字段推断 compaction。** 这些只能证明解析或目录事实。普通 Responses 输出成功不能证明 context management、续接、原生 compaction 或恢复能力。

**把诊断证据持久化到 DSH 历史。** 本地 CLI 报告不属于模型历史。私建 replacement-history 存储会重复 DSH 持久化并违反 Issue #65 的所有权约束。

## Consequences

该命令是 Issue #66 初步且可独立审查的实现，不代表设置页与活动请求 UX 目标已经关闭。运行时元数据与成功的独立调用具有不同证据范围。HTTP 错误描述被观测的请求，而不是账号或整个 provider 的永久支持状态。凭据不会被静默续期，因此过期 access token 会令 OAuth 保持未知，直到使用正常认证流程。

不模拟 provider 故障切换或 WebSocket 回退。有限 SSE 已被选定，本插件没有自动跨 provider 回退。原生 compaction 在集成策略下仍被拒绝；未探测的可选网络行为保持未知。诊断结果永远不会启用能力。

源码 CLI snapshot 使用真实命令与已安装包，配合临时且未读取内容的认证文件。探测 fixture 覆盖状态、仅 schema、不完整流、大小与超时结果。构建 CLI 检查通过有界子进程验证离线行为与显式指定的 loopback 代理拒绝，不使用真实 OAuth 或调用模型。现有 adapter、compaction、历史和生命周期回归仍适用。真实账号成功与 Linux CI 执行必须和本地 keyless 结果分开报告。
