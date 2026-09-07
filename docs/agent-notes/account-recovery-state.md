# Account recovery state

Cancellation ignores the status-only mutation response and reads the same combined account/quota endpoint used by other account mutations. The browser publishes that pair together. If the read fails, it retains the prior pair and reports an operation error; normal retry scheduling remains active.

The pinned OAuth implementation retains an explicit HTTP 400/401 `invalid_grant` JSON response as a typed, secret-free refresh rejection. Request authentication converts the pi-ai OAuth wrapper into `REAUTH_REQUIRED`; quota status maps it to the existing reauthorization UI. Network failures, timeouts, 5xx, rate limits, malformed responses and client-configuration failures do not establish revoked credentials. They remain safe generic failures and preserve the stored account.

The vendored implementation now supplies login and refresh through pi-ai's public OAuth provider methods. pi-ai still schedules refresh and the credential store still serializes it and commits only a successful result. This preserves structured errors before upstream formatting discards their fields; it does not parse arbitrary exception messages. Vendor generation verifies both patches against pi-ai 0.84.4. Remove a patch only after the upstream behavior passes its corresponding regression.

Regression tests use two independent account stores against the real account routes and temporary credential files, and real pi-ai refresh resolution with fixture HTTP responses. No real account or authorization is required. JWT base64url decoding remains a separate follow-up.
