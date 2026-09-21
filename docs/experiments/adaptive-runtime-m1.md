# Adaptive Runtime M1: Think on the released runtime

Status: unreleased integration candidate, based on Think #224 (`c279420`) and released main `1748bec` (Alpha 4.39). The original #220/#221/#222/#224 and #199/#200 branch histories are preserved. This is not an independent source-review approval or a merged release.

## Product purpose

The Adaptive Runtime should deliver useful task outcomes with justified reasoning, context and delegation costs. M1 makes the first two mechanisms composable; it does not establish autonomous recommendation quality, latency gains, subscription savings, or a complete optimizer. The synthetic fixtures deliberately choose effort changes to test mechanics, not to simulate evidence of model judgment.

## Authority and persistence

DSH's append-only session journal remains the only durable authority store. Native compaction replaces the model-visible surface, not the original source-authenticated reasoning notices in that journal. No parallel current-effort file, model-authored summary claim, hidden global override, new host event vocabulary, or patched host storage is introduced.

`reasoning-update-checkpoint.ts` validates the canonical archived transition chain and the actual host surface fold. Each supported compaction replacement must be a prefix compaction after the optional host system head with a correlated start, adjacent summary/replacement/end, exact source-event references and shadowed range, successful close, original Astra provider/model, and checkpoint content matching the host's safe summary projection. Missing or inconsistent evidence fails before dispatch. Newer DSH hosts retain an empty or nonempty `system/message` at surface position zero and may refresh only that exact head on resume. The validator preserves all physical surface nodes (including those deriving no message), permits only this canonical head-only system rewrite, and never lets it absorb an approval or checkpoint. Raw replacement fields also differ across declared hosts (`start/end` versus `startSeq/endSeq`); the plugin consumes the host-validated `foldSurface` replacement projection instead of guessing the persisted schema. Source metadata is trusted only in this host journal; copying notice text does not grant authority. Arbitrary rewrites, pruning, missing journal windows and inherited cross-session Think histories are not silently accepted.

For a valid checkpoint, the request-local plan projects the admitted effort after its verified summary/native item span. Later visible approvals retain their original input positions. The original top-level wire effort stays fixed. Native retained user content and the opaque checkpoint are matched exactly before inserting the checkpoint's derived `configuration_update`; the opaque item is not decrypted or treated as an approval. Ordinary summary fallback uses the same journal proof and the host's exact all-text projection.

The compaction request itself needs a live host transaction and an exact prefix of the current surface plus DSH's summarization instruction. A caller-supplied `purpose` or marker alone is insufficient. The generic replay wrapper now encloses the native bridge so both the native attempt and its ordinary-summary fallback use the same guarded plan. DSH still owns range selection, pressure triggers, shrink checks, durable commit and recovery.

## User and transport behavior

The saved Think opt-in remains off. Opening it permits proposals, not arbitrary adjustments; each tool-originated change still needs the exact native human answer. Pending approvals are bound to the surface generation and cannot be admitted after intervening compaction. Disabling proposals does not erase recorded adjustments. Manual selection remains authoritative after compaction. The feature does not change profile defaults, enable Remember/Reserve/Split, rotate accounts, or impersonate first-party clients.

The released backend governor still owns per-attempt request IDs, redirect restrictions, proxy lifetime, queue cancellation and deadlines. Native compaction and ordinary fallback remain distinct requests with distinct correlation IDs. Cancellation does not launch fallback or turn an unadmitted proposal into effective state.

## Reproducible candidate gates

```sh
pnpm install --frozen-lockfile --offline --ignore-scripts
pnpm run check
pnpm run test:browser
node scripts/check-installed-think-remember.mjs
node scripts/check-think-matrix.mjs
pnpm run check:dsh-matrix
```

`think-remember-integrity.spec.ts` covers corrupted correlation/source/summary/notice data, request conversion changes, missing/duplicated opaque items, cross-session inheritance and fabricated compaction intent. `think-remember-lifecycle-fixture.mjs` uses the actual native question service, AgentLoop, Codex adapter, compaction engine and physical JSONL backend with synthetic credentials/provider responses only.

The installed composition gate runs writer, fresh-process restore/downgrade, another fresh restore, and cancellation/pending/manual/refusal cases for native and ordinary-fallback paths in both plain and Zstandard storage. Each exact host runs 16 distinct processes. The declared installation matrix requires that new proof in addition to the existing Remember lifecycle; all four hosts consume identical package bytes. The separate Think admission matrix retains its complete native-consent and settings cases. Exact-head outcomes and artifact identity belong in `.github/ADAPTIVE_RUNTIME_M1_VALIDATION.md` and the PR checks, not historical #224 counts.

## Explicit remaining gates

Full authenticated Session-page interaction and human experience remain separate from component/synthetic transport tests. This candidate does not establish live Astra acceptance of checkpoint-adjacent configuration updates, cross-account replay, cryptographic protection against a wholly rewritten trusted journal, arbitrary model switches/pruning/forks/children, or durable recovery of all interrupted admission faults. Existing host validation is not weakened to make these pass. The original journal is required; a detached checkpoint is not portable Think authority.

M2 should add only a thin internal Observe → Recommend → Admit → Apply interface, initially reasoning, with a legitimate no-change decision and bounded outcome/usage measurements. M3 should connect one bounded read-only Split worker through the same decision contract without bypassing the worker's independent host-owned source manifest, approval, deadline/budget or cleanup. Neither milestone is completed by this PR. Economic evaluation must compare task correctness, completion time, provider-reported usage/cache behavior and interruptions against fixed-effort/single-agent baselines; synthetic usage is not savings evidence.
