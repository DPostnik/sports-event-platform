# ADR-0042: Authenticate writers and enforce source ownership

Status: Accepted

Date: 2026-11-20

## Context

Every event already records its immutable source. The first implementation lets callers supply a source on create and change events they do not own. [ADR-0028](0028-source-ownership-needs-authentication.md) deferred credential handling and ownership checks.

## Decision

- Require an opaque API key in the `Authorization: Bearer <key>` header for every event write. Keep all GET routes public.
- Configure `WRITER_KEYS` as a JSON object mapping lowercase SHA-256 key hashes to source names. The service hashes each presented key and looks up its source. Multiple hashes may map to the same source. An unset mapping allows reads only. Reject malformed configuration at startup.
- The create body excludes `source`. The authenticated source and the supplied `externalId` form the idempotency key, as in [ADR-0007](0007-source-identity.md).
- Reject missing, malformed and unknown credentials with a 401 problem with code `UNAUTHORIZED` and a `WWW-Authenticate: Bearer` challenge. Authenticate before parsing the write payload.
- A command on a missing event returns 404. A command on another source's event returns a 403 problem with code `FORBIDDEN` before the service evaluates the expected version or lifecycle rules. The application use case checks ownership of the event it read.
- Document bearer security on the write operations in OpenAPI.

## Alternatives considered

- Accept a source claim with the write. A caller could impersonate the owner.
- Store keys in PostgreSQL. An environment mapping supports the exercise without a schema change or credential endpoints.

## Consequences

- This replaces [ADR-0028](0028-source-ownership-needs-authentication.md) and amends [ADR-0007](0007-source-identity.md), [ADR-0017](0017-rest-api.md), [ADR-0018](0018-error-format.md) and [ADR-0021](0021-implementation-boundary.md). Writer authentication and source authorization are built. Per-consumer rate limiting remains described.
- Stored events keep their sources. Configure a key for an existing source to continue writing its events.
- Operators generate and distribute random keys outside the service and deploy a new mapping to change access. Bearer credentials require TLS beyond local development.
