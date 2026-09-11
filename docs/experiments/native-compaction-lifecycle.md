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

The installed checker launches eight separate processes per exact host. The four-host installation matrix therefore exercises 32 processes, in addition to its ordinary install, model, settings and Reserve checks. It imports the plugin from the installed profile and DSH modules from the exact isolated host, rather than substituting the source tree's DSH dependencies.

Source tests reuse the same assertions with recreated Cordis contexts. They are useful regressions, but **context recreation is not the process-restart proof**; the installed checker supplies that proof separately.

The supported host generations do not share one storage-service API: `0.1.2-rc.1` exposes `readRaw`, while `0.1.5-alpha.1` uses read/write handles instead. Physical verification deliberately reads the disposable fixture's JSONL files directly, matches the header's exact session identity, and compares stored-byte digests. Actual write, restore and fork operations still go through the respective host's real APIs. This is not a private adapter or storage shim added to the shipped plugin. In handle-based hosts a bare `ctx.sessions.fork` does not acquire a persistence writer; the fixture therefore creates the seeded child through the Agent factory, which owns persistence admission and teardown.

## Failure-driven corrections

The initial prototype validated the number and position of compaction items but not whether `encrypted_content` was usable. The empty-content lifecycle fixture exposed that a useless native checkpoint could be committed. Encoding and decoding now require nonempty encrypted content and a valid optional identity, and restrict retained items to the deliberately supported user-message projection.

Checkpoint encoding can fail even after a provider stream completes (for example, the local checkpoint size limit). Encoding must remain inside the pre-emission fallback boundary; otherwise an exception in a detached success callback can leave a consumer waiting without a terminal event. The bridge now contains those failures and also terminates synchronous fallback setup/iterator errors. Error response bodies and parser readers are released, and native stream bytes and terminal status are checked before accepting output.

## Reproduction

```sh
pnpm exec vitest run tests/native-compaction.spec.ts tests/native-compaction-lifecycle.spec.ts
pnpm run check
pnpm run test:browser
pnpm run check:dsh-matrix
```

For an already isolated installation:

```sh
node scripts/check-installed-native-compaction.mjs /absolute/profile/package.json /absolute/host/package.json
```

The checker never calls the real model backend. Credentials are fixture-only, session directories are disposable, and the fetch stub rejects unrelated endpoints. Nothing here requires changing an active DSH service.

## Interpretation and remaining work

- The verified fork path is the public **Agent factory** seeded-creation boundary (`ctx.agents.create`), not the Web UI's completed-turn selector/controller. The fixture verifies a completed source prefix rather than reimplementing the UI's anchor-selection policy. Web end-to-end fork behavior is a separate acceptance item.
- These scenarios exercise **manual `compactNow`** and its durable transaction. Automatic pressure/overflow triggering (`compactIfNeeded`), sudden process termination during writes, deliberate disk failures, images, cross-provider/account changes and repeated compaction remain separate cases.
- Model and effort are checked on resumed requests, and tool schemas on the native request. This does not establish compatibility with the adaptive `configuration_update` policy in PR #167.
- Reported checkpoint/shadowed token counts are DSH heuristics over synthetic text. Provider usage is fabricated by the offline fixture. Neither proves real token savings, correct pricing of encrypted compaction content, cache benefits or long-task quality.
- The conservative retained projection is capped at **64,000 serialized UTF-8 bytes**, not 64 KiB and not a claim of exact Codex token-policy equivalence.
- A synthetic encrypted string proves transport/storage preservation, not that the real provider accepts or correctly interprets it. Bounded live acceptance and long-task comparison remain under #65.
- Passing this gate permits a focused review of the mechanism; it does not authorize merging, releasing, promoting `latest`, or enabling the feature for users.

## 中文说明

这一关验证的是“存档后能继续”，而不是“压缩请求返回成功”：使用 DSH 的真实压缩事务和文件存储，随后在独立进程里恢复父会话、创建分支、恢复子会话，并继续调用工具。测试还检查取消和异常不会把无效原生 checkpoint 写入历史。

所有模型响应与账户均为合成数据。此结果不代表真实服务端验收、自动压缩策略、网页分支按钮或长任务效果已经验证；这些限制必须与测试结果一起保留。现有发布版与正在运行的环境不受影响。
