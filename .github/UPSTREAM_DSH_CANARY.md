# Upstream DSH compatibility canary

Codex Connect keeps the declared DSH release check separate from upstream release signals. The existing declared check continues to install the exact version in `compatibility.json`. The daily upstream canary resolves both `@deepseek-ai/dsh@latest` and `@deepseek-ai/dsh@next`, packs the current Codex Connect checkout, and runs an isolated installation check for each unique candidate that differs from the declared version. When both tags name the same version, the `latest` channel owns the check and the `next` channel reports a deduplicated pass.

The canary uses a temporary `DSH_HOME`, removes conventional credential-bearing environment variables before executing an upstream candidate, and does not contact a model provider. It never changes the supported version range, deploys a profile, merges code, or publishes a release. Each channel has a 60-minute job budget; registry lookup, installation commands, and the complete candidate check also have explicit timeouts.

## Alert behavior

One failed channel check is retried unchanged. Two failures create an issue only when both reports classify the same channel and candidate version as a compatibility failure. Registry lookup, candidate installation, command timeout, and recognized network failures leave the workflow failed but do not create an issue. An existing issue for the candidate version is updated, and a previously closed issue is reopened instead of duplicated.

## Response procedure

1. Open the linked workflow run and record the candidate version, plugin commit, failed stage, and bounded error summary.
2. Reproduce `pnpm --silent run check:dsh-next -- --channel <reported-channel>` from the reported commit. Stop after two identical failures and investigate the upstream change instead of retrying repeatedly.
3. Use the reported channel to set urgency. A `next` failure is an early warning; an unsupported `latest` release can affect new DSH installations.
4. Create a focused compatibility pull request. Keep `compatibility.json` unchanged until the candidate passes the isolated check and the plugin completes OAuth, model, settings, and required optional-capability validation in the test profile.
5. Record the validation commands, results, test evidence, compatibility pull request, and released plugin version in the alert issue. Close it only after the supported release is published or the upstream candidate is withdrawn.

Run the canary manually with:

```sh
pnpm --silent run check:dsh-next -- --channel latest
pnpm --silent run check:dsh-next -- --channel next --dedupe-against latest
```

Each command exits `0` when its channel is unchanged, deduplicated, or compatible; `1` for a candidate compatibility failure; and `2` when the candidate could not be resolved or the checker itself could not run.
