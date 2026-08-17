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
