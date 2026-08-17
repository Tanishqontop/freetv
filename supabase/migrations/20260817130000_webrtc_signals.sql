-- Reliable WebRTC signaling + ignore abandoned queue waiters.

create table if not exists public.webrtc_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists webrtc_signals_session_created
  on public.webrtc_signals (session_id, created_at);

alter table public.webrtc_signals enable row level security;
alter table public.webrtc_signals replica identity full;

drop policy if exists "webrtc_select_participant" on public.webrtc_signals;
create policy "webrtc_select_participant"
  on public.webrtc_signals for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and auth.uid() in (s.user_a, s.user_b)
    )
  );

grant select on public.webrtc_signals to authenticated;

create or replace function public.send_webrtc_signal(p_session_id uuid, p_event text, p_payload jsonb)
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

  if p_event not in ('ready', 'offer', 'answer', 'ice', 'hangup') then
    return;
  end if;

  if not exists (
    select 1 from public.chat_sessions s
    where s.id = p_session_id
      and s.status = 'active'
      and v_uid in (s.user_a, s.user_b)
  ) then
    return;
  end if;

  if p_event in ('ready', 'offer', 'answer') then
    delete from public.webrtc_signals
    where session_id = p_session_id
      and sender_id = v_uid
      and event = p_event;
  end if;

  delete from public.webrtc_signals
  where created_at < now() - interval '10 minutes';

  insert into public.webrtc_signals (session_id, sender_id, event, payload)
  values (p_session_id, v_uid, p_event, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.send_webrtc_signal(uuid, text, jsonb) from public, anon;
grant execute on function public.send_webrtc_signal(uuid, text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'webrtc_signals'
  ) then
    execute 'alter publication supabase_realtime add table public.webrtc_signals';
  end if;
end $$;

-- Allow Realtime broadcast/presence if authorization is on.
do $$
begin
  begin
    execute 'drop policy if exists realtime_select_authenticated on realtime.messages';
    execute 'create policy realtime_select_authenticated on realtime.messages for select to authenticated using (true)';
    execute 'drop policy if exists realtime_insert_authenticated on realtime.messages';
    execute 'create policy realtime_insert_authenticated on realtime.messages for insert to authenticated with check (true)';
  exception
    when others then
      null;
  end;
end $$;

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

  update public.chat_sessions
    set status = 'ended', ended_at = now(), end_reason = 'timeout'
    where status = 'active'
      and started_at < now() - interval '3 minutes';

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

update public.match_queue
  set status = 'cancelled'
  where status = 'waiting';

update public.chat_sessions
  set status = 'ended', ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, 'timeout')
  where status = 'active';
