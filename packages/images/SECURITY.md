# Security Policy

Codex Connect — Images is a community Alpha. Report suspected vulnerabilities through this repository's private GitHub security advisory form. Do not open a public issue containing credentials, OAuth URLs, account IDs, prompts, generated images, or raw upstream responses.

The package remains private while the implementation is staged. Network and credential access stay in the versioned Codex Connect core transport. The images package may register its prompt-only tool and write validated PNG, JPEG, or WebP batches through `ctx.attachments`; it must not log full prompts, encoded image bodies, credentials, account IDs, raw upstream responses, or local storage paths.

The browser contribution loads only opaque attachment references through the current DSH session, creates temporary object URLs, and revokes those URLs when the view unmounts. Its settings card may read the core plugin's same-origin authorization status category, but must ignore account metadata and must never render OAuth URLs, tokens, credential paths, or raw upstream errors. Historical tool results are accepted only through the versioned presentation metadata or the exact fixed text summary emitted by this package.
