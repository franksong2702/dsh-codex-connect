# Native compaction: durable lifecycle gate

Tracking: [PR #197](https://github.com/franksong2702/dsh-codex-connect/pull/197), [mechanism #196](https://github.com/franksong2702/dsh-codex-connect/issues/196), [context experiment #65](https://github.com/franksong2702/dsh-codex-connect/issues/65), [roadmap #195](https://github.com/franksong2702/dsh-codex-connect/issues/195).

Status: **unreleased prototype**, creation disabled by default. The published npm `0.1.0-alpha.4.35` does not contain this experiment even though the development branch has not bumped the package version.

## What this gate actually exercises

The fixture uses real, unmodified DSH AgentRegistry, AgentLoop, BasicCompactionEngine, SessionStore, token meter and JSONL persistence. Only provider responses and credentials are synthetic. It does not manually manufacture a checkpoint or substitute a mock session store for the lifecycle proof.

For each physical JSONL encoding (`none` and `zstd`, using each host's normal writer format), independent Node processes run these phases:

1. **Write:** run two real agent turns, invoke `ctx.compaction.compactNow`, require a useful replacement, check correlated compaction events and source references, and read the actual persisted artifact. Store a digest of the identified checkpoint and its visible surface for the next process.
2. **Resume and fork:** start with no live sessions and native checkpoint creation disabled. Resume the parent through `ctx.agents.resume`, check the restored checkpoint and surface, and complete a tool-call/result round trip. Verify the next provider payload includes the unchanged opaque item and encrypted reasoning replay, not a textual marker. Create a factory-owned fork through `ctx.agents.create` using a verified completed parent prefix, explicit inherited-event count and parent lineage. Persist the child and verify later parent work leaves the child's stored bytes unchanged.
3. **Resume child:** open the child in another fresh process, check exact inherited-prefix ownership, then run a new tool call with a different correlation id. The child's request uses its own session/cache identity; the parent's stored artifact remains unchanged.
4. **Failure paths:** run the real transaction with HTTP rejection, a truncated response, empty encrypted content, incomplete terminal status, an oversized checkpoint, an oversized stream, and explicit caller cancellation. Failed native attempts may commit only the ordinary summary. Cancellation preserves the original surface and emits no fallback request. Every scenario is disposed, resumed and continued.

5. **Automatic triggers:** run nine isolated scenarios through actual AgentLoop `agent/pre-step` and `agent/request-error` hooks: pressure, below threshold, auto disabled, overflow recovery, unrelated errors, bounded repeated overflow, failed recovery without progress, repeated pressure compaction, and an unshrinkable newest-message tail. The fixture verifies a new completed or failed turn, correlated compaction events, checkpoint replacement/replay, and preservation of the original surface when no replacement commits.

The installed checker launches ten separate processes per exact host (five phases per encoding). The four-host installation matrix therefore exercises 40 processes, including eight automatic-phase processes that each run all nine scenarios, in addition to its ordinary install, model, settings and Reserve checks. It imports the plugin from the installed profile and DSH modules from the exact isolated host, rather than substituting the source tree's DSH dependencies.

Source tests reuse the same assertions with recreated Cordis contexts. They are useful regressions, but **context recreation is not the process-restart proof**; the installed checker supplies that proof separately.

The supported host generations do not share one storage-service API: `0.1.2-rc.1` exposes `readRaw`, while `0.1.5-alpha.1` uses read/write handles instead. Physical verification deliberately reads the disposable fixture's JSONL files directly, matches the header's exact session identity, and compares stored-byte digests. Actual write, restore and fork operations still go through the respective host's real APIs. This is not a private adapter or storage shim added to the shipped plugin. In handle-based hosts a bare `ctx.sessions.fork` does not acquire a persistence writer; the fixture therefore creates the seeded child through the Agent factory, which owns persistence admission and teardown.

## Failure-driven corrections

The initial prototype validated the number and position of compaction items but not whether `encrypted_content` was usable. The empty-content lifecycle fixture exposed that a useless native checkpoint could be committed. Encoding and decoding now require nonempty encrypted content and a valid optional identity, and restrict retained items to the deliberately supported user-message projection.

Checkpoint encoding can fail even after a provider stream completes (for example, the local checkpoint size limit). Encoding must remain inside the pre-emission fallback boundary; otherwise an exception in a detached success callback can leave a consumer waiting without a terminal event. The bridge now contains those failures and also terminates synchronous fallback setup/iterator errors. Error response bodies and parser readers are released, and native stream bytes and terminal status are checked before accepting output.

Two additional boundary regressions cover the full retained JSON array (brackets, commas and multibyte UTF-8) and composition with pi-ai payload observers. The 64,000-byte ceiling includes all array syntax. If an external `onPayload` observer returns `undefined`, the wrapper preserves its transformed payload instead of causing pi-ai to reuse the original, unexpanded input. Sync, async, mutating-observer and explicit-replacement callbacks are exercised through the installed provider implementation.

## Automatic-trigger scope and retention boundary

Pressure scenarios use an isolated 8,192-token model-capacity override and DSH's actual token meter; overflow scenarios remain below their configured pressure threshold and rely on the adapter classifying a synthetic context-window error. No DSH method is overridden to fabricate triggering. Provider errors, usage and encrypted items remain synthetic. This demonstrates host control flow, not a real model hitting its context limit.

DSH's existing range selector retains the newest message even with `retainTokens: 0`. When that newest reply dominates the context, the selected older prefix may be too small to replace usefully. The `unshrinkable-tail` scenario checks that DSH rejects the non-shrinking summary, preserves history and completes the ordinary continuation. The bridge does not alter this host policy or promise that every high-pressure context can be reduced. Repeated compaction is covered synthetically, not by a live long-task benchmark.

## Reproduction

```sh
pnpm exec vitest run tests/native-compaction.spec.ts tests/native-compaction-lifecycle.spec.ts tests/native-compaction-automatic.spec.ts tests/native-compaction-probes.spec.ts
pnpm run check
pnpm run test:browser
pnpm run check:dsh-matrix
```

For an already isolated installation:

```sh
node scripts/check-installed-native-compaction.mjs /absolute/profile/package.json /absolute/host/package.json
```

The checker never calls the real model backend. Credentials are fixture-only, session directories are disposable, and the fetch stub rejects unrelated endpoints. Nothing here requires changing an active DSH service.

## Separate bounded live provider acceptance — 2026-09-12

Using the user's explicitly authorized existing M15 Codex login, the bridge/codec probe completed exactly three real requests: ordinary `gpt-5.6-luna`, native `compaction_trigger`, and continuation with the returned opaque item. Every returned server model was also `gpt-5.6-luna`; all responses were HTTP 200 with completed terminal status. The native response contained exactly one valid compaction item. The continuation correctly recalled a label generated in the baseline assistant reply, absent from retained user text and from the replay's non-compaction input. Native creation was disabled for replay.

There were zero retries, fallback attempts or fallback dispatches; no Reserve/Sol/Astra calls. The read-only credential file remained byte-identical, and no real opaque state was written to disk. Sanitized [request metrics and outcome](native-compaction-luna-smoke-m15-2026-09-12.json) record the exact source digest, three dispatches and 552 backend-reported total tokens. All reported cached-token counts were zero.

This is **one short same-account/same-model provider acceptance test**, separate from the synthetic durable lifecycle above. It does not combine a real backend with AgentLoop/JSONL/restart/fork, establish encrypted-token pricing, or demonstrate savings, cache benefit or long-task quality. Those three dispatches are historical evidence, not a reusable execution budget.

## Separate real-provider persistence probe — not yet accepted

`scripts/native-compaction-durable-smoke.mjs` has an offline rehearsal that uses the real adapter, AgentLoop, manual compaction transaction, JSONL persistence and two separate Node processes. It removes the original test label from visible replay input, restores an identical checkpoint with creation disabled, and tests native-rejection termination without a fallback dispatch. Its explicit live mode is Luna-only and bounded to three dispatches; the ordinary test suite exercises synthetic mode and argument rejection only.

The user authorized expanded acceptance, but the subsequent live invocation was reported blocked and no verifiable live result for this durable probe has been recovered. The exact blocker remains undetermined. Delivery continues without retrying that operation or changing execution channels. Do not count offline success or the earlier bridge-only live smoke as real-provider JSONL/restart acceptance. Ports 3080/3081 and production-like DSH remain outside scope.

## Interpretation and remaining work

- The verified fork path is the public **Agent factory** seeded-creation boundary (`ctx.agents.create`), not the Web UI's completed-turn selector/controller. The fixture verifies a completed source prefix rather than reimplementing the UI's anchor-selection policy. Web end-to-end fork behavior is a separate acceptance item.
- Manual `compactNow`, automatic pressure/overflow triggering (`compactIfNeeded`) and repeated pressure compaction now have synthetic control-flow coverage. Real-provider automatic triggering and repeated compaction, sudden process termination during writes, deliberate disk failures, images and cross-provider/account changes remain separate cases.
- Model and effort are checked on resumed requests, and tool schemas on the native request. This does not establish compatibility with the adaptive `configuration_update` policy in PR #167.
- Reported checkpoint/shadowed token counts are DSH heuristics over synthetic text. Provider usage is fabricated by the offline fixture. Neither proves real token savings, correct pricing of encrypted compaction content, cache benefits or long-task quality.
- The conservative retained projection is capped at **64,000 serialized UTF-8 bytes**, not 64 KiB and not a claim of exact Codex token-policy equivalence.
- A synthetic encrypted string proves transport/storage preservation, not real provider interpretation. The separate bounded Luna test above now supplies minimal live acceptance evidence; full live lifecycle and long-task comparison remain under #65.
- Passing this gate permits a focused review of the mechanism; it does not authorize merging, releasing, promoting `latest`, or enabling the feature for users.

## 中文说明

这一关验证的是“存档后能继续”，而不是“压缩请求返回成功”：使用 DSH 的真实压缩事务和文件存储，随后在独立进程里恢复父会话、创建分支、恢复子会话，并继续调用工具。测试还检查取消和异常不会把无效原生 checkpoint 写入历史。

持久化 lifecycle 与自动触发测试的模型响应、账户仍均为合成数据。自动压力、溢出恢复、重复压缩和无收益时保留历史已纳入离线验收；安装矩阵要求每宿主 10 个独立进程。另一次经用户授权的 M15 普通 Luna 三请求测试，已验证真实服务端接受原生压缩并能在后续请求中使用 opaque state。真实 provider 与 JSONL／进程重启结合的验收仍未完成，不能用上述两组独立证据代替；网页分支、故障注入与长任务效果也尚未验收。现有发布版与正在运行的环境不受影响。
