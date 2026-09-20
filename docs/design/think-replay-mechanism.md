# Think T1: admitted-history replay mechanism

Tracking: #195. Extracted from the unmerged prototype #167 at `7315795e9d883b070d15fe26ca2c61ecb9555789`, on main `e5772cd8a5c47f30b5ab14fe73d2901914348463`. Date: 2026-09-20.

## Delivery boundary

This is an internal mechanism, not an enabled or user-facing feature. The production adapter, plugin/client entries, settings, exports, build entries, dependencies, lockfile and version are unchanged. No proposal tool, human-question UI, automatic effort policy, legacy-history repair or Split code is registered. #167 remains open and is not merged or superseded in full by T1. The separately deployed Split preview is not modified.

The narrow question is: given an already-admitted, host-owned sequence of confirmed changes, can one request replay those changes at their original positions without leaking its state to another request? It is deliberately separate from deciding when a model should propose a change.

## Mechanism

1. `src/reasoning-update.ts` builds and validates canonical plugin snapshot notices, then constructs an immutable original/effective effort plan. Text that merely resembles a notice is not authorization. Wire updates remain immediately before their matching notices; the original wire base is retained while the effective request selection is validated.
2. `src/reasoning-update-history.ts` compares the request with the exact host-owned Session: recorded notice identity, source, content, order and the complete unchanged derived surface. A plausible notice with the same id but different data is not enough. Removed notices, moved notices and edited/dropped background fail before the delegate is created.
3. `src/reasoning-update-provider.ts` isolates each request through provider construction, iterator advancement and early iterator cleanup. It retains a previous payload hook, validates that hook's replacement and permits only the matching Codex/Astra route. The known leading-system-message promotion is handled without guessing other position shifts.

The stream boundary accepts an already-admitted Session. It does not accept pending model output as a Session, does not resolve questions, does not append notices and does not save defaults. Ordinary requests with no Think state pass through without changing their compaction behavior.

## Authority and compatibility limits

The Session is a trusted host input, not an authentication token or cryptographic proof. A later host integration must obtain it from the live owner, validate root-Agent identity and prove the actual user decision. Reconstructing a Session from attacker/model-supplied JSON would violate this contract. These internal helpers must not be exposed as model-callable tools.

Only canonical version-1 snapshot sections are supported. Legacy ad-hoc `reasoningUpdate` / `reasoningSelectionSeq` metadata is explicitly rejected rather than silently accepted or repaired. This stage does not migrate old private conversations.

T1 requires the full uncompressed surface, matching session/provider/model and compatible explicit effort. Auxiliary requests, surface replacement, previous-response references, preconverted updates and native compaction/collaboration wire items are rejected when Think state is active. This is not Think/Remember/Split composition. It does not disable host persistence or compaction globally.

The wire shape is retained from the #167 experiment; no new live endpoint acceptance, latency, quality or quota benefit is established here. JSON serialization/restoration tests use the real DSH Session implementation in one process. They are not disk persistence, process-restart or four-host Think acceptance.

## Regressions

- An eager delegate constructed its provider stream before the previous AsyncLocalStorage boundary began. The new regression failed against the exact extracted #167 implementation (1 failure / 12 passes), then passed after moving construction into the request context.
- Three added fault cases initially demonstrated that notice-only validation accepted moved notices and edited/dropped background. Full-surface comparison rejects all three.
- Synthetic tests cover canonical metadata, malformed/legacy fields, upgrades/downgrades, same-id tampering, missing/different sessions, unsupported wire modes, original-position conversion, leading-system promotion, concurrent requests, existing payload hooks, wrong-route rejection and cleanup. No real credentials or model requests are used.

Reproduce from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/think-replay-mechanism.spec.ts tests/think-request-scope.spec.ts tests/reasoning-update-provider.spec.ts
pnpm run check
```

Current-head local and remote outcomes are recorded in the delivery checkpoint/PR. Existing installation and browser CI are product non-regression gates, not proof that Think is enabled on those hosts.

## Subsequent slices

**T2 — Host-owned admission and explicit activation.** Integrate native human decisions, pre-step batches, cancellation/disable/disposal and latest manual selection priority. Synchronize the visible selector only when the corresponding request/header is recorded. Retain default-off activation, no cross-session/default mutation and clear meaning of the user's authorization. Validate the real adapter/loop before any preview deployment.

**T3 — Composition.** Define a durable checkpoint for effective reasoning state through Remember without losing authority or resetting effort. Define root/child routing separately; do not infer Split authorization from a Think setting. Preserve unsupported-path rejection until the combined lifecycle is proved.

**T4 — Usefulness.** Compare fixed effort, explicit manual changes and authorized agent-proposed changes on repeatable tasks. Human experience, real-provider traffic and quota use require their own acceptance scope; unit tests are not outcome measurements.
