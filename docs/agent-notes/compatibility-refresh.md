# Compatibility result freshness

## User-visible behavior

The update reminder reuses a compatible result for at most 24 hours, only for the same installed plugin and DSH versions. Cached results without confirmed compatibility are rechecked before being displayed. While the store remains mounted, unconfirmed compatibility and unavailable checks are retried every five minutes. Disposal cancels the retry timer and prevents late responses from writing browser storage.

Compatibility-only overlays provide a direct check button. Both the overlay and settings card show the completion time of the displayed check; reading a cached result preserves its original timestamp. A failed manual retry removes the previous verdict and displays an unavailable message with a retry button, not a red incompatibility claim. Successful verification removes the compatibility-only overlay. The existing update-available overlay retains its upgrade recheck action.

## Cause and evidence limits

A deployed Alpha 4.29 page displayed an unverified DSH 0.1.2-rc.1 combination although the public record included that pair and a fresh check using the installed package returned compatible. The previous store reused every successful lookup, including negative compatibility verdicts, for 24 hours without consulting the record again. The original browser cache contents and the response that first produced the warning were not captured, so its initial source is not established.

The regression reproduces the stale-verdict mechanism with an unchanged installed pair: a cached negative verdict prevents the request that would return a newly verified pair. Additional checks cover mounted recovery, failed refresh invalidation, positive-cache timestamps, and disposal. Chromium tests exercise English and Chinese warning overlays through an offline retry and successful recovery at a narrow viewport.

## Scope

This change does not alter the compatibility catalog, version comparison, supported dependencies, authentication, or release/deployment behavior. A fresh negative result still reports missing verification rather than proving a runtime failure. Upstream HTTP caches can still return an older public record; the browser timestamp records when the check completed, not when the upstream record changed.
