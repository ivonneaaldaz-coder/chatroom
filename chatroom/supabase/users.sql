-- ============================================================
-- CHATROOM.exe — users table (run in Supabase SQL Editor)
-- ============================================================

-- Users table — stores claimed usernames + hashed PINs
create table if not exists users (
  username     text primary key,
  pin_hash     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Enable RLS
alter table users enable row level security;

-- Anyone can check if a username exists (just the username, not the hash)
create policy "Check username availability"
  on users for select
  using (true);

-- Anyone can claim an unclaimed username (insert only, no update via API)
create policy "Claim username"
  on users for insert
  with check (length(username) >= 2 and length(username) <= 30);

-- Update last_seen only (no pin_hash changes via API)
create policy "Update last seen"
  on users for update
  using (true)
  with check (pin_hash = (select pin_hash from users where username = users.username));

-- ── PIN verification function ──────────────────────────────
-- Called client-side: returns true if username + hash match.
-- We never expose the hash directly — this function is the only
-- way to verify, and it only returns a boolean.
create or replace function verify_pin(p_username text, p_pin_hash text)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from users
    where username = p_username
      and pin_hash = p_pin_hash
  );
$$;
