# Fenced snapshot and identity hardening — 2026-11-09

Development branch only. No live Supabase SQL or Edge Function deployed.

## Implemented
- Added `apply_snapshot` gateway action that validates signed coordinator credentials, numeric fields, lease UUID and epoch and calls `chain_apply_snapshot_fenced`.
- Added `design/chain_apply_snapshot_fenced.dev.sql`: transaction-level advisory lock matching lease claim, row lock, holder/token/epoch/expiry checks, then existing monotonic-timestamp snapshot RPC. Grants intended only to service_role.
- Strengthened signed credential checks (audience, subject, faction, session, issue time, expiry).
- Faction verification now requires a matching enabled, unexpired `chain_allowed_factions` row.

## Static checks
- Gateway: 8/8 structural assertions passed.
- Fenced snapshot SQL: 5/5 structural assertions passed.
- These do NOT replace compilation, SQL migration validation, live Torn verification, attack provenance verification, or end-to-end tests.

## Release blockers
1. No isolated staging Supabase project available/selected; do not apply development SQL to the live project.
2. The browser userscript still calls legacy public RPCs and does not hold a server lease credential.
3. The legacy RPCs remain anonymously executable; gateway authorization can be bypassed until a coordinated cutover.
4. Attack and snapshot payloads are not independently verified against Torn by the gateway. A verified client could submit fabricated data.
5. `chain_session_control` cursor/timer-sync paths need a trusted server-only implementation; they are intentionally excluded from gateway controls.
6. Need rate limits, authenticated request negative tests, simultaneous five-tab tests and TornPDA integration.
7. The Edge Function source has not been Deno-compiled or deployed.
8. Recheck `chain_allowed_factions` REST permissions and service-role execution in staging.

## Safe next action
Provision an isolated staging Supabase project, apply lease and fenced RPC proposals there, deploy Edge Function with test-only secrets, run negative tests, then migrate userscript. Do not revoke production RPC permissions until all clients are migrated.
