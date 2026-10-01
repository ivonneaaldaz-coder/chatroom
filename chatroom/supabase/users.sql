-- ============================================================
-- CHATROOM.exe — lightweight username identity
-- Run this in the Supabase SQL Editor before deploying this branch.
--
-- Model:
--   • browser device token = automatic recognition on that browser
--   • optional user-created 6-digit PIN = portability to other devices
--   • a username can remember more than one browser/device
--   • raw device tokens and raw PINs are never stored in Postgres
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Existing installs already have this table. Upgrade it in place without
-- deleting usernames or old 6-digit PIN hashes.
create table if not exists users (
  username     text primary key,
  pin_hash     text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table users alter column pin_hash drop not null;
alter table users enable row level security;

-- One claimed username can be remembered by multiple browsers/devices.
create table if not exists user_devices (
  username          text not null references users(username) on delete cascade,
  device_token_hash text not null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  primary key (username, device_token_hash)
);

alter table user_devices enable row level security;

-- Failed PIN attempts. A tiny public chatroom does not need a full auth
-- service, but short numeric PINs do need server-side throttling.
create table if not exists pin_auth_attempts (
  username       text primary key,
  window_started timestamptz not null default now(),
  attempts       integer not null default 0
);

alter table pin_auth_attempts enable row level security;

-- Identity reads/writes happen through security-definer RPCs below.
-- The old direct-table policies are removed in the final deployed state
-- so credential hashes cannot be read from the public API.
drop policy if exists "Check username availability" on users;
drop policy if exists "Claim username" on users;
drop policy if exists "Update last seen" on users;

-- ── Username status ────────────────────────────────────────
create or replace function username_status(p_username text)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'claimed', exists(
      select 1 from public.users where username = lower(trim(p_username))
    ),
    'has_pin', coalesce((
      select pin_hash is not null
      from public.users
      where username = lower(trim(p_username))
    ), false)
  );
$$;

-- ── Claim an available username ────────────────────────────
create or replace function claim_username(p_username text, p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
begin
  if length(v_username) < 2
     or length(v_username) > 30
     or v_username !~ '^[a-z0-9_-]+$'
     or length(p_device_token) < 32 then
    return false;
  end if;

  v_token_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

  insert into public.users (username, pin_hash)
  values (v_username, null)
  on conflict (username) do nothing;

  if not found then
    return false;
  end if;

  insert into public.user_devices (username, device_token_hash)
  values (v_username, v_token_hash)
  on conflict do nothing;

  return true;
end;
$$;

-- ── Recognize a saved browser ──────────────────────────────
create or replace function verify_device(p_username text, p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
begin
  if length(p_device_token) < 32 then
    return false;
  end if;

  v_token_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

  update public.user_devices
    set last_seen_at = now()
    where username = v_username
      and device_token_hash = v_token_hash;

  if not found then
    return false;
  end if;

  update public.users
    set last_seen_at = now()
    where username = v_username;

  return true;
end;
$$;

-- ── Create or change your optional PIN ─────────────────────
-- Only a browser already registered to the username can set/change it.
create or replace function set_username_pin(
  p_username text,
  p_device_token text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
begin
  if p_pin !~ '^[0-9]{6}$' or length(p_device_token) < 32 then
    return false;
  end if;

  v_token_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

  if not exists (
    select 1
    from public.user_devices
    where username = v_username
      and device_token_hash = v_token_hash
  ) then
    return false;
  end if;

  update public.users
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
        last_seen_at = now()
    where username = v_username;

  return found;
end;
$$;

-- ── Sign in on another browser/device with PIN ─────────────
-- Successful sign-in ADDS that browser rather than replacing older ones.
-- Existing accounts whose PIN was stored with the original client-side
-- SHA-256 scheme still work and are transparently upgraded to bcrypt.
create or replace function verify_pin_and_register_device(
  p_username text,
  p_pin text,
  p_device_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
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
    from public.pin_auth_attempts
    where username = v_username;

  if found and v_window > now() - interval '10 minutes' and v_attempts >= 20 then
    return false;
  end if;

  if found and v_window <= now() - interval '10 minutes' then
    delete from public.pin_auth_attempts where username = v_username;
  end if;

  select pin_hash
    into v_hash
    from public.users
    where username = v_username;

  if v_hash is not null then
    if v_hash like '$2%' then
      v_ok := extensions.crypt(p_pin, v_hash) = v_hash;
    else
      -- Legacy 6-digit PIN hash from the original app.
      v_ok := encode(
        extensions.digest(p_pin || 'chatroom-exe-salt', 'sha256'),
        'hex'
      ) = v_hash;
    end if;
  end if;

  if v_ok then
    v_token_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

    insert into public.user_devices (username, device_token_hash)
    values (v_username, v_token_hash)
    on conflict (username, device_token_hash)
    do update set last_seen_at = now();

    update public.users
      set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
          last_seen_at = now()
      where username = v_username;

    delete from public.pin_auth_attempts where username = v_username;
    return true;
  end if;

  insert into public.pin_auth_attempts (username, window_started, attempts)
  values (v_username, now(), 1)
  on conflict (username) do update
    set attempts = case
          when public.pin_auth_attempts.window_started <= now() - interval '10 minutes' then 1
          else public.pin_auth_attempts.attempts + 1
        end,
        window_started = case
          when public.pin_auth_attempts.window_started <= now() - interval '10 minutes' then now()
          else public.pin_auth_attempts.window_started
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
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.users
    where username = lower(trim(p_username))
      and pin_hash = p_pin_hash
  );
$$;

-- Restrict defaults, then explicitly expose only these small RPC surfaces.
revoke all on function username_status(text) from public;
revoke all on function claim_username(text, text) from public;
revoke all on function verify_device(text, text) from public;
revoke all on function set_username_pin(text, text, text) from public;
revoke all on function verify_pin_and_register_device(text, text, text) from public;
revoke all on function verify_pin(text, text) from public;

grant execute on function username_status(text) to anon, authenticated;
grant execute on function claim_username(text, text) to anon, authenticated;
grant execute on function verify_device(text, text) to anon, authenticated;
grant execute on function set_username_pin(text, text, text) to anon, authenticated;
grant execute on function verify_pin_and_register_device(text, text, text) to anon, authenticated;
grant execute on function verify_pin(text, text) to anon, authenticated;
