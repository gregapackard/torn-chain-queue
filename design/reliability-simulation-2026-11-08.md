# Reliability simulation — 2026-11-08

Branch: `fix/coordinated-polling-v036`. No production changes.

## Executed checks (V8, extracted current functions with mocked Torn responses)
- Full userscript syntax parse: PASS.
- Personal history: cursor 50 absent from newest 10 attacks (IDs 200–191). Result: **ATTACK GAP** warning, 0 attacks silently applied, cursor retained. PASS for detection, FAIL for recovery.
- Faction history: cursor 50 absent from newest 100 attacks (IDs 200–101). Result: **ATTACK GAP** warning, 0 attacks silently applied, cursor retained. PASS for detection, FAIL for recovery.
- Turn chime after unrelated faction attack: PASS (previous check).
- Single-flight `pollFast` guard: code review only; not browser concurrency-tested.

## Important remaining defects
1. Cursor overflow detection is not pagination or recovery. Until backfill is implemented, the queue can stall or miss rotation after long suspension.
2. Current in-flight Torn/Supabase operations may complete after poller ownership is lost; add generation fencing at the client and server.
3. Existing faction leader heartbeat is separate from cross-member coordinator. The staging-only coordinator is not integrated or tested.
4. Alarm sounds require browser user activation and background throttling tests.
5. Supabase Realtime and multi-tab takeover need a real browser/staging test.

## Release decision
**Do not merge or publish this branch yet.** The simulation verifies detection of a missing cursor, not complete recovery or five-tab safety.
