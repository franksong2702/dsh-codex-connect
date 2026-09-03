# Upstream DSH compatibility canary

Codex Connect keeps the declared DSH release check separate from upstream release signals. The existing declared check continues to install the exact version in `compatibility.json`. The daily upstream canary resolves one immutable snapshot of `@deepseek-ai/dsh@latest`, `@deepseek-ai/dsh@next`, and `@deepseek-ai/dsh@alpha`, then runs an isolated installation check for each unique candidate that has higher semantic-version precedence than the declared version. A channel that points to the declared version or an older release reports a skipped pass. When multiple tags name the same version, the first channel in `latest`, `next`, `alpha` order owns the check and later channels report a deduplicated pass.

The canary uses a temporary `DSH_HOME`, removes conventional credential-bearing environment variables before executing an upstream candidate, and does not contact a model provider. It never changes the supported version range, deploys a profile, merges code, or publishes a release. Each channel has a 60-minute job budget; registry lookup, installation commands, and the complete candidate check also have explicit timeouts.

## Tracking behavior

Every unique candidate newer than the declared version has one canonical GitHub Issue, identified by an immutable version marker across `latest`, `next`, and `alpha`. A successful bounded check records `passed-needs-full-validation`; it is preliminary evidence and does not declare product compatibility. One failed channel check is retried unchanged against the same dist-tag snapshot. Two matching compatibility failures record `compatibility-failed`; registry, installation, timeout, network, inconsistent retry, and unknown checker failures record `infrastructure-blocked` instead. A changed state, owning channel, or canonical title updates the existing issue, a previously closed issue is reopened, and an unchanged open state and title are left untouched to avoid daily notification noise.

The tracker contains public package versions, the plugin commit, Node.js version, workflow URL, and a bounded path-redacted summary only. It never includes environment values, credentials, OAuth material, prompts, conversations, or private machine paths. The workflow may replace its own `bug` or `enhancement` classification as the state changes, but preserves unrelated maintainer labels.

## Response procedure

1. Open the canonical candidate tracker and linked workflow run. Record the candidate version, current state, plugin commit, stage, and bounded summary.
2. Reproduce the exact version with `DSH_VERSION=<reported-version> DSH_UNDECLARED_CANARY_VERSION=1 node scripts/check-dsh-install.mjs` from the reported commit. Stop after two identical failures and investigate the upstream change instead of retrying repeatedly.
3. Use the reported channel to set urgency. An `alpha` or `next` failure is an early warning; an unsupported `latest` release can affect new DSH installations. Channel names do not establish version ordering, so the canary compares the resolved semantic versions before installation.
4. Create a focused compatibility pull request. Keep `compatibility.json` unchanged until the candidate passes the isolated check and the plugin completes OAuth, model, settings, and required optional-capability validation in the test profile.
5. Record the validation commands, results, test evidence, compatibility pull request, and released plugin version in the tracker. Close it only after the supported release is published or the upstream candidate is withdrawn.

Run the canary manually with:

```sh
pnpm --silent run check:dsh-next -- --channel latest
pnpm --silent run check:dsh-next -- --channel next
pnpm --silent run check:dsh-next -- --channel alpha
```

Each command exits `0` when its channel is unchanged, older than declared support, deduplicated, or compatible; `1` for a candidate compatibility failure; and `2` when the candidate could not be resolved or the checker itself could not run.
