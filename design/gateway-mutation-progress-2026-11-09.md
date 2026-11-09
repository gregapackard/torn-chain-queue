# Identity-bound gateway implementation — 2026-11-09

## Added to staging Edge Function
- Signed Torn identity credential checked for every mutation.
- Identity-bound: join, leave, energy, capability, hit signal, take lead, claim stale lead.
- Current-leader-only: pass lead, remove, skip, tempo/manual-hit/pause/heartbeat.
- Owner-only: set active, requires `CHAIN_OWNER_TORN_ID` environment variable and existing DB owner check.
- Fenced attack recording via service-role-only RPC.
- Attack ID numeric regex corrected.

## Static checks run
PASS: credential check present; leader gate present; identity bound to `claims.sub`; owner gate present; controls allowlist; fenced RPC call; attack ID regex; no arbitrary user-selected RPC dispatch.

## Important unverified/unfinished
- Static checks are NOT functional security tests or Deno compilation.
- Staging deployment and actual DB function/grant verification still required.
- Client still uses legacy public RPCs, so no production security improvement yet.
- Torn identity verification endpoint response shapes and membership permissions need real Torn API integration tests.
- Verify that the owner environment variable matches the existing DB owner check.
- Missing secure `chain_apply_snapshot` and timer-sync/cursor actions, as well as stronger attack data validation against Torn.
- No rate limiting, credential revocation, browser/TornPDA compatibility or negative authorization tests yet.
- Do not deploy production or revoke legacy RPCs until coordinated migration.
