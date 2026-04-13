# Security & Trust Boundaries Axis

Focus on untrusted data, identity, permissions, and exposure.

Look for:

- missing validation or unsafe parsing at trust boundaries
- missing authn/authz or tenant checks
- injection paths into SQL, shell, templates, files, or URLs
- secret exposure in code, logs, telemetry, or errors
- unsafe deserialization, path traversal, SSRF, or XSS-style flows where relevant

Only report issues with a concrete exploit or leakage path.
