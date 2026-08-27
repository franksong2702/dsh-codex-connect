# Agent Note: Standalone evidence-scoped capability diagnostics

Status: implemented

## Problem

[Issue #66](https://github.com/franksong2702/dsh-codex-connect/issues/66) requires actionable distinctions between compatibility, credential presence, route access, and optional capabilities. The existing doctor and update card provide useful metadata but cannot establish successful model execution. [Issue #64](https://github.com/franksong2702/dsh-codex-connect/issues/64) records an incompatible DSH release line; [Issue #65](https://github.com/franksong2702/dsh-codex-connect/issues/65) demonstrates why schema recognition cannot establish compaction support.

## Decision

The independent CLI consumer calls a diagnostic operation that composes installed-version and credential-metadata checks with an explicitly requested bounded Responses probe. No Cordis hooks, browser endpoints, background tasks, or session events are added. The diagnostic request is outside the Harness conversation and is never included in model history. Existing doctor output, provider routing, finite SSE defaults, and persistent history remain unchanged.

The diagnostic checks the host DSH package list from the existing compatibility declaration plus pi-ai and Node. The local version result describes the declared requirements, not a certification of every Node patch, browser package, or running profile. The public verified-version catalog remains owned by the existing update card and is not changed by probes.

The network provider is a separate, fixed first-party route probe, not a replacement PiAiAdapter. It requires an unexpired owner-only credential, follows no redirects, performs no refresh or retry, and owns an isolated Undici dispatcher. Its result requires finite EOF and complete nonempty output for the exact selected model. Error bodies are discarded. The allowlisted observation carries only an outcome and HTTP status. The caller produces fixed corrective messages, so provider text and credentials cannot leak through string-based error classification.

Only a single completed/rejected observation is retained per diagnostic instance, using a private digest of credential, selected model, versions, timeout, and proxy policy. Cache expiry is lazy and bounded to 60 seconds; it creates no timer. Sign-out or an unusable local prerequisite clears it. Process restart loses all evidence. CLI calls do not share cached evidence or automatically resolve profile settings.

## Alternatives considered

**Instrument every conversation request.** This would require observations to stay scoped to the actual account, model, transport, settings revision, and request lifecycle. The public DSH adapter does not expose all those diagnostic observations together. Introducing wrappers in the existing inference path expands the regression risk and would need assembled session, Fork/restart, and SDK projection coverage. The CLI makes no claim about that path.

**Probe through pi-ai's general stream operation.** Its public options expose an HTTP status callback, but its transport owns global fetch behavior, retries, and response reading. The dedicated probe keeps redirect refusal, output limits, and connection disposal under one owner. It deliberately gives up proving PiAiAdapter execution and reports that narrower scope to users.

**Infer OAuth or model access from metadata, or compaction from a recognized field.** These establish only parsing or catalog facts. Successful ordinary Responses output does not establish context management, continuation, native compaction, or recovery support.

**Persist diagnostic evidence in DSH history.** A local CLI report does not belong in model history. A private replacement-history store would duplicate DSH persistence and violate the ownership constraints in Issue #65.

## Consequences

The command is an initial independently reviewable implementation of Issue #66, not closure of its settings-page and active-request UX goals. Runtime metadata and successful standalone calls have different evidence scopes. HTTP errors describe the observed request, not permanent account or provider-wide support. Credentials are not silently renewed, so expired access leaves OAuth unknown until the normal auth flow is used.

Provider failover and WebSocket fallback are not simulated. Finite SSE is already selected; the plugin has no automatic cross-provider fallback. Native compaction stays rejected by integration policy, while untested optional network behavior stays unknown. These diagnostic results never enable a capability.

The source CLI snapshot uses the real command and installed packages with a temporary unread credential document. Probe fixtures exercise status, schema-only, incomplete, size, and timeout outcomes. The built CLI check exercises offline behavior and an explicitly selected loopback proxy rejection in a bounded child process; it does not use real OAuth or call a model. Existing adapter, compaction, history, and lifecycle regressions remain applicable. Real account success and Linux CI execution must be reported separately from local keyless results.
