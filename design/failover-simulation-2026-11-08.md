# Five-tab and stale-coordinator simulations — 2026-11-08

Tests executed against extracted functions from `fix/coordinated-polling-v036` in a mocked V8 harness. No live browser, Torn API, or Supabase database was accessed.

| Scenario | Observed | Status |
|---|---|---|
| Five tabs, sequential fallback localStorage lease election | One owner (tab 0) | PASS in mock |
| Owner stops active loop and releases fallback lease | One successor (tab 1) | PASS in mock |
| 160 attack records all with the same timestamp, page limit 100 | Cursor not recovered; history gap flagged | FAIL for complete recovery (safe stop) |
| Former coordinator calls `recordAttack` after losing ownership | RPC submitted without ownership token | FAIL |

## Remaining release blockers
- `recordAttack` and other authoritative write RPCs require **server-side** fencing by coordinator epoch/token. Client-side checks alone are insufficient.
- Timestamp-only Torn pagination cannot guarantee recovery when a timestamp bucket exceeds the API page size. Use a verified supported cursor/pagination method or retain ATTACK GAP and require reconciliation.
- Test actual Web Locks API with 5+ tabs and simulated suspension, simultaneous wake, and delayed requests; localStorage fallback election is not atomic.
- Test audio permission, 4:00 threshold and background throttling in real browsers and TornPDA.
- Test real Torn v2 pagination and staging Supabase write idempotency before any production rollout.

No production changes. Do not merge or deploy.
