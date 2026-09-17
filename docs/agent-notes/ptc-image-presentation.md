# Image presentation through PTC

Fixes the presentation failure reported in issue #205.

DSH 0.1.5-rc.2 intentionally invokes `output.presentationMeta` only for top-level tools. Its `tool/ptc-dispatch` event preserves rendered content, not that metadata. Therefore image generation can succeed while the nested tool view cannot decode a result.

The plugin now renders a bounded, versioned text envelope containing original/preview references alongside its typed image attachments. The tool view validates the envelope and requires an exact match to those image attachments. It does not parse arbitrary prose, accept raw paths, or infer an original from a preview hash. Existing direct-tool metadata remains authoritative; malformed metadata is not silently bypassed.

Old PTC sessions without the envelope recover their typed previews and preview downloads. Their original IDs were not preserved in nested result content, so this fallback deliberately does not advertise an original download. New results support both representations. Fork authorization also recognizes successful inherited PTC events, preserving the immutable inherited-prefix and stored-original checks. Both the legacy `tool/code-dispatch` and current `tool/ptc-dispatch` event names are supported.

## Verification

- Decoder tests: legacy previews, full envelopes, missing/mismatched attachments, duplicate/oversized/malformed envelopes, invalid references.
- Component tests: nested PTC cards recover galleries and download controls with and without original references.
- Route tests: inherited PTC originals work; failed/wrong-tool/non-inherited events remain denied.
- Existing direct calls, original integrity and nested/restored session tests remain applicable.

This change does not change image-provider selection, copy files into a workspace, expose the plugin storage directory, or add a filesystem sidebar integration. A successful generator result proves storage, not that the browser rendered it; operational acceptance must inspect the actual card.
