# Experimental Astra reasoning changes

This feature is default-off and intended for testing. It uses Astra `configuration_update` input items to change effort for later requests without changing the original request-level effort. Cache reuse, output quality, subscription usage, and account availability are not guaranteed.

## Try it

1. Install the PR build in a test DSH profile. This PR is not an npm release; keep the normal profile unchanged.
2. In Settings → Plugins → Plugin configuration → Codex Connect, enable **Experimental Astra reasoning changes** and save. The corresponding plugin config is `enableReasoningUpdates: true`.
3. Start a new GPT-6 Astra conversation and explicitly choose `low`, `medium`, `high`, `xhigh`, or `max`; do not use Default.
4. Discuss an ordinary requirement, then progress naturally into a difficult design or diagnosis and finally routine wrap-up. Do not mention reasoning levels or name the tool: the model receives the proactive recommendation guidance itself.
5. Observe whether Astra proposes a justified change at a useful moment, avoids repetitive questions, and respects refusal. Approve or decline a proposal through the native question. A change is not mandatory: retaining the current level can be appropriate. Judge the recommendation, not the number of calls.
6. After approval, continue the task and later resume the same conversation. The tool reports a queued change; the approved notice enters the next request after its configuration update. The model selector still displays the original level. Request evidence is needed to verify actual wire effort; UI behavior alone does not establish service-side execution.

Developer-only smoke tests may explicitly request `codex_connect_set_reasoning_effort`. They verify the confirmation/replay plumbing, not autonomous recommendation quality, and are not the main user acceptance test.

Astra is instructed to proactively assess increases and decreases as the task develops, without treating tool use as an escalation trigger or repeatedly pressing a rejected proposal. Harness does not score difficulty or decide a level. A logged state notice supplies the explicit original and effective effort on initial admission and when that state changes. Restored history retains these notices; unchanged state is not repeatedly appended. Default is reported as lacking an explicit initial selection, not guessed.

Declining makes no change. Canceling before admission can discard the queued notice. Disabling the option removes new proposals and cancels pending questions; already admitted approvals continue to replay. It does not reset an existing conversation's effective effort. To reset without another confirmed update, start a new conversation.

## Limits and verification

The initial version supports only the live main agent, the original session identity, full uncompacted history, and an unchanged model/initial effort selection. Forks containing approvals, compaction, auxiliary model calls, automatic truncation, and server-side previous-response chaining are rejected. Start a new conversation when one of these is needed. A profile must supply a human-question answerer.

Keyless tests assemble the real DSH agent loop, tool runtime, user-question service, Codex adapter, and synthetic SSE transport. They cover approval/decline, cancellation/unload, selection changes while answering, persisted session JSON restoration, original-position replay, and default-off settings. They do not establish live ChatGPT acceptance or browser interaction acceptance; those are the PR's user test.

## Implementation note

Approval is stored in the ordinary `user/message` event as structured `dsh-codex-connect` plugin-source metadata, together with its visible notice. No text pattern grants approval, no defaults are written, and no mutable per-session override table is used. DSH's session append/restore validation preserves the metadata. The provider's public payload hook inserts updates using request-local asynchronous scope after the normal pi-ai conversion, including prepared calls. Guards reject missing or inconsistent approvals before dispatch.

The protocol reference is [OpenAI: Change reasoning mid-conversation](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation). This plugin intentionally supports a smaller subset than the protocol: in particular, it does not implement compaction-trigger reinsertion.
