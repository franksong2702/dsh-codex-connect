# Request response lifecycle

Quota reads cancel discarded non-success response bodies before reporting the HTTP status. Cancellation failure does not replace the status or the existing HTTP 401/403 reauthorization result. Successful response parsing is unchanged.

Proxy probes recognize native `TimeoutError` exceptions and explicit timeout codes through nested causes. Caller cancellation remains a connection failure rather than an operation timeout. DNS, connection-refused and TLS classifications retain their existing string-code handling.

Regression tests use a local HTTP server with an unfinished error body to verify prompt socket closure, plus fixture responses for cancellation failure and reauthorization. Probe tests use the native `AbortSignal.timeout` reason and nested network errors. These checks do not establish real provider availability or real-account acceptance.
