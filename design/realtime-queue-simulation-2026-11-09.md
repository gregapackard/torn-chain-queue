# Realtime and queue simulation — 2026-11-09

Source: actual functions extracted from `greasyfork/chain-manager.user.js` on `fix/coordinated-polling-v036`. Mocked WebSocket, timers, and Supabase `db()`; no live Torn, Supabase, browser, or TornPDA connection.

## Realtime
- First disconnect: retry scheduled at 2,000 ms with jitter fixed to midpoint — PASS.
- Second disconnect: retry scheduled at 4,000 ms — PASS.
- Successful `phx_reply`: `rtJoined=true`, reconnect attempt reset, one `load()` triggered — PASS.
- Intentional `rtStop()`: reconnect timer cleared and socket closed without scheduling another — PASS.

## Queue loading
- Queue returns `undefined` twice: old queue preserved, `diag.queue=false` — PASS.
- Queue succeeds but session request throws: old queue preserved, unhealthy — PASS.
- Queue succeeds but session is empty: old queue preserved, unhealthy — PASS.
- Queue undefined first attempt, retry succeeds: new queue and session committed — PASS.

## Caveats
- These are isolated function simulations, not integration tests.
- A successful generic `phx_reply` (such as heartbeat acknowledgement) is currently treated as successful subscription; should correlate join reply to its reference.
- Concurrent `load()` calls are not serialized or versioned, so an older delayed response could overwrite a newer snapshot.
- Need real browser network-flap and TornPDA tests; verify server-side authorization and fencing before release.
