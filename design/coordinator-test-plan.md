# Faction polling coordinator — development test plan

Status: **design only; no database migration applied and no production code path enabled.**

## Identity and authorization blocker
The existing userscript calls Supabase with a publishable key and self-reported Torn player ID. That is **not proof of identity**. Never expose `chain_internal.claim_poll_lease` as an anonymous RPC in this form. Before integration, implement verified Torn identity bound to a server-side session, with eligible faction membership and short-lived credentials. A public function accepting arbitrary `p_holder` would let anyone impersonate the coordinator.

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
