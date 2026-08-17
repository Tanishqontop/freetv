# FreeTV

Random stranger **text** and **video** chat. React + Vite + Supabase. 18+ only.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

```bash
npm run dev
```

Open two browser windows to test matching.

## Supabase (required)

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Authentication → Providers → Anonymous** — turn **Anonymous sign-ins** on.
3. **Authentication → URL configuration** — add `http://localhost:5173`.
4. **SQL Editor** — paste and run `supabase/migrations/20260817100000_init.sql`.
5. **Project Settings → API** — copy Project URL and `anon` `public` key into `.env.local`.
6. Restart `npm run dev`.

Matching, reports, and bans run as Postgres functions (`match_user`, `leave_queue`, `end_session`, `submit_report`). You do not need Edge Functions for v1.

### Optional: purge old text messages

Text is kept 24 hours for abuse review. In **Database → Extensions**, enable `pg_cron` if available, then:

```sql
select cron.schedule(
  'freetv-purge-messages',
  '15 * * * *',
  $$select public.purge_old_messages();$$
);
```

Or run `select public.purge_old_messages();` manually.

### Ban a user

```sql
update public.profiles
set is_banned = true, ban_reason = 'manual'
where id = 'USER_UUID';
```

## Video across different networks

Same Wi‑Fi / localhost works with public STUN. Different networks usually need TURN:

```
VITE_TURN_URL=turn:your-turn-host:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

## Deploy

Static Vite app (Vercel / Netlify / Cloudflare Pages).

- Build command: `npm run build`
- Output: `dist`
- Add the same `VITE_*` env vars in the host
- Add the production URL to Supabase Auth redirect URLs

## Safety

- Age gate is stored on the profile; `/chat` and `/video` redirect home without it
- Report → disconnect; 3 reports / 24h auto-bans; `underage_suspicion` bans immediately
- No video/audio recording
- Rate limits: match every 2s, 20 messages / 10s, 5 reports / hour
