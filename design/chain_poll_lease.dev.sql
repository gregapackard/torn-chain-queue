-- Development-only proposal. DO NOT APPLY TO PRODUCTION.
-- Server-enforced polling lease; not tied to chain_sessions.leader_id.
-- No public client grants: RPC exposure requires a separate authenticated identity design.
create table if not exists public.chain_poll_leases (
  session_id text primary key references public.chain_sessions(session_id) on delete cascade,
  holder_id bigint not null,
  holder_token uuid not null,
  epoch bigint not null default 1,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.chain_poll_leases enable row level security;
revoke all on public.chain_poll_leases from public, anon, authenticated;
-- Keep lease functions private until a verified Torn player identity/auth mechanism exists.
create schema if not exists chain_internal;
create or replace function chain_internal.claim_poll_lease(
  p_session text, p_holder bigint, p_token uuid, p_ttl_seconds integer default 15
) returns table(acquired boolean, lease_epoch bigint, lease_expires_at timestamptz)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.chain_poll_leases%rowtype;
begin
  if p_session is null or p_holder is null or p_holder <= 0 or p_token is null
     or p_ttl_seconds not between 5 and 60 then
    raise exception 'Invalid lease arguments';
  end if;
  -- Serialize acquisition, renewal, and takeover for one faction.
  perform pg_advisory_xact_lock(hashtextextended(p_session, 719314));
  select * into v from public.chain_poll_leases where session_id=p_session for update;
  if not found then
    insert into public.chain_poll_leases(session_id,holder_id,holder_token,epoch,expires_at)
    values(p_session,p_holder,p_token,1,clock_timestamp()+make_interval(secs=>p_ttl_seconds))
    returning * into v;
    acquired:=true;
  elsif v.holder_id=p_holder and v.holder_token=p_token and v.expires_at>clock_timestamp() then
    update public.chain_poll_leases set expires_at=clock_timestamp()+make_interval(secs=>p_ttl_seconds),
      updated_at=clock_timestamp() where session_id=p_session returning * into v;
    acquired:=true;
  elsif v.expires_at<=clock_timestamp() then
    update public.chain_poll_leases set holder_id=p_holder,holder_token=p_token,epoch=epoch+1,
      expires_at=clock_timestamp()+make_interval(secs=>p_ttl_seconds),
      updated_at=clock_timestamp() where session_id=p_session returning * into v;
    acquired:=true;
  else
    acquired:=false;
  end if;
  lease_epoch:=v.epoch;
  lease_expires_at:=v.expires_at;
  return next;
end $$;
revoke all on function chain_internal.claim_poll_lease(text,bigint,uuid,integer) from public, anon, authenticated;
-- IMPORTANT: fencing must also be checked transactionally by the future
-- authoritative hit/snapshot writer; checking a token only in JavaScript is insufficient.
-- No SECURITY DEFINER or publicly executable acquisition RPC is introduced here.

-- REST-facing service-role-only bridge. Public schema is exposed, but anonymous
-- clients cannot execute this function. Edge Function must verify Torn identity.
create or replace function public.chain_claim_poll_lease(
 p_session text,p_holder bigint,p_token uuid,p_ttl_seconds integer default 15
) returns table(acquired boolean,lease_epoch bigint,lease_expires_at timestamptz)
language sql security invoker set search_path=public,chain_internal,pg_temp as $$
 select * from chain_internal.claim_poll_lease(p_session,p_holder,p_token,p_ttl_seconds)
$$;
revoke all on function public.chain_claim_poll_lease(text,bigint,uuid,integer) from public,anon,authenticated;
grant usage on schema chain_internal to service_role;
grant execute on function chain_internal.claim_poll_lease(text,bigint,uuid,integer) to service_role;
grant execute on function public.chain_claim_poll_lease(text,bigint,uuid,integer) to service_role;
