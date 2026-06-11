-- ============================================================
-- CHATROOM.exe — Supabase setup
-- Run this in your Supabase SQL editor
-- ============================================================

-- Messages table
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  room        text not null default 'lobby',
  username    text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- Index for fast room queries ordered by time
create index if not exists messages_room_created_idx
  on messages (room, created_at desc);

-- Enable Row Level Security
alter table messages enable row level security;

-- Anyone can read non-deleted messages
create policy "Read non-deleted messages"
  on messages for select
  using (deleted = false);

-- Anyone can insert a message (rate limiting handled client-side + DB trigger)
create policy "Insert messages"
  on messages for insert
  with check (
    length(content) <= 500
    and length(username) <= 30
    and room in ('lobby', 'artists', 'builders', 'marketers', 'travelers', 'random')
  );

-- Nobody can update or hard-delete via API — soft delete only via service role
-- (You delete messages by setting deleted=true directly in Supabase dashboard
--  or via the service role key, never exposed to the client)

-- ── Rate limiting via DB function ──────────────────────────
-- Prevents more than 5 messages per user per 10 seconds at DB level
-- This is a safety net; client-side also enforces limits.
create or replace function check_rate_limit()
returns trigger language plpgsql as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from messages
  where username = NEW.username
    and created_at > now() - interval '10 seconds';

  if recent_count >= 5 then
    raise exception 'rate_limit_exceeded';
  end if;

  return NEW;
end;
$$;

create trigger enforce_rate_limit
  before insert on messages
  for each row execute function check_rate_limit();

-- ── Realtime ───────────────────────────────────────────────
-- Enable realtime for the messages table in Supabase dashboard:
-- Database → Replication → messages → enable

-- ── How to delete a message ────────────────────────────────
-- In Supabase Table Editor, find the row and set deleted = true.
-- It will disappear from all connected clients immediately.
-- You can also run:
--   update messages set deleted = true where id = '<uuid>';
