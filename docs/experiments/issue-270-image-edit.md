# Issue #270 — conversation image editing candidate

Status: local implementation candidate with bounded real image-backend evidence and [final GPT-6 Sol selection confirmation](../agent-notes/issue-270-sol-live-confirmation.md), not a published release or full installed-UI acceptance. Builds based on public Alpha 4.47 do not acquire this feature merely because that version appears in `package.json`. The original transport checkpoint is preserved in `../agent-notes/issue-270-transport-checkpoint.md`.

## Product contract

The existing `codex_connect_image_generate` tool accepts legacy `{prompt}` generation unchanged. Editing requires `operation: "edit"`, one `target` and optional ordered `references`, each with an image selector and a nonempty purpose. Image selection uses one of `assetId`, `attachmentId`, or a complete host image attachment reference. These namespaces are not provider `file_id`s and are never forwarded as such.

The first image is the edit target; later inputs are references. Their purposes are expressed in the bounded edit prompt, not claimed as dedicated server-side role fields. The tool does not infer semantic intent from keywords and does not scan global recent images. The conversation model must select the requested target or ask about ambiguity. Provider quality and reliable natural-language selection require separate live acceptance.
For image-capable Codex requests, while the existing image-generation/editing opt-in is enabled, the adapter projects a short text handle immediately after every request image: its ordinal within that message, sanitized display name when present, and stable DSH attachmentId. This projection is request-only and does not rewrite the session log. It lets wording such as “the first attached image” map to a stable selector without persisting a turn-relative ordinal; failed-edit retries therefore retain the stable ID. The tool still revalidates the ID against the session, so the handle is guidance rather than authority.

A successful edit creates new exact original bytes and a separate host-normalized preview. New v2 result metadata records the operation, original target/reference selections actually used and output assets. Source relationships survive native result metadata and nested tool-content recovery. Legacy v1 and preview-only histories remain readable. There is no version-tree application or overwrite operation.

## Inputs, permissions and limits

Only the executing session's trusted image events are eligible. Complete caller metadata is checked against the host record; arbitrary user prose containing IDs or result-shaped JSON grants no permission. Generated previews normally resolve to the corresponding original. Multiple originals sharing a preview require an exact original selection rather than a newest-image guess. A legacy preview is usable only through an explicit preview choice. A missing original is never silently replaced by a preview.

Repeated uploads can share normalized bytes while keeping different valid occurrence metadata. Complete references match the selected recorded occurrence, not whichever upload happened last. Downloads and edits share successful-result and fork-prefix validation; failed-result metadata is not inheritance evidence. Edit drafts follow original asset identities rather than shared preview IDs.

Original storage still enforces owner/fork-prefix access and byte integrity. Fork descendants cannot read parent assets created after their inherited cut. Input validation snapshots references, checks all metadata/aggregate bounds, reads verified data, verifies actual dimensions/format/length and uses the installed attachment service's full raster validation before provider dispatch. Uploads use the normalized bytes actually stored by DSH, not an asserted copy of the user's device original.

The transport's defensive limits are at most 5 input images, 10 MiB each, 20 MiB total, 32 MiB encoded JSON, 50 million pixels and 32,768 pixels per side; the effective limits additionally take the stricter installed host policy. Missing host policy is refused. These are plugin safety ceilings, not measured backend entitlements. The accepted input vocabulary is PNG, JPEG and WebP, subject to host validation. No GIF/video editing, arbitrary path/URL acquisition, implicit resize or conversion is added.

## Request and interaction behavior

The existing OAuth transport sends ordered inline image data to the separate fixed Codex `images/edits` path, retaining plugin identity, captured account, request governance, proxy, cancellation and redacted errors. Unresolvable input is rejected before credentials or network dispatch; an edit failure never falls through to `images/generations` and uncertain requests are not automatically resubmitted.

The existing image-result button opens an inline form. A multi-image result requires selection of one image; nothing is sent until the user supplies changes and submits. Legacy previews additionally require a clear quality acknowledgement. The form uses the host's existing conversation prompt API with explicit source handles, not a forged attachment admission request or a new unauthenticated endpoint. The conversation model then invokes the validated edit tool. Reference-heavy requests can be made in the normal conversation; the compact result form intentionally selects a single base image rather than adding a separate reference-image gallery.

Retrying a failed edit and repeating a successful edit preserve the original input selections, reference order and instruction. Repeating is distinct from editing the resulting new image. A pending guard prevents repeated local submissions; this is not a promise of cross-process/server exactly-once execution. A lost submission response preserves the draft without automatic replay. Results with uncertain provider completion warn that another submission may use quota.

