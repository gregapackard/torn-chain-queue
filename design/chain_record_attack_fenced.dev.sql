-- STAGING ONLY. Requires design/chain_poll_lease.dev.sql.
-- IMPORTANT: Deploy only after every client writer is routed through the
-- coordinator Edge Function. Otherwise legacy clients lose attack writes.
-- The Edge Function must verify Torn identity before obtaining a credential.
create or replace function public.chain_record_attack_fenced(
 p_session text, p_player_id bigint, p_player_name text,
 p_attack_id text, p_ended_at bigint, p_holder bigint,
 p_token uuid, p_epoch bigint
) returns boolean
language plpgsql security invoker
set search_path=public,chain_internal,pg_temp as $$
declare
 v public.chain_poll_leases%rowtype;
 v_changed boolean;
begin
 -- The row lock is held until transaction end, serializing lease takeover
 -- against this write. A stale holder cannot write after takeover commits.
 select * into v from public.chain_poll_leases
 where session_id=p_session for update;
 if not found or v.holder_id is distinct from p_holder
   or v.holder_token is distinct from p_token
   or v.epoch is distinct from p_epoch
   or v.expires_at<=clock_timestamp() then
   raise exception 'STALE_COORDINATOR' using errcode='P0001';
 end if;
 select public.chain_record_attack(
   p_session,p_player_id,p_player_name,p_attack_id,p_ended_at
 ) into v_changed;
 return coalesce(v_changed,false);
end $$;
revoke all on function public.chain_record_attack_fenced(text,bigint,text,text,bigint,bigint,uuid,bigint)
 from public,anon,authenticated;
grant execute on function public.chain_record_attack_fenced(text,bigint,text,text,bigint,bigint,uuid,bigint) to service_role;

-- CRITICAL cutover action: revoke the original public RPC EXECUTE grants,
-- AFTER confirming all clients use the fenced endpoint. Otherwise an attacker
-- or outdated client could bypass the fencing entirely.
-- Do not execute these revokes during staging integration without an upgrade plan.
-- revoke execute on function public.chain_record_attack(text,bigint,text,text,bigint)
-- from public,anon,authenticated;
