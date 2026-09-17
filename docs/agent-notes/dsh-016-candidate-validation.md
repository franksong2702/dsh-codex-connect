# DSH 0.1.6 candidate validation

DSH `0.1.6-alpha.1` is a candidate, not a declared supported host. This change does not widen peer dependencies, change `compatibility.json` or `verified-compatibility.json`, publish a release, or upgrade a user profile. Track full acceptance in #207.

## Automated scope

The installation checker now exercises the packed plugin with image generation enabled in addition to its existing provider, Reserve and durable native-compaction checks. It runs the exact host's tool registry and PTC dispatch bridge, validates the rendered image-reference envelope against its typed preview, downloads the original bytes through the registered route, and verifies that a fork inheriting the PTC event can download the original while an earlier fork and an unrelated Session cannot.

The image provider, preview store and code-execution backend are synthetic. The fixture invokes the host-supplied PTC binding; it does not execute arbitrary source, test the real Node PTC process, make provider requests, authenticate a browser, or claim browser rendering. Original storage and the plugin download handler are real. The candidate uses `ptcRuntime`; the existing declared hosts use `codeRuntime`. Both dispatch event names are checked through the actual host, not fabricated session events.

The same-artifact matrix refuses missing image evidence, failed fork authorization checks and nonzero real-provider request counts. Existing browser component regression remains a separate baseline-host check, not proof of the candidate Web composition.

## API assessment

The main plugin does not subscribe to the removed `agent/session-start` event. Its existing image-download and Auto-review readers use `snapshotEvents()`, which the candidate still implements but marks deprecated; deprecation alone does not prove a runtime break. The unmerged Split experiment has separate lifecycle dependencies and is not covered by this assessment. Upstream PTC package/service renaming and the new process backend require explicit coverage before expanding support.

## User acceptance before support expansion

Use a separate disposable DSH home and workspace. Do not upgrade or restart an existing service, copy real account files, or import private session history as part of an automated check. A user must authorize live requests and sign in to the test profile.

- Open the candidate Web UI and confirm plugin settings, model selection, reasoning controls and Fast controls render and retain explicit choices.
- Sign in and complete one ordinary text/tool round trip; verify cancellation and reload/reconnect behavior.
- With image generation explicitly enabled, generate one image through PTC, inspect the actual card, download original and preview, and check reload and fork access. Synthetic provider results do not replace this check.
- Exercise only the optional search, proxy, quota, Auto-review or native-compaction features included in the intended deployment. Record untested features rather than treating default-off loading as their acceptance.
- Record the exact host version, plugin commit/artifact, Node version and observed results without credentials or private transcript content.

After acceptance, update the supported-host metadata together in a separate release change. Publishing and deployment remain separately authorized actions.