Saved `enableImageGeneration` governs both operations and remains off by default. Production result components observe the existing settings form, disable new requests when off and retain downloads. Enabling the feature is not permission to upload all historical images; only the selected inputs are sent. Other optional capabilities and Task orchestration are unchanged.

## Verification boundaries

Development uses Node 22.22.3, pnpm 10.30.3 and exact installed DSH packages 0.1.7-rc.1 / pi-ai 0.85.1. Automated tests use synthetic credentials, source images and provider replies. A separately authorized bounded live acceptance used non-sensitive generated fixtures and the already-selected Codex account; details and budget accounting are in the review checkpoint.

- Contract tests cover exact selectors, complete metadata, operation conflicts and malformed references.
- Tool tests use the real attachment store and real session vocabulary. They cover distinct ordered images, source promotion, legacy previews, missing/foreign inputs, bounds, cancellation, storage failure, repeated edits, old-version selection and inherited access.
- Session tests use the complete plugin, real AgentLoop and physical JSONL (uncompressed and zstd). They dispose the first host service graph, cold-load the session into a second graph and execute a subsequent edit. They assert no replay on resume, retained provenance and original byte integrity. This is service-graph replacement in one test process, not process-crash or physical-browser acceptance.
- Chromium tests inspect actual prompt submissions from EN/ZH forms at phone width, multi-image selection, exact retries, draft preservation, duplicate submission protection and feature disablement. Browser transport is mocked; these are not claims about a real account, full daily Session page or physical mobile device.

Commands:

```sh
pnpm run check
pnpm run test:browser
pnpm exec vitest run tests/image-edit-session.spec.ts tests/image-edit-tool.spec.ts tests/image-input-contract.spec.ts
```

Final execution results and reviewed commit identity belong in the dated checkpoints, not in unexecuted assertions here. The [review checkpoint](../agent-notes/issue-270-review-checkpoint.md) records reproduced fixes, real image-backend acceptance, the natural ordinal-selection failure found during live testing, and the subsequent adapter-level handle projection. The first authorized model budget ended before the final projection could be live-rechecked. A subsequently authorized run with `gpt-6-sol` passed the exact “first image / second reference” selection and resolved-byte checks using one real model request and zero real image requests; see the [final confirmation](../agent-notes/issue-270-sol-live-confirmation.md). This is not a post-fix GPT-5.6 Sol or all-model reliability claim. Physical Windows, process-crash recovery, all-host compatibility and provider pixel-perfect preservation are not certified. No release or live-service change is authorized by this document.

## 中文使用与验收说明

这是未发布的本地候选实现。原来的纯文字生图保持不变；修改图片时明确指定主图，参考图按顺序提供并说明用途。图片可以来自当前对话的上传附件、已有生成/编辑结果或完整 DSH 图片引用。附件编号不是访问许可，工具会重新核对当前会话的可信记录和实际图片。

每次编辑产生新结果，不覆盖原图；可以接着修改，也可以返回旧结果另改。生成结果优先使用保存的原图，原图缺失时明确失败，不偷偷使用预览。旧记录只有预览时，需要明确选择低清预览。多张原图共享同一预览时，必须选择具体原图，不能自动挑最新的一张。

“基于此图修改”先打开选图和修改说明，不会一点击就消耗图片请求。编辑失败后的重试保留原主图、参考图和指令；“重做本次修改”不会误把上次输出当输入再改一次。超时和断线不自动重发，也不声称一定没有消耗额度。

仍使用同一个图片开关，不自动开启其他功能。开启后，发给 Codex 的模型请求会在每张对话图片旁附加该图片的稳定附件句柄，帮助模型准确对应“第一张/第二张”等表达；这些句柄不授予额外访问权。真正进入图片编辑服务的仍只有本次选定的主图和参考图。关闭开关后停止新请求，历史结果仍可查看、下载。

本地自动测试覆盖真实宿主工具调用、磁盘 JSONL 保存与服务重新创建后的读取，以及 Chromium 中英文操作流程。另一次明确授权的有限真实验收已经用 3 次真实图片编辑验证了单图修改、连续修改和多图参考效果。真实模型测试同时发现：原先仅靠“第一张/第二张”无法可靠对应 opaque 附件 ID；当前候选已改为在 Codex 请求中紧邻每张图片投影稳定 attachmentId 句柄，并通过离线真实 AgentLoop wire 测试。前一轮 8 次真实模型预算用完后，已在另一次明确授权中改用用户指定的 `gpt-6-sol` 完成最终确认：1 次真实模型请求、0 次真实图片请求，主图、参考图以及解析出的图片数据和顺序均正确。该结论仅覆盖本次 GPT-6 Sol 场景，不代表所有模型或全部使用场景都已验收。
