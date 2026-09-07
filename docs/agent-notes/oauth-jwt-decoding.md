# OAuth JWT payload decoding

The pinned OAuth copy decodes the payload using the base64url alphabet and a fatal UTF-8 decoder before JSON parsing. Existing account identity validation still requires a nonempty string. Padding is accepted for compatibility with existing fixtures, while invalid alphabet characters and invalid UTF-8 fail. This is claim extraction from an OAuth response, not JWT signature verification or an entitlement check.

Login and refresh use the same decoder. Failed extraction prevents a credential commit; refresh cannot change the captured account identity. The reproducible vendor script owns the patch and rejects an unexpected upstream decoder before rewriting anything.

Tests exercise actual device-code login and refresh resolution against temporary credential files with fixture HTTP responses. They cover both base64url-specific characters, unpadded payloads, Unicode identities and claims, malformed JSON, invalid UTF-8, missing/invalid account identities and unchanged old credentials after failure. No real credentials or device authorization are used.
