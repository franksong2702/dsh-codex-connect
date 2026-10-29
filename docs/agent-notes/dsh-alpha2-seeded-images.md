# Seeded image-original inheritance — 2026-10-29

This product repair is based on fixture commit
`cb6626ede1bd6b85620082f0123f74abdca4fe5e` from PR #407. It extracts only the
`inheritedImageOriginal` repair from PR #402's immutable source
`6fc368b31a4d81040f09cfcb53c861e2273fa3ec`, adds boundary coverage and synchronizes
the generated `lib/index.js`. It contains no Computer Use, Host patch or Reserve
change, and does not declare stock alpha.2 supported.

Stock `@deepseek-ai/dsh-session@0.2.2-alpha.2` ordinary forks retain their validated
`isSeeded: true` marker and exact inherited-event count, while omitting
`parentSession`. Requiring the latter incorrectly denied originals present in a
valid inherited prefix. The pre-fix stock component returned 404 for that request.

The repair accepts either legacy `parentSession` or exact boolean `isSeeded: true`,
with a positive safe-integer inherited count. It still scans only events below
that cut. The marker/count come from the Host's validated Session header and
inherited boundary;
neither is taken from HTTP request data or image-looking user prose. Existing
successful-event decoding, Host/browser admission, exact asset metadata, file
checks and content digest verification remain unchanged. No ancestor session
needs to be loaded and no application permission is created.

New Native, code-dispatch and PTC-dispatch cases cover valid seeded-only access,
false/missing/string markers, zero/negative/fractional/NaN/infinite/unsafe counts,
and events at or beyond the inherited cut. Existing early-fork, unrelated-session,
failed-result, nested/restored-fork and authentication cases remain required.

The [component evidence](fixtures/dsh-alpha2-seeded-images.json) records fresh
candidate bytes and source hashes. All 321 stock DSH archives were rechecked
against the previously verified official npm SRI, all 8,277 regular files still
matched and no unexpected regular files were present. The new private/unverified
candidate was installed into a fresh temporary DSH home by the official plugin
command with exact alpha.2 peers; the formal compatibility/peer declarations
were not changed.

The complete stock image component now passes: generation 2, editing 2, PTC code
calls 2, exact original bytes, authentication, inherited originals and edits,
early-fork/unrelated denial, invalid edit refusal and cross-provider handles.
Provider, image bytes, preview store and code-runtime execution remain synthetic;
real provider requests are zero. This is a macOS component result, not a Linux
run, a real-account image acceptance, a performance comparison or full stock
compatibility. Reserve remains a separate known failure requiring its own
Host-contract decision. Existing supported Host/Node CI must pass independently.
