# Authenticated coordinator staging integration — 2026-11-09

## Implemented on dev branch
- `supabase/functions/chain-coordinator/index.ts`: existing Torn API key identity verification issues a short-lived HMAC token bound to player ID and faction session; `claim` submits a server-authenticated lease request; new `record_attack` validates signed credential, UUID token, epoch, player ID, attack ID and name, and invokes ONLY `chain_record_attack_fenced` using server-held service credentials.
- `design/chain_record_attack_fenced.dev.sql`: checks holder ID, token, epoch and expiration inside the same DB transaction as attack recording. Acquires the lease advisory lock before the row lock, consistent with claim operation.

## Integration prerequisites and remaining work
1. Deploy only to an isolated Supabase staging project; no production SQL changes.
2. Validate `chain_poll_leases` schema, service_role table grants, PostgREST RPC visibility and actual function signatures in staging. Current proposals have not passed real DB execution.
3. Edge Function deployment must configure `verify_jwt=false` for Torn-key based verification and enforce server-side token checks for every action. Rate-limit verification attempts and requests; restrict CORS if practical. Never expose service-role or signing secrets to the browser.
4. Implement and test secure gateway handlers for ALL mutating operations (join/leave/lead/queue/session control/energy/snapshot/signal) with per-action verified identity and leadership authorization; currently ONLY claim and fenced record_attack paths are implemented.
5. For attack records, verify attack IDs and player identity against Torn server data or rely on a strictly trusted poller and server-side audit; the current endpoint trusts attack metadata supplied by the authenticated coordinator.
6. Adapt the userscript to obtain verified credentials, claim lease, pass epoch and route attack writes through the gateway. The userscript still calls legacy RPCs.
7. Test 5 tabs, simultaneous takeover, stale token, expired credential, replayed attack ID, offline mode, TornPDA, and background suspension.
8. Only after staging passes and every client is migrated, revoke anon/authenticated EXECUTE on legacy mutating RPCs in a coordinated production cutover. Leaving legacy RPCs public bypasses gateway security.
9. Review the existing `chain_set_active` owner-ID impersonation vulnerability; it remains live until migration.

## Security gate
**NOT PRODUCTION READY.** This is staged code only, not a completed authorization migration. Do not deploy it to production or revoke existing RPCs in isolation.
