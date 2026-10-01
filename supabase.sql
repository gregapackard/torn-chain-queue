create table if not exists public.chain_queue (
  session_id text not null,
  player_id bigint not null,
  player_name text not null,
  position integer not null,
  joined_at timestamptz not null default now(),
  last_hit_at timestamptz,
  primary key (session_id, player_id)
);
alter table public.chain_queue enable row level security;
create policy "public live queue read" on public.chain_queue for select using (true);
create policy "public live queue insert" on public.chain_queue for insert with check (true);
create policy "public live queue update" on public.chain_queue for update using (true) with check (true);
create policy "public live queue delete" on public.chain_queue for delete using (true);
alter publication supabase_realtime add table public.chain_queue;
