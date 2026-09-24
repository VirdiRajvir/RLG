-- =============================================================================
-- Chat app schema — FINAL STATE, consolidated from the original schema.sql +
-- schema_migration.sql (requirements: text[] -> jsonb) for the public release.
-- Run in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- RUN ORDER: apply study_schema.sql FIRST. conversations.reference_id below
-- is a foreign key into study_references, so that table must already exist.
--
-- NOTE on modification_reason / requirements (messages table): these two
-- columns are read and written throughout application/api/chat.js, but their
-- ADD COLUMN statement does not exist in any tracked migration file in this
-- repo — they were evidently added directly via the Supabase dashboard at
-- some point without being saved to a file. The definitions below are
-- reconstructed from how the application code actually uses them (nullable
-- text; jsonb array defaulting to '[]', mirroring conversations.requirements
-- whose type IS confirmed by the original schema_migration.sql), not copied
-- from a verified migration. If you're reproducing this schema from scratch,
-- double-check these two against your own data before relying on them.
-- =============================================================================

-- 1. conversations ------------------------------------------------------------
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,  -- nullable: Prolific participants have no Supabase Auth session
  created_at timestamptz default now(),
  requirements jsonb default '[]'::jsonb,  -- [{text, satisfied}], VLM-extracted requirements snapshot
  reference_id uuid references public.study_references(id),  -- binds a generation session to its study target (h2a)
  prolific_pid text,                                          -- set instead of user_id for Prolific sessions
  is_tutorial boolean not null default false                  -- practice-round conversations, excluded from the real corpus
);

-- 2. messages -------------------------------------------------------------------
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  turn integer,
  created_at timestamptz default now(),
  modification_reason text,                -- see NOTE above — reconstructed, not verified
  requirements jsonb default '[]'::jsonb   -- see NOTE above — reconstructed, not verified
);

-- 3. Indexes --------------------------------------------------------------------
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_conversations_user_id on public.conversations(user_id);

-- 4. Row Level Security -----------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Final policies only. The original insert/delete policies (both tables) were
-- dropped by the Prolific migration and deliberately not restored: every
-- write now goes through api/chat.js on the service-role key, which bypasses
-- RLS. What's left is SELECT-only, scoped to auth.uid() = user_id, so the
-- admin's own signed-in browser session can still read its own history —
-- Prolific participants have no auth.uid() at all, so this grants them
-- nothing.
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can view messages in own conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations
      where id = conversation_id and user_id = auth.uid()
    )
  );
