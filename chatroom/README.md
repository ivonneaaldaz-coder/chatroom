# CHATROOM.exe

> A small corner of the internet for curious people.

Inspired by Yahoo Chat, AIM, MSN Messenger, IRC, and the weird little communities
that made the early internet feel human.

---

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Supabase** — Postgres + Realtime + Presence
- **No UI libraries** — pure retro CSS

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/chatroom-exe
cd chatroom-exe
npm install
```

### 2. Create `.env.local`

Copy the example file:

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials (see below).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Supabase Setup

### 1. Create a new project at supabase.com

Keep costs near zero — free tier handles this comfortably.

### 2. Run the schema

In your Supabase dashboard → **SQL Editor**, paste and run the contents of:

```
supabase/schema.sql
```

This creates:
- `messages` table with RLS policies
- Rate-limiting trigger (max 5 messages per user per 10 seconds)
- Indexes for fast queries

### 3. Enable Realtime

In Supabase dashboard:
- **Database → Replication**
- Find the `messages` table
- Toggle **Realtime** ON

### 4. Get your credentials

In Supabase dashboard → **Project Settings → API**:

- Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- Copy **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Moderation

All moderation runs client-side + database-level. No extra services needed.

| Feature | Where |
|---|---|
| Rate limiting | Client (in-memory) + DB trigger |
| Message length (500 chars max) | Client + RLS policy |
| Link blocking | Client regex |
| Profanity filter | Client word list |
| Message deletion | Supabase dashboard only |

### Deleting a message

Option A — Table Editor:
1. Go to **Table Editor → messages**
2. Find the row
3. Set `deleted = true`

Option B — SQL:
```sql
update messages set deleted = true where id = '<uuid>';
```

The message disappears from all connected clients immediately via realtime.

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create chatroom-exe --public --push
```

### 2. Connect to Vercel

- Go to [vercel.com](https://vercel.com)
- Import the `chatroom-exe` repository
- Add environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Deploy

### 3. Custom domain (later)

In Vercel → Project → Settings → Domains:
- Add `chat.ivonnealdaz.com`
- Add the DNS record in your domain registrar

---

## Future Backend Work

Things not built yet that will require backend when adding:

- **Persistent presence** — currently uses Supabase Presence (ephemeral). For "X users online" counters that survive page refresh, add a `presence` table.
- **Multiple live rooms** — schema already supports it. Just flip `live: true` in `types/index.ts` and update RLS room list.
- **Saved usernames / profiles** — will need auth (Supabase Auth is the natural next step, anonymous auth works without passwords).
- **AI bot personalities** — can be added as a Supabase Edge Function that listens to new messages and inserts bot responses.
- **Ask Eve integration** — same pattern, Edge Function calling the Anthropic API.
- **Moderation dashboard** — right now deletion is manual in Supabase. A simple `/admin` route protected by a secret env var would make this faster.

---

## Project Structure

```
chatroom-exe/
├── app/
│   ├── layout.tsx          # Root layout, loads retro CSS
│   ├── page.tsx            # Landing / boot screen
│   └── chat/
│       └── page.tsx        # Chat page (loads username → ChatWindow)
├── components/
│   ├── ChatWindow.tsx      # Main orchestrator — Supabase, realtime, presence
│   ├── MessageFeed.tsx     # Scrolling chat messages
│   ├── MessageInput.tsx    # Input bar with validation feedback
│   ├── RoomList.tsx        # Left sidebar — room list
│   └── UserList.tsx        # Right sidebar — online users
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── usernames.ts        # Username generator + sanitizer
│   ├── moderation.ts       # Rate limit, length, links, profanity
│   └── systemMessages.ts   # Automated atmospheric messages
├── styles/
│   └── retro.css           # Full retro design system
├── types/
│   └── index.ts            # Shared types + room definitions
├── supabase/
│   └── schema.sql          # DB setup — run once in Supabase SQL editor
└── .env.local.example
```
