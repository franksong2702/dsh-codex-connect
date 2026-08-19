# Security Policy

Codex Connect — Images is a community Alpha. Report suspected vulnerabilities through this repository's private GitHub security advisory form. Do not open a public issue containing credentials, OAuth URLs, account IDs, prompts, generated images, or raw upstream responses.

The package remains private while the implementation is staged. Network and credential access stay in the versioned Codex Connect core transport. The images package may register its prompt-only tool and write validated PNG, JPEG, or WebP batches through `ctx.attachments`; it must not log full prompts, encoded image bodies, credentials, account IDs, raw upstream responses, or local storage paths. Browser gallery and lightbox contributions remain out of scope until their separately reviewed phase.
