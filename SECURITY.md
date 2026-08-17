# Security Policy

## Support policy

Codex Connect is a community-maintained Alpha plugin. The supported security
baseline is the latest published `alpha` release on the currently supported
DeepSeek Harness and Node.js combinations documented in the README. Older Alpha
releases may not receive fixes; please reproduce on the latest Alpha before
reporting a problem.

Security support is best effort. This project does not promise a fixed
response, remediation, or disclosure time.

## Report a vulnerability privately

Use a GitHub Private Security Advisory for a suspected vulnerability:

<https://github.com/franksong2702/dsh-codex-connect/security/advisories/new>

Do not open a public issue or paste sensitive details into a pull request. Never
include an OAuth authorization URL, authorization code, access or refresh token,
account ID, credential-file contents, or any equivalent secret in a report,
log, screenshot, or configuration snippet. Share only the minimum redacted
steps and metadata needed to reproduce the problem.

For routine bugs and installation problems, use the public issue templates and
provide only the secret-free output requested there.

## Security boundary

- **Community Alpha:** This is community software in Alpha. Review changes and
  use it only in an environment where you accept that maturity and compatibility
  may change.
- **Host permissions:** The plugin runs inside the active DeepSeek Harness
  profile and inherits the host permissions that Harness grants to its shell,
  filesystem, tools, skills, MCP integrations, and subagents. It is not an
  additional sandbox.
- **Local credentials:** OAuth state is kept in the DSH home on the local host.
  The credential directory and file use owner-only permissions where supported.
  Do not copy that state or disclose its contents.
- **Browser origin:** Browser OAuth routes use same-origin and loopback checks by
  default. A trusted origin is an explicit opt-in for a network you control;
  never expose the route to the public Internet.
- **No implicit routing:** Installing or enabling the plugin does not switch the
  Harness default model or global search provider. Any default-model or search
  route change must be an explicit, separate Harness configuration change.

## Safe diagnostic data

The following commands are designed to emit secret-free metadata. Redact any
unexpected values before sharing their output:

```sh
dsh plugin --profile <profile> exec dsh-codex-connect doctor --json
dsh plugin --profile <profile> exec dsh-codex-connect status --json
```

If a report contains sensitive data, remove it from the public channel and use
the private advisory above. Do not attach the original file or log.
