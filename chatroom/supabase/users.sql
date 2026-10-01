-- ============================================================
-- CHATROOM.exe — lightweight username identity
-- Run this in the Supabase SQL Editor before deploying this branch.
--
-- Model:
--   • browser device token = automatic recognition on this browser
--   • optional user-created 6-digit PIN = portability to another device
--   • raw device tokens and raw PINs are never stored in Postgres
-- ============================================================

create extension if not exists pgcrypto;

-- Existing installs already have this table. These statements are written
-- to upgrade them in place without deleting existing usernames.
create table if not exists users (
  username          text primary key,
  pin_hash          text,
  device_token_hash text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);

alter table users alter column pin_hash drop not null;
alter table users add column if not exists device_token_hash text;

alter table users enable row level security;

-- Identity reads/writes happen through security-definer RPCs below.
-- Do not expose credential hashes through normal table SELECT.
drop policy if exists "Check username availability" on users;
drop policy if exists "Claim username" on users;
drop policy if exists "Update last seen" on users;

-- ── PIN attempt limiter ────────────────────────────────────
-- Global per-username limiter. This is intentionally simple for a tiny
-- public chatroom: max 20 failed PIN attempts per 10-minute window.
create table if not exists pin_auth_attempts (
  username       text primary key,
  window_started timestamptz not null default now(),
  attempts       integer not null default 0
);

alter table pin_auth_attempts enable row level security;

-- ── Username status ────────────────────────────────────────
create or replace function username_status(p_username text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'claimed', exists(select 1 from users where username = lower(p_username)),
    'has_pin', coalesce((select pin_hash is not null from users where username = lower(p_username)), false)
  );
$$;

-- ── Claim an available username ────────────────────────────
create or replace function claim_username(p_username text, p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
begin
  if length(v_username) < 2
     or length(v_username) > 30
     or v_username !~ '^[a-z0-9_-]+$'
     or length(p_device_token) < 32 then
    return false;
  end if;

  insert into users (username, pin_hash, device_token_hash)
  values (
    v_username,
    null,
    encode(digest(p_device_token, 'sha256'), 'hex')
  )
  on conflict (username) do nothing;

  return found;
end;
$$;

-- ── Recognize a saved browser ──────────────────────────────
create or replace function verify_device(p_username text, p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select exists(
    select 1
    from users
    where username = lower(trim(p_username))
      and device_token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
  ) into v_ok;

  if v_ok then
    update users
      set last_seen_at = now()
      where username = lower(trim(p_username));
  end if;

  return v_ok;
end;
$$;

-- ── Create or change your optional PIN ─────────────────────
-- Only a browser that already holds the device token can set/change it.
create or replace function set_username_pin(
  p_username text,
  p_device_token text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{6}$' then
    return false;
  end if;

  update users
    set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
        last_seen_at = now()
    where username = lower(trim(p_username))
      and device_token_hash = encode(digest(p_device_token, 'sha256'), 'hex');

  return found;
end;
$$;

-- ── Sign in on a new browser with PIN ──────────────────────
-- Successful sign-in registers that browser's device token too.
-- Old accounts whose PIN was stored with the original client-side SHA-256
-- scheme continue to work and are transparently upgraded to bcrypt.
create or replace function verify_pin_and_register_device(
  p_username text,
  p_pin text,
  p_device_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
  v_hash text;
  v_attempts integer;
  v_window timestamptz;
  v_ok boolean := false;
begin
  if p_pin !~ '^[0-9]{6}$' or length(p_device_token) < 32 then
    return false;
  end if;

  select attempts, window_started
    into v_attempts, v_window
    from pin_auth_attempts
    where username = v_username;

  if found and v_window > now() - interval '10 minutes' and v_attempts >= 20 then
    return false;
  end if;

  if found and v_window <= now() - interval '10 minutes' then
    delete from pin_auth_attempts where username = v_username;
  end if;

  select pin_hash into v_hash
    from users
    where username = v_username;

  if v_hash is not null then
    if v_hash like '$2%' then
      v_ok := crypt(p_pin, v_hash) = v_hash;
    else
      -- Legacy 6-digit PIN hash from the original app.
      v_ok := encode(digest(p_pin || 'chatroom-exe-salt', 'sha256'), 'hex') = v_hash;
    end if;
  end if;

  if v_ok then
    update users
      set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
          device_token_hash = encode(digest(p_device_token, 'sha256'), 'hex'),
          last_seen_at = now()
      where username = v_username;

    delete from pin_auth_attempts where username = v_username;
    return true;
  end if;

  insert into pin_auth_attempts (username, window_started, attempts)
  values (v_username, now(), 1)
  on conflict (username) do update
    set attempts = case
          when pin_auth_attempts.window_started <= now() - interval '10 minutes' then 1
          else pin_auth_attempts.attempts + 1
        end,
        window_started = case
          when pin_auth_attempts.window_started <= now() - interval '10 minutes' then now()
          else pin_auth_attempts.window_started
        end;

  return false;
end;
$$;

-- ── Legacy compatibility ───────────────────────────────────
-- Kept temporarily for already-deployed clients during rollout.
create or replace function verify_pin(p_username text, p_pin_hash text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where username = lower(trim(p_username))
      and pin_hash = p_pin_hash
  );
$$;

grant execute on function username_status(text) to anon, authenticated;
grant execute on function claim_username(text, text) to anon, authenticated;
grant execute on function verify_device(text, text) to anon, authenticated;
grant execute on function set_username_pin(text, text, text) to anon, authenticated;
grant execute on function verify_pin_and_register_device(text, text, text) to anon, authenticated;
grant execute on function verify_pin(text, text) to anon, authenticated;
