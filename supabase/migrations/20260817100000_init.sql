-- FreeTV schema, RLS, matching, and safety RPCs
-- Apply in the Supabase SQL editor (or: supabase db push)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  age_confirmed_at timestamptz,
  is_banned boolean not null default false,
  ban_reason text,
  report_count integer not null default 0,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.match_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('text', 'video')),
  interests text[] not null default '{}',
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  session_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists match_queue_one_waiting
  on public.match_queue (user_id)
  where status = 'waiting';

create index if not exists match_queue_lookup
  on public.match_queue (mode, status, created_at);

create index if not exists match_queue_interests
  on public.match_queue using gin (interests);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('text', 'video')),
  user_a uuid not null references public.profiles (id),
  user_b uuid not null references public.profiles (id),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  end_reason text check (end_reason in ('next', 'stop', 'disconnect', 'report', 'timeout')),
  check (user_a <> user_b)
);

create index if not exists chat_sessions_participants
  on public.chat_sessions (user_a, user_b);

create index if not exists chat_sessions_active
  on public.chat_sessions (status)
  where status = 'active';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_session_created
  on public.messages (session_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id),
  reporter_id uuid not null references public.profiles (id),
  reported_id uuid not null references public.profiles (id),
  reason text not null check (reason in (
    'harassment', 'sexual_content', 'spam', 'underage_suspicion', 'other'
  )),
  details text,
  created_at timestamptz not null default now(),
  unique (session_id, reporter_id)
);

