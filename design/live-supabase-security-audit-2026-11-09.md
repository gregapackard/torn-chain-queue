# Live Supabase read-only security audit — 2026-11-09

Project: `axpmotlarzmmhjggmgce` (torn-chain-queue). All SQL in this review was SELECT only. No production database changes.

## Critical
- 19 public `chain_*` functions are executable by `anon` and `authenticated` and run `SECURITY DEFINER`. `chain_session_allowed` is the one listed helper not executable by these roles.
- `chain_set_active` authorizes with a caller-supplied `p_player_id` equality to the owner ID, without authenticating the caller. This permits impersonation by anyone with access to the public client API.
- `chain_session_control`, `chain_pass_lead`, `chain_remove` authorize using caller-supplied leader IDs and database state, not verified caller identity.
- `chain_record_attack` and `chain_apply_snapshot` accept unverified caller-supplied attack/snapshot data. Both are anonymously executable.
- `chain_join_v2`, `chain_energy`, `chain_capability` likewise accept caller-supplied identity/capability data.
- `chain_record_attack` uses advisory transaction lock and unique processed-attack insertion for idempotency, but lacks coordinator lease fencing.
- `chain_apply_snapshot` uses advisory transaction lock, row lock and monotonic Torn timestamp check; these are good transaction protections, **not authorization**.
- Existing client-side identity checks do not secure RPCs.

## Tables and Realtime
- RLS enabled on all seven `chain_*` tables inspected.
- Public SELECT policies on `chain_queue`, `chain_sessions`, `chain_processed_attacks`; `chain_client_config` allows main config read.
- `chain_queue` and `chain_sessions` are published to `supabase_realtime`.
- These policies may be intentional for public queue visibility; do not confuse read permissions with safe writes.

## Recommended cutover
1. Implement a trusted Edge Function auth gateway that verifies Torn identity, membership and authorized leadership for each sensitive action; do not trust browser-supplied IDs.
2. Issue short-lived signed credentials bound to player and session, validate every mutation on the server, and rate-limit calls.
3. Integrate server-side coordinator lease and fenced attack/snapshot writes, with transactional epoch checks and preserved idempotency.
4. Upgrade all clients, verify staging end-to-end and TornPDA compatibility.
5. Revoke `anon`/`authenticated` EXECUTE on legacy mutation RPCs only at coordinated cutover; audit all overloads and grants. Preserve public reads if desired.
6. Run Supabase security advisors after migration and test negative cases: forged owner, forged leader, stale coordinator, duplicate attack, cross-faction write.

Supabase security advisor confirms the anonymously executable SECURITY DEFINER function warning. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Release gate
**BLOCKED** until server-side authorization and legacy bypass closure are tested. Do not deploy SQL proposals directly to production. No production mutations performed in this audit.
