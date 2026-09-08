# Plugin update scope

Issue #163 reported a newer installed DSH version alongside an update warning based on an older compatibility record. The public record tracks verified combinations, not the latest upstream DSH release. Absence from that record cannot establish runtime failure.

Normal update checks now fetch only plugin release metadata and summaries. The update response, browser cache projection, and reminder contain no host version or compatibility verdict. Existing cached host fields are ignored. Successful plugin checks retain their original timestamp for up to 24 hours; unavailable checks retry every five minutes while mounted. Disposal still cancels retries and prevents late cache writes. This supersedes the host-verdict behavior described in `compatibility-refresh.md`.

Explicit local doctor diagnostics distinguish declared matches, unverified package versions, missing metadata, and Node engine mismatches. Unverified diagnostics retain exit code 1 without claiming runtime failure or recommending host changes. Dependency declarations, the verification catalog, and the strict development/release gate are unchanged; this change does not certify newer DSH versions.

Regression coverage exercises plugin-only requests and responses, old cache projection, manual retry and disposal, bilingual reminder behavior, and the diagnostic distinction for DSH 0.1.3-alpha.1. No host deployment or account operation is required.
