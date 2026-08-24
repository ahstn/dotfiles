# Security & Trust Boundaries Axis

Focus on untrusted data, identity, authority, sensitive assets, and externally reachable resource use. This axis owns concrete attack and leakage paths introduced or worsened by the change.

## Core standard

Authenticate identity, authorize the requested action and object, validate untrusted input, encode output for its destination, and fail closed. Grant each component and caller only the authority and data needed for the operation.

Security review follows data and authority across boundaries. A secure helper does not make the flow safe if validation, authorization, or encoding occurs after a dangerous sink.

## Review method

1. Identify protected assets, actors, entry points, trust boundaries, and privilege changes touched by the diff.
2. Trace untrusted values from source through validation, transformation, storage, logs, and final sink.
3. Trace identity and authorization context independently from input data.
4. Test the design mentally as an unauthenticated user, a valid user acting on another object or tenant, and a compromised low-privilege component.
5. Check failure behavior, observability, and resource limits.

Treat client code, headers, filenames, URLs, queue messages, database content, cached objects, and upstream service responses as untrusted unless the system proves otherwise.

## Required checks

### 1. Authentication, session, and authorization

- Is authentication required at every protected entry point, including alternate transports and background handlers?
- Is authorization checked server-side for the action and the specific object, tenant, account, or scope?
- Can a caller select an owner, tenant, role, price, status, or permission through request data that should come from trusted context?
- Are deny-by-default and least-privilege rules preserved when fields, routes, or roles are added?
- Can stale sessions, revoked credentials, or privilege changes remain effective longer than the stated contract?
- Are state-changing browser requests protected according to the application’s CSRF and cookie model?
- Do administrative or service credentials cross into lower-trust code or logs?

Centralize policy decisions where practical, but verify that every entry path reaches the policy. A hidden route around a central check is still a defect.

### 2. Validation, canonicalization, and parsing

- Is input validated against allowed semantics, not only syntax or type shape?
- Are length, depth, count, range, and resource limits enforced before expensive work or allocation?
- Is canonicalization performed once before comparison or authorization, without later reinterpretation?
- Can duplicate keys, mixed encodings, Unicode variants, case folding, null bytes, or parser differentials bypass a check?
- Are filenames and paths resolved and then constrained to the intended root?
- Are archive entries, redirects, and nested content checked at each relevant boundary?
- Does malformed input fail closed without exposing parser internals or partial trusted state?

Prefer allowlists for finite domains. Preserve the original value only when audit or signature verification requires it.

### 3. Injection and output handling

- Do SQL and query languages use parameter binding for data while allowlisting identifiers that cannot be bound?
- Do process calls pass argument arrays instead of building shell command strings?
- Is HTML, JavaScript, CSS, URL, CSV, log, and template output encoded for its exact destination context?
- Can user-controlled values alter file paths, redirects, proxy targets, templates, regular expressions, or dynamic code?
- For outbound URLs, are schemes, hosts, ports, redirects, DNS resolution, and private address ranges constrained as required?
- Does deserialization instantiate types, execute hooks, or accept polymorphic payloads beyond the needed schema?

Sanitization is not a universal substitute for parameterization or contextual encoding. Review the final sink.

### 4. Secrets, cryptography, and sensitive data

- Are credentials, tokens, private keys, session identifiers, reset links, and sensitive payloads absent from source, errors, logs, telemetry, URLs, and client-visible state?
- Are secrets obtained from the established secret store and limited to the component that uses them?
- Are comparisons, random values, signatures, hashes, encryption modes, and key sizes provided by approved platform primitives?
- Is password storage adaptive, salted, and delegated to the project’s established password-hashing library?
- Are nonces, initialization vectors, salts, and keys generated with cryptographic randomness and used according to the primitive’s contract?
- Does data collection, persistence, caching, and response shaping expose more sensitive data than the operation needs?

Do not propose custom cryptography. Report the broken property and direct the author to the project’s approved primitive or security owner.

### 5. Logs, errors, and audit evidence

- Do errors reveal account existence, authorization policy, internal paths, queries, stack traces, or secrets to an untrusted caller?
- Are log fields structured or encoded so untrusted text cannot forge entries or corrupt downstream parsing?
- Do security-relevant actions record actor, action, target, outcome, and correlation data without recording secrets?
- Can attackers suppress, flood, or bypass the audit path through an alternate flow?
- Are authorization failures distinguishable to operators while remaining appropriately opaque to callers?

Logging is not a security control if the event cannot be tied to an actor and target or if sensitive data makes the log itself hazardous.

### 6. Dependencies, files, and execution boundaries

- Does a new dependency have a justified purpose, controlled version, acceptable provenance, and limited runtime authority?
- Are lockfiles, integrity checks, and repository conventions preserved?
- Can uploaded files trigger active content, parser exploits, decompression bombs, or unsafe execution?
- Are temporary files created with safe permissions and race-resistant APIs, then removed on all paths?
- Can plugins, templates, configuration, or serialized data load executable code from an untrusted location?
- Are generated artifacts and build steps protected from untrusted path or command injection?

### 7. Resource abuse and availability

- Can an untrusted caller trigger unbounded work, storage, fan-out, recursion, retries, or concurrency?
- Are request size, batch size, pagination, timeout, queue, and decompression limits enforced before resource exhaustion?
- Can expensive authorization, search, regex, cryptographic, or parsing work be amplified cheaply?
- Are rate limits keyed to an identity or resource that an attacker cannot rotate without cost?
- Does failure release connections, locks, file descriptors, memory, and worker capacity?

Performance owns normal workload efficiency. Security owns attacker-controlled amplification and denial of service.

## Finding bar

A security finding must include:

- attacker position or untrusted source
- the missing or bypassed control
- the source-to-sink or authority path
- the asset, tenant, privilege, or availability impact
- a correction at the correct trust boundary

Do not require a weaponized exploit when the diff clearly removes a required control on a reachable path. Do not inflate severity when reachability, privileges, or impact are uncertain; state those facts as verification gaps.
