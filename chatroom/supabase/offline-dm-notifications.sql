-- ============================================================
-- CHATROOM.exe — offline DMs + optional email notifications
-- Run once in Supabase SQL Editor before deploying this branch.
-- ============================================================

alter table if exists dm_messages
  add column if not exists read_at timestamptz;

alter table users
  add column if not exists notification_email text,
  add column if not exists dm_email_notifications_enabled boolean not null default false;

create table if not exists dm_email_notification_state (
  username text primary key references users(username) on delete cascade,
  last_sent_at timestamptz
);

alter table dm_email_notification_state enable row level security;

-- No public policies: this table is only read/written by the server-side
-- service role used by /api/dm-notify.

-- ── Notification settings ─────────────────────────────────
create or replace function get_notification_settings(
  p_username text,
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
  v_email text;
  v_enabled boolean;
begin
  if length(p_device_token) < 32 then
    return null;
  end if;

  v_token_hash := encode(extensions.digest(p_device_token, 'sha256'), 'hex');

  if not exists (
    select 1
    from public.user_devices
    where username = v_username
      and device_token_hash = v_token_hash
  ) then
    return null;
  end if;

  select notification_email, dm_email_notifications_enabled
    into v_email, v_enabled
    from public.users
    where username = v_username;

  return jsonb_build_object(
    'email', coalesce(v_email, ''),
    'enabled', coalesce(v_enabled, false)
  );
end;
$$;

create or replace function set_notification_settings(
  p_username text,
  p_device_token text,
  p_email text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_token_hash text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if length(p_device_token) < 32 then
    return false;
  end if;

  if p_enabled and (
    v_email is null
    or length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
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
    set notification_email = v_email,
        dm_email_notifications_enabled = p_enabled,
        last_seen_at = now()
    where username = v_username;

  return found;
end;
$$;

-- ── Activity heartbeat ────────────────────────────────────
-- Claimed users ping this while CHATROOM.exe is open. The email endpoint
-- treats users as offline once this timestamp is more than ~2 minutes old.
create or replace function touch_user_activity(
  p_username text,
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
begin
  if length(p_device_token) < 32 then
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

  update public.user_devices
    set last_seen_at = now()
    where username = v_username
      and device_token_hash = v_token_hash;

  update public.users
    set last_seen_at = now()
    where username = v_username;

  return true;
end;
$$;

-- ── Read receipts for offline unread state ─────────────────
create or replace function mark_dm_read(
  p_username text,
  p_from_username text,
  p_device_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_from text := lower(trim(p_from_username));
  v_token_hash text;
begin
  if length(p_device_token) < 32 then
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

  update public.dm_messages
    set read_at = now()
    where to_username = v_username
      and from_username = v_from
      and deleted = false
      and read_at is null;

  update public.users
    set last_seen_at = now()
    where username = v_username;

  return true;
end;
$$;

revoke all on function get_notification_settings(text, text) from public;
revoke all on function set_notification_settings(text, text, text, boolean) from public;
revoke all on function touch_user_activity(text, text) from public;
revoke all on function mark_dm_read(text, text, text) from public;

grant execute on function get_notification_settings(text, text) to anon, authenticated;
grant execute on function set_notification_settings(text, text, text, boolean) to anon, authenticated;
grant execute on function touch_user_activity(text, text) to anon, authenticated;
grant execute on function mark_dm_read(text, text, text) to anon, authenticated;
