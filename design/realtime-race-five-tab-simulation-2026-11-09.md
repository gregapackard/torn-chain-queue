# Realtime race and five-tab failover simulation — 2026-11-09

Development only. Actual functions extracted from current userscript and executed with mocked WebSocket, timer, DB and localStorage implementations. No live Torn API, Supabase or real browser tested.

## Realtime join correlation
- Unrelated `phx_reply` ref: ignored, 0 loads — PASS.
- Correct join ref/topic: accepted, 1 resync load — PASS.
- Old socket ref after reconnect: ignored — PASS.
- New socket ref/topic: accepted, 2nd resync load — PASS.

## Queue snapshot races
- Older `load()` finishes after newer: queue remains newer value — PASS.
- Realtime mutation revision changes during `load()`: in-flight stale snapshot discarded — PASS.

## Five-tab fallback lease
- Sequential ownership takeover on tab shutdown: owners 0 → 1 → 2 → 3 → 4, exactly one owner in each round — PASS.
- Full userscript JS syntax parse — PASS.

## Remaining risks
- This does not simulate simultaneous localStorage writes; fallback localStorage lease is not atomic. Prefer Web Locks in supported browsers and test contention in actual tabs.
- In-flight Realtime resync requests may be invalidated by events; periodic refresh must reconcile, and a retry should be scheduled if the revision changes repeatedly.
- Need live browser/TornPDA integration, server-side fenced RPC deployment and grants audit, and real Torn API idFilter verification before release.
