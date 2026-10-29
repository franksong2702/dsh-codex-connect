# Stock DSH alpha.2 fixture investigation — 2026-10-29

This maintenance change prepares the installed-runtime checks for stock DSH
`0.2.2-alpha.2`. It does **not** declare that version supported. The formal peer
ranges, compatibility policy, verified-version record, existing Host matrices
and product code remain unchanged. Issue [#403](https://github.com/franksong2702/dsh-codex-connect/issues/403)
remains unresolved. No daily service, Computer Use implementation or permissions
were changed.

## Reused test facilities

The image fixture and official Native executor selection were extracted from
`6fc368b31a4d81040f09cfcb53c861e2273fa3ec` on experimental PR #402, without its
patched Host, Computer Use code or supported-version declarations.

- Old tools retain their internal executor and single-call API.
- Separated executors use the installed Host's official Native/PTC plugins and
  batch execution. The PTC manifest must match the exact tools version and
  declare exactly one known runtime. Missing, mixed or ambiguous identities fail.
- Current Native execution runs image calls through a scripted **real AgentLoop**,
  so original-image ownership comes from real logged tool events. The fixture
  does not manufacture event positions or substitute DOM/browser execution.
- Generation, editing, PTC dispatch, exact original bytes, authentication, fork
  boundaries, unrelated-session denial and non-Codex image handles stay required.
  The provider, image bytes, preview store and code-runtime execution are synthetic.
- Reserve and existing compaction fixtures select the official executor when the
  Host requires one. Reserve now reports contained AgentLoop errors directly,
  rather than failing later on an absent request header. Its routing is unchanged.

## Component evidence and limits

Baseline: main `f9d738eb1e042cfce96e8a2b43e52159bee30192`; macOS arm64,
Node `v24.13.0`, pnpm `10.30.3`.

The reused stock installation was verified against fresh exact public npm
metadata: all **321** DSH tarballs matched their official SHA-512 integrity, and
all **8,277** regular installed files matched those tarballs byte for byte.
There are no local Host patches in that component test.

The component-only candidate `0.2.0-alpha.11-stock403.0` was made in a temporary
directory, marked private/unverified, and exact-admitted alpha.2 in its own peer
metadata. The official `dsh plugin --profile web add` installed it successfully
into a fresh temporary DSH home, with normal peer checks. This is **not** a
passing install of the unchanged published plugin, a full runtime check, Linux
acceptance or a supported-version declaration. No real credentials or provider
requests were used.

The [component evidence](fixtures/dsh-alpha2-stock-components.json) records source
file hashes, candidate bytes, selected official tarball identities and both
passing and failing outcomes. The candidate's metadata label differs from its
unchanged compiled plugin version; both are recorded explicitly.

| Check | Result |
| --- | --- |
| Legacy `0.1.7-rc.1` image component | Pass: generation 2, edit 2, PTC calls 2; all existing authorization, inheritance and handle assertions passed |
| Legacy `0.1.7-rc.1` Reserve component | Pass: existing transitions and lifecycle assertions |
| Stock alpha.2 image component | **Fail**: inherited-original download returned 404, expected 200 |
| Stock alpha.2 Reserve component | **Fail**: `agent/request` attempted `gpt-reserve` after preparation fixed `gpt-6-astra` |

Before the image failure, real Host Native generation, PTC generation and dispatch,
unauthenticated denial and owner download passed. Later edit/handle assertions
were **not reached** on stock. They were not skipped or marked successful.

The image failure matches the separately implemented #402 change to
`src/image-history.ts`: new Host forks retain `isSeeded` and their authenticated
inherited prefix without retaining `parentSession`. That narrow product repair
can be considered separately, preserving a positive safe-integer prefix bound
and rejection of unseeded or live-tail data. It is not part of this fixture-only
change.

Local repository check results and exact changed-head CI are recorded in the PR.
The first sandbox check had 27 failures from loopback `listen EPERM` (2,357 pass,
2 skipped). A separately approved execution completed the full check with 2,384
pass and 2 skipped; the original failure remains evidence. No Linux execution
or full stock acceptance is claimed from these macOS checks.

## Reserve contract gap and minimum proposal

Published `@deepseek-ai/dsh-agent-loop@0.2.2-alpha.2` captures the model selection
in `preStep()` **before** tool resolution and prompt assembly. Its async
`agent/pre-step` hook receives that captured selection after assembly.
`prepareRequest()` then rejects changes to provider, model or effort in the
deprecated `agent/request` hook. `agent.model.select()` only changes a future
step; it cannot replace the already prepared selection. On quota failure,
`agent/request-error` retry loops inside the same admitted step and retains that
selection/tool set. Moving the current rewrite to either hook would therefore
not preserve Reserve's existing behavior.

The local #402 Host adds an early asynchronous routing/repreparation contract.
That is evidence for a possible design, **not an API offered by stock alpha.2**.
No Reserve product implementation is changed here. The minimum Host contract to
discuss before implementation is:

1. An awaited, cancellable selection boundary before tools, prompt, adapter and
   header preparation, carrying the actual Agent/turn/step identity. It must not
   admit messages or mutate ordinary user selections on a failed quota read.
2. A supported quota-recovery action that disposes the previous prepared surface,
   selects again and rebuilds tool/prompt/adapter state for the same admitted
   input, with bounded retries and durable failed-attempt accounting.
3. Preserve output controls, account-bound eligibility, return-target persistence,
   cancellation/unload draining, partial-tool/context recovery and accurate logged
   provider/model/effort. Older Hosts retain the current supported route path.

The risks are stale account authority after async I/O, duplicate admitted input,
lost tool results, mismatched model-specific tools/prompts, inaccurate headers and
retry loops. An adapter-level hidden model swap or silently disabling Reserve
would avoid neither the mismatch nor the compatibility obligation.

Before adding stock support, require the missing Host contract (or an explicitly
reviewed equivalent), the separate image-history repair, focused negative tests,
full unchanged installed-runtime assertions and the existing exact Host/Node
matrices. Keep runtime failures distinct from installation success and user
acceptance. No patched local Host result can substitute for that evidence.
