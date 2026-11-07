# Faction polling coordinator — development test plan

Status: **design only; no database migration applied and no production code path enabled.**

## Authentication using the existing Torn API key
Users already provide a Torn API key. Reuse it; **no separate account or login**.
1. Client submits its key over HTTPS to a staging Edge Function for verification. Never put keys in URLs, logs, analytics, or persistent tables.
2. Server verifies the key directly with Torn, obtains the player ID and faction ID from Torn's authenticated response, and checks the faction is licensed and the player is eligible. Never trust a client-supplied player/faction ID.
3. Server issues a short-lived signed credential scoped to player ID, faction session, and coordinator operations. It must be verifiable by the server on every lease/authoritative-write request.
4. Server-mediated lease claim/renewal derives holder identity from the verified credential, not from caller-supplied p_holder. The private SQL function remains inaccessible to anon.
5. Use a single-flight verification cache with short TTL and explicit expiry to avoid turning verification into another Torn rate-limit source. No API key persistence.
6. Recheck faction membership on a bounded schedule; expire credentials on verification failure.
7. Torn API key scope must allow verified identity/faction queries. If it doesn't, show a precise permissions error rather than silently accepting an unverified identity.

Security note: a Torn API key is a bearer secret. Existing client-side storage is unchanged in this branch; don't forward it to third-party services.

## Lease invariants
1. Exactly one unexpired token per faction session.
2. Same token renews without changing epoch.
3. Different token cannot claim before expiry, even if it supplies the same player ID.
4. Expired token takeover increments epoch.
5. Expired old holder cannot renew.
6. Separate faction sessions do not block one another.
7. Concurrent contenders serialize acquisition.
8. Queue leader and poller holder are independent.
9. Old epoch cannot submit authoritative attack or snapshot updates after takeover (server-side fencing).
10. Expired coordinator stops requesting Torn; its late HTTP responses cannot mutate shared state.

## Integration / browser tests
- Firefox 1, 5, 10 tabs; rapid switching and background throttling.
- Tab closes mid-request; replacement takes over and old response is rejected.
- Suspend/resume browser; ensure no overlapping pollers.
- TornPDA fallback: no Web Locks, localStorage unavailable or partitioned.
- Multiple devices and different members, including leader offline.
- Torn error 5: one key-wide backoff, with jitter and no retry storm.
- Burst of >100 attacks: cursor pagination/overlap, unique attack ID dedup, no skipped rotations.
- Realtime disconnected: bounded Supabase HTTP fallback and correct timer rendering.
- API request counters per endpoint and key fingerprint (never log the API key).

## Release gates
- Run migration and concurrent SQL tests against a **separate staging Supabase project**.
- Run JS syntax and deterministic mock API tests.
- Authenticate and authorize lease RPC calls; add fencing to server-side hit/snapshot writes.
- Feature flag staged coordinator, initially read-only shadow mode.
- Only then evaluate production rollout; never auto-merge or auto-deploy.
