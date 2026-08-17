# Contributing

Thanks for helping improve Codex Connect. Keep each pull request focused on
one change and start your branch from the current `main` branch.

## Local checks

From a clean checkout, install the locked dependencies and run the complete
check before opening a pull request:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

The `lib/` directory is generated output. Update it only by running the project
build (`pnpm run build`); do not hand-edit generated files.

## Documentation and issue reports

- Keep `README.md` and `docs/README.zh.md` in sync when changing the user guide.
  Preserve the same commands, behavior, and safety warnings in both languages;
  keep canonical model, provider, and command identifiers unchanged.
- Public-facing project copy, issue titles, and template text must be in English.
  Chinese documentation belongs in `docs/README.zh.md`.
- Use the supplied issue templates for bug reports, installation problems, and
  feature requests. Do not include credentials, OAuth material, or private
  machine paths in issues, pull requests, logs, screenshots, or test fixtures.
- For suspected vulnerabilities, use the private security advisory link in
  `SECURITY.md` instead of a public issue.

## Pull requests

Describe the problem, scope, validation command and result, evidence path, and
any security or privacy impact. State what is deliberately out of scope. Keep
generated changes and unrelated formatting out of a focused pull request.
