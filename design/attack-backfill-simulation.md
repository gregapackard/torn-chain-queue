# Attack backfill simulation (2026-11-08)

Development branch only; production unchanged.

Tests executed against the actual `cqAttackBackfill` function extracted from `greasyfork/chain-manager.user.js` in a V8 harness with mocked Torn responses.

| Case | Expected | Observed |
|---|---|---|
| Cursor 340 in newest 100 (IDs 350–101) | 10 newer hits | 10, one page |
| Cursor 250 beyond newest 100 | 100 newer hits | 100, two pages |
| Cursor 100 outside retained 250-record history | No unsafe cursor reset | found=false, three pages |
| Cursor 0 absent | No unsafe cursor reset | found=false, three pages |
| Five attacks share each timestamp, cursor 250 | Recover all without duplicate IDs | 100 unique, two pages |

Changes: bounded (12 pages) descending timestamp pagination with inclusive `to` overlap; deduplicate by attack ID; replay in chronological order; retain cursor and surface ATTACK GAP if missing.

**Not yet proven:** Torn API v2 real-world `to` inclusivity, >100 records sharing one timestamp, server-side idempotency of `chain_record_attack`, in-flight stale coordinator fencing, 5-tab real browser failover, audio behavior, or end-to-end Supabase staging. No release approval yet.
