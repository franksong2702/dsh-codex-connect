# Shared ordinary quota state

Luna Reserve routing has been retired by the maintainer. The quota service remains shared by the account UI and read-only quota tool; no Reserve option, identity parsing, negotiation header or background poller remains. Legacy configuration is accepted but inert. No stored return file is opened or removed.

The service retains a fixed 60-second cache keyed by account and credential fingerprint, concurrent GET coalescing, independent caller cancellation, sixteen-entry bounded storage and invalidation/disposal cleanup. Successful-fetch timestamps stay unchanged on cache hits. A failed refresh removes the usable snapshot and revokes its observation signal; failure cooldowns, bounded positive jitter, Retry-After and terminal-auth latches remain. The tool separately checks observation age/reset times and never turns quota observations into authority.
