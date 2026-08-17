## Problem

What user or maintenance problem does this pull request solve?

## Scope

What files and behavior are changed? What is deliberately not changed?

## Validation

Provide the validation triplet below. Do not write only “tests pass”.

Validation command:

```text
<exact command, for example: pnpm run check>
```

Result:

```text
<exit code and important output lines>
```

Evidence path:

```text
<log, report, screenshot, or other concrete artifact path>
```

## Security

Describe security-sensitive behavior, permissions, network access, trust-boundary
changes, and why the change is safe. State “None” when there is no impact.

## Privacy

Describe data read, written, transmitted, or persisted by this change. Confirm
that OAuth URLs, codes, tokens, account IDs, credential contents, and private
machine paths are not included in source, tests, logs, screenshots, or docs.

## Out of scope

List related work intentionally left for a separate change.

## Checklist

- [ ] This pull request contains one focused change and was created from `main`.
- [ ] I ran `pnpm install --frozen-lockfile`.
- [ ] I ran `pnpm run check`.
- [ ] I ran any additional relevant checks and recorded the validation triplet above.
- [ ] I ran `pnpm run build` when generated `lib/` output needed updating; I did not hand-edit generated files.
- [ ] If the README changed, `README.md` and `docs/README.zh.md` remain synchronized.
- [ ] Public-facing text is in English and uses the issue templates where applicable.
- [ ] No credentials, OAuth material, account IDs, or private local paths are committed.
