# Release hardening tests — 2026-11-08

All code changes remain on the development branch. No production deployment.

## Torn API ID pagination
Official Torn API developer update (2025) describes `filters=idFilter` on user/faction attacks; `from`, `to`, and `sort` then use attack IDs rather than timestamps. Source: https://www.torn.com/forums.php?a=0&b=0&f=63&p=threads&t=16401584 (developer update 20 Nov 2025).

Executed V8 harness using the actual current `cqAttackBackfill` function, mocked ID-filtered Torn API responses, 260 attacks with **identical timestamps**, limit 100:
- cursor 340: 10 unique newer hits recovered in 1 page — PASS
- cursor 250: 100 unique newer hits recovered in 2 pages — PASS
- cursor 100: 250 unique newer hits recovered in 3 pages — PASS
- cursor 1 absent: no unsafe replay, gap retained — PASS
- full userscript V8 syntax parse — PASS

## Ownership
- `recordAttack` checks `cqOwnPoller()` and `activeLoop` before RPC. Mock: non-owner 0 writes; owner 1 write — PASS.
- Added staging-only `design/chain_record_attack_fenced.dev.sql`, which row-locks lease and validates holder/token/epoch/expiry before calling legacy write. **Not executed against a database**.
- Critical: legacy public RPC remains a bypass until all clients are upgraded and its grants revoked. Do not deploy the SQL alone.
- Torn API idFilter behavior was sourced from developer announcement but not tested against live API key.

## Release blockers
1. Integrate verified coordinator Edge Function with fenced writer, then disable direct legacy write grants on a staging DB. Verify SQL function signature and types against actual schema.
2. Real five-tab browser Web Locks, background suspension, late network responses and TornPDA tests.
3. Confirm Torn API idFilter with live API (no API keys in source control).
4. Server-side idempotency of attack recording and cross-member failover tests.

Production remains unchanged.
