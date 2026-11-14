-- DEVELOPMENT ONLY. Do not run against production.
-- Requires chain_poll_lease.dev.sql. Install in isolated staging.
-- Serializes lease takeovers and snapshot updates using the SAME advisory lock.
create or replace function public.chain_apply_snapshot_fenced(
 p_session text,p_torn_timestamp bigint,p_current integer,p_max integer,
 p_end bigint,p_cooldown bigint,p_holder bigint,p_token uuid,p_epoch bigint
) returns boolean
language plpgsql security invoker
set search_path=public,chain_internal,pg_temp as $$
declare v public.chain_poll_leases%rowtype;
begin
 if p_session is null or p_holder is null or p_token is null or p_epoch is null then
   return false;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session,719314));
 select * into v from public.chain_poll_leases where session_id=p_session for update;
 if not found or v.holder_id is distinct from p_holder
   or v.holder_token is distinct from p_token
   or v.epoch is distinct from p_epoch
   or v.expires_at<=clock_timestamp() then
   raise exception 'STALE_COORDINATOR' using errcode='P0001';
 end if;
 return public.chain_apply_snapshot(
  p_session,p_torn_timestamp,p_current,p_max,p_end,p_cooldown
 );
end $$;
revoke all on function public.chain_apply_snapshot_fenced(text,bigint,integer,integer,bigint,bigint,bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.chain_apply_snapshot_fenced(text,bigint,integer,integer,bigint,bigint,bigint,uuid,bigint) to service_role;
-- At coordinated cutover, revoke anon/authenticated access to legacy chain_apply_snapshot.