create table if not exists public.bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_events_lookup
  on public.rate_events (user_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.sanitize_interests(p_interests text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(x), '{}'::text[])
  from (
    select distinct x
    from unnest(coalesce(p_interests, '{}'::text[])) as t(x)
    where x in (
      'music', 'movies', 'gaming', 'sports', 'tech',
      'art', 'travel', 'anime', 'fitness', 'food'
    )
    limit 5
  ) s;
$$;

create or replace function public.touch_rate(p_uid uuid, p_kind text, p_window interval, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n
  from public.rate_events
  where user_id = p_uid
    and kind = p_kind
    and created_at > now() - p_window;

  if n >= p_max then
    return false;
  end if;

  insert into public.rate_events (user_id, kind) values (p_uid, p_kind);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.confirm_age()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_banned boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (id) values (v_uid)
  on conflict (id) do nothing;

  select is_banned into v_banned from public.profiles where id = v_uid;
  if v_banned then
    return jsonb_build_object('error', 'banned');
  end if;

  update public.profiles
    set age_confirmed_at = coalesce(age_confirmed_at, now()),
        last_seen_at = now()
    where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  update public.profiles set last_seen_at = now() where id = v_uid;
end;
$$;

create or replace function public.online_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.profiles
  where last_seen_at > now() - interval '3 minutes'
    and is_banned = false;
$$;

create or replace function public.match_user(p_mode text, p_interests text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_partner public.match_queue%rowtype;
  v_session_id uuid;
  v_interests text[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_mode not in ('text', 'video') then
    raise exception 'invalid mode';
  end if;

  v_interests := public.sanitize_interests(p_interests);

  insert into public.profiles (id) values (v_uid)
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = v_uid;

  if v_profile.is_banned then
    return jsonb_build_object('error', 'banned', 'reason', v_profile.ban_reason);
  end if;

  if v_profile.age_confirmed_at is null then
    return jsonb_build_object('error', 'age_required');
  end if;

  if not public.touch_rate(v_uid, 'match', interval '2 seconds', 1) then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  perform pg_advisory_xact_lock(hashtext('freetv-user-' || v_uid::text));
  perform pg_advisory_xact_lock(hashtext('freetv-match-' || p_mode));

  update public.match_queue
    set status = 'cancelled'
    where status = 'waiting'
      and created_at < now() - interval '45 seconds';

  update public.match_queue
    set status = 'cancelled'
    where user_id = v_uid
      and status = 'waiting';

  select q.* into v_partner
  from public.match_queue q
  join public.profiles p on p.id = q.user_id
  where q.status = 'waiting'
    and q.mode = p_mode
    and q.user_id <> v_uid
    and p.is_banned = false
    and q.created_at > now() - interval '45 seconds'
  order by
    case
      when cardinality(v_interests) > 0 and q.interests && v_interests then 0
      else 1
    end,
    q.created_at asc
  limit 1
  for update of q skip locked;

  if found then
    v_session_id := gen_random_uuid();

    insert into public.chat_sessions (id, mode, user_a, user_b)
      values (v_session_id, p_mode, v_partner.user_id, v_uid);

    update public.match_queue
      set status = 'matched', session_id = v_session_id
      where id = v_partner.id;

    insert into public.match_queue (user_id, mode, interests, status, session_id)
      values (v_uid, p_mode, v_interests, 'matched', v_session_id);

    return jsonb_build_object(
      'status', 'matched',
      'sessionId', v_session_id,
      'peerId', v_partner.user_id,
      'role', 'callee'
    );
  end if;

  insert into public.match_queue (user_id, mode, interests, status)
    values (v_uid, p_mode, v_interests, 'waiting');

  return jsonb_build_object('status', 'waiting');
end;
$$;

create or replace function public.leave_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.match_queue
    set status = 'cancelled'
    where user_id = v_uid
      and status = 'waiting';

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.end_session(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sess public.chat_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_reason not in ('next', 'stop', 'disconnect', 'report', 'timeout') then
    raise exception 'invalid reason';
  end if;

  select * into v_sess
  from public.chat_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_sess.user_a <> v_uid and v_sess.user_b <> v_uid then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_sess.status = 'ended' then
    return jsonb_build_object('status', 'ended');
  end if;

  update public.chat_sessions
    set status = 'ended',
        ended_at = now(),
        ended_by = v_uid,
        end_reason = p_reason
    where id = p_session_id;

  update public.match_queue
    set status = 'cancelled'
    where session_id = p_session_id
      and status = 'matched';

  return jsonb_build_object('status', 'ended', 'endedBy', v_uid, 'reason', p_reason);
end;
$$;

create or replace function public.submit_report(
  p_session_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sess public.chat_sessions%rowtype;
  v_reported uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_reason not in ('harassment', 'sexual_content', 'spam', 'underage_suspicion', 'other') then
    raise exception 'invalid reason';
  end if;

  if not public.touch_rate(v_uid, 'report', interval '1 hour', 5) then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  select * into v_sess
  from public.chat_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_sess.user_a = v_uid then
    v_reported := v_sess.user_b;
  elsif v_sess.user_b = v_uid then
    v_reported := v_sess.user_a;
  else
    return jsonb_build_object('error', 'forbidden');
  end if;

  insert into public.reports (session_id, reporter_id, reported_id, reason, details)
    values (
      p_session_id,
      v_uid,
      v_reported,
      p_reason,
      nullif(left(trim(coalesce(p_details, '')), 500), '')
    )
  on conflict (session_id, reporter_id) do nothing;

  if v_sess.status = 'active' then
    update public.chat_sessions
      set status = 'ended',
          ended_at = now(),
          ended_by = v_uid,
          end_reason = 'report'
      where id = p_session_id;

    update public.match_queue
      set status = 'cancelled'
      where session_id = p_session_id
        and status = 'matched';
  end if;

  update public.profiles
    set report_count = report_count + 1
    where id = v_reported;

  select count(*) into v_count
  from public.reports
  where reported_id = v_reported
    and created_at > now() - interval '24 hours';

  if v_count >= 3 or p_reason = 'underage_suspicion' then
    update public.profiles
      set is_banned = true,
          ban_reason = case
            when p_reason = 'underage_suspicion' then 'Flagged for underage suspicion'
            else 'Multiple reports'
          end
      where id = v_reported;

    insert into public.bans (user_id, reason)
      values (
        v_reported,
        case
          when p_reason = 'underage_suspicion' then 'underage_suspicion'
          else 'report_threshold'
        end
      );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.purge_old_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.messages
  where created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.enforce_message_rate()
returns trigger
language plpgsql
as $$
declare
  n int;
begin
  select count(*) into n
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '10 seconds';

  if n >= 20 then
    raise exception 'rate_limited';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.match_queue enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.bans enable row level security;
alter table public.rate_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "queue_select_own" on public.match_queue;
create policy "queue_select_own"
  on public.match_queue for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sessions_select_participant" on public.chat_sessions;
create policy "sessions_select_participant"
  on public.chat_sessions for select
  to authenticated
  using (auth.uid() in (user_a, user_b));

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and auth.uid() in (s.user_a, s.user_b)
    )
  );

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and s.status = 'active'
        and auth.uid() in (s.user_a, s.user_b)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
revoke all on public.match_queue from anon, authenticated;
revoke all on public.chat_sessions from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.bans from anon, authenticated;
revoke all on public.rate_events from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.match_queue to authenticated;
grant select on public.chat_sessions to authenticated;
grant select, insert on public.messages to authenticated;

revoke all on function public.match_user(text, text[]) from public, anon;
revoke all on function public.leave_queue() from public, anon;
revoke all on function public.end_session(uuid, text) from public, anon;
revoke all on function public.submit_report(uuid, text, text) from public, anon;
revoke all on function public.confirm_age() from public, anon;
revoke all on function public.heartbeat() from public, anon;
revoke all on function public.online_count() from public, anon;
revoke all on function public.purge_old_messages() from public, anon;

grant execute on function public.match_user(text, text[]) to authenticated;
grant execute on function public.leave_queue() to authenticated;
grant execute on function public.end_session(uuid, text) to authenticated;
grant execute on function public.submit_report(uuid, text, text) to authenticated;
grant execute on function public.confirm_age() to authenticated;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.online_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.match_queue replica identity full;
alter table public.chat_sessions replica identity full;
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_queue'
  ) then
    execute 'alter publication supabase_realtime add table public.match_queue';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_sessions';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
