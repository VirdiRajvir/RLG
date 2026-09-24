-- =============================================================================
-- Study schema — FINAL STATE, consolidated for the public release from the
-- original 11-file migration sequence:
--   study_schema.sql, study_generation_migration.sql, study_admin_dashboard.sql,
--   study_advance_fix.sql, study_extend_session.sql, study_phaseC_rls.sql,
--   study_prolific_migration.sql, study_prefelic_admin.sql,
--   study_prefelic_prolific_migration.sql,
--   study_prolific_test_reset_migration.sql, study_survey_migration.sql
--
-- RUN ORDER: apply this file BEFORE schema.sql — schema.sql's
-- conversations.reference_id is a foreign key into study_references, defined
-- here.
--
-- This is the schema as it stands after every migration, not a replay of
-- history: earlier, later-superseded pieces are omitted rather than shown
-- and then undone. Two things worth knowing that aren't obvious from reading
-- only the final state:
--   - get_assignment(), claim_assignment(), advance_session(), and
--     extend_session() existed in earlier migrations (auth.uid()-keyed) and
--     were DROPPED once the study moved to Prolific — they're replaced
--     entirely by prolific_claim_assignment() / prolific_get_state() /
--     prolific_advance_stage() below (prolific_pid-keyed) and intentionally
--     do not appear here.
--   - study_slots was originally seeded for 12 references / 8 slots / 3
--     refs-per-slot (h2a pilot); the Prolific migration deleted and reseeded
--     it for 10 references / 10 slots / 2 refs-per-slot. Only the final
--     10-slot schedule is included below.
--
-- Security model: study_references / study_candidates / study_pairs are
-- public-read (anon + authenticated), stimuli for an unauthenticated study.
-- judgments and survey_responses are write-only drop boxes (anon INSERT,
-- no SELECT policy at all — read via the admin_* / assert_admin()-gated RPCs,
-- or directly with the service role). study_slots and study_participants
-- have RLS enabled with NO policies at all — every access goes through the
-- SECURITY DEFINER functions below.
-- =============================================================================

-- ── 1. study_references ───────────────────────────────────────────────────────
create table public.study_references (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  html        text not null,
  boxes       jsonb,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  is_practice boolean not null default false  -- true only for 'apothecary' — the tutorial reference, excluded from the scored study pool
);

-- ── 2. study_candidates ───────────────────────────────────────────────────────
create table public.study_candidates (
  id                 uuid primary key default gen_random_uuid(),
  reference_id       uuid not null references public.study_references(id) on delete cascade,
  tier               text not null,
  html               text not null,
  boxes              jsonb,
  features           jsonb,
  is_gold_broken     boolean not null default false,
  source_message_id  uuid,
  meta               jsonb,
  created_at         timestamptz not null default now()
);
create index idx_study_candidates_reference on public.study_candidates(reference_id);

-- ── 3. study_pairs ─────────────────────────────────────────────────────────────
create table public.study_pairs (
  id            uuid primary key default gen_random_uuid(),
  reference_id  uuid not null references public.study_references(id) on delete cascade,
  candidate_a   uuid not null references public.study_candidates(id) on delete cascade,
  candidate_b   uuid not null references public.study_candidates(id) on delete cascade,
  is_gold       boolean not null default false,
  created_at    timestamptz not null default now(),
  is_practice   boolean not null default false,  -- true only for the single practice pair, seeded below
  constraint study_pairs_distinct check (candidate_a <> candidate_b),
  constraint study_pairs_unique unique (reference_id, candidate_a, candidate_b)
);
create index idx_study_pairs_reference on public.study_pairs(reference_id);

-- ── 4. judgments (append-only) ──────────────────────────────────────────────────
create table public.judgments (
  id                    uuid primary key default gen_random_uuid(),
  pair_id               uuid not null references public.study_pairs(id) on delete cascade,
  reference_id          uuid not null,
  candidate_a           uuid not null,
  candidate_b           uuid not null,
  choice                text not null check (choice in ('a', 'b', 'tie')),
  presented_left        uuid not null,
  response_ms           integer,
  rater_id              text,
  prolific_pid          text,
  session_id            uuid not null,
  is_gold               boolean not null default false,
  created_at            timestamptz not null default now(),
  prolific_study_id     text,
  prolific_session_id   text
);
create index idx_judgments_pair on public.judgments(pair_id);
create index idx_judgments_reference on public.judgments(reference_id);
create index idx_judgments_session on public.judgments(session_id);
create index idx_judgments_prolific on public.judgments(prolific_pid);

-- ── 5. study_slots — final 10-slot / 2-refs-per-slot schedule ──────────────────
create table public.study_slots (
  slot     int primary key,
  ref_ids  uuid[] not null,
  constraint study_slots_two_refs check (array_length(ref_ids, 1) = 2)
);

-- ── 6. study_participants — final shape (id-keyed, Prolific + legacy pilot) ────
create table public.study_participants (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid,  -- legacy pilot identity (nullable — Prolific rows use prolific_pid instead)
  claim_seq                     bigint not null,
  slot                          int not null,  -- no longer FK'd to study_slots (dropped in the Prolific resize; slot numbers stay valid data)
  current_session               int not null default 1,
  current_session_started_at    timestamptz not null default now(),
  started_at                    timestamptz not null default now(),
  completed_at                  timestamptz,
  prolific_pid                  text,
  study_id                      text,
  prolific_session_id           text,
  stage                         text check (stage is null or stage in ('instructions', 'tutorial', 'session', 'survey', 'done')),
  stage_started_at              timestamptz,
  stage_log                     jsonb not null default '[]'::jsonb,
  outcome                       text check (outcome is null or outcome in ('completed', 'partial')),
  is_test                       boolean not null default false,
  extend_used                   boolean not null default false,
  constraint study_participants_one_identity check ((user_id is not null) <> (prolific_pid is not null))
);
create unique index idx_study_participants_prolific_pid
  on public.study_participants (prolific_pid) where prolific_pid is not null;

create sequence public.study_claim_seq;

-- ── 7. survey_responses — one row per participant, write-only from the client ──
create table public.survey_responses (
  id                                 uuid primary key default gen_random_uuid(),
  prolific_pid                       text not null unique,
  strategy_description               text,
  strategy_change_across_sessions    text,
  correction_approach                text,
  used_box_container_labels          boolean,
  used_box_container_labels_detail   text,
  element_vs_goal_balance            smallint check (element_vs_goal_balance between 1 and 5),
  confidence_match                   smallint check (confidence_match between 1 and 5),
  created_at                         timestamptz not null default now()
);
create index idx_survey_responses_prolific on public.survey_responses(prolific_pid);

-- ── 8. Seed: the 10-slot cyclic schedule over the 10 non-practice references ───
-- Every reference appears in exactly 2 slots; no two slots share a pair.
-- Assumes study_references already holds >= 10 non-practice rows (the
-- 'apothecary' practice reference excluded) plus one row named 'apothecary'.
do $$
declare ref_count int;
begin
  if not exists (select 1 from public.study_references where is_practice) then
    raise exception 'No practice reference flagged — set is_practice = true on the apothecary row before seeding.';
  end if;
  select count(*) into ref_count from public.study_references where coalesce(is_practice, false) = false;
  if ref_count < 10 then
    raise exception 'Expected at least 10 non-practice rows in study_references, found %.', ref_count;
  end if;
end $$;

insert into public.study_slots (slot, ref_ids)
with refs as (
  select id, row_number() over (order by created_at, id) as idx
  from public.study_references
  where coalesce(is_practice, false) = false
  order by created_at, id
  limit 10
),
cyc(slot, a, b) as (
  values (1,1,2),(2,2,3),(3,3,4),(4,4,5),(5,5,6),
         (6,6,7),(7,7,8),(8,8,9),(9,9,10),(10,10,1)
)
select c.slot, array[ra.id, rb.id]
from cyc c
join refs ra on ra.idx = c.a
join refs rb on rb.idx = c.b
on conflict (slot) do nothing;

-- ── 9. Seed: the practice pair, against the apothecary practice reference ─────
-- Both candidates are apothecary's own reference markup, trimmed to a short
-- (3-box) and a tall (10-box) version — not a real generation, so it can
-- never accidentally overlap with the real scored corpus.
do $$
declare
  ref_id   uuid;
  short_id uuid;
  tall_id  uuid;
begin
  if exists (select 1 from public.study_pairs where is_practice = true) then
    return;
  end if;

  select id into ref_id from public.study_references where name = 'apothecary';
  if ref_id is null then
    raise exception 'apothecary reference not found — seed study_references first.';
  end if;

  insert into public.study_candidates (reference_id, tier, html, meta)
  values (
    ref_id, 'practice',
    $shorthtml$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Apothecary — Wireframe</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,serif;background:#f4f2ea;color:#8f8a7c}
  .page{max-width:1080px;margin:0 auto;min-height:860px;background:#f6f4ed;display:grid;grid-template-columns:220px 1fr}
  .b{background:#e7e4d8;border:1px solid #d6d2c2;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:10px;color:#a7a18d;letter-spacing:.04em;overflow:hidden}
  .b.torii{background:#b5573f;border:none;color:#f2cabd}
  .b.lotus{background:#d8cfe0;border:none;color:#9a8fa8}
  .b.tree{background:#dbe2d0;border:1px dashed #c4cdb6;color:#9aa888}
  .side{padding:30px 24px;display:flex;flex-direction:column;gap:14px}
  .main{padding:30px 40px 40px;display:flex;flex-direction:column;gap:22px}
  .toprow{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
  .sec{display:flex;flex-direction:column;gap:10px}
  .foot{display:flex;gap:12px;margin-top:14px}
</style>
</head>
<body>
<div class="page">
  <aside class="side">
    <div class="b" style="height:130px;width:90%">box-1</div>
    <div class="b lotus" style="height:130px;width:110px;margin-top:auto">box-2</div>
  </aside>
  <main class="main">
    <div class="toprow">
      <div class="b" style="height:24px;width:240px">box-3</div>
    </div>
  </main>
</div>
</body>
</html>$shorthtml$,
    jsonb_build_object('practice', true, 'height', 'short', 'source', 'apothecary reference, trimmed to first 3 boxes')
  )
  returning id into short_id;

  insert into public.study_candidates (reference_id, tier, html, meta)
  values (
    ref_id, 'practice',
    $tallhtml$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Apothecary — Wireframe</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,serif;background:#f4f2ea;color:#8f8a7c}
  .page{max-width:1080px;margin:0 auto;min-height:860px;background:#f6f4ed;display:grid;grid-template-columns:220px 1fr}
  .b{background:#e7e4d8;border:1px solid #d6d2c2;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:10px;color:#a7a18d;letter-spacing:.04em;overflow:hidden}
  .b.torii{background:#b5573f;border:none;color:#f2cabd}
  .b.lotus{background:#d8cfe0;border:none;color:#9a8fa8}
  .b.tree{background:#dbe2d0;border:1px dashed #c4cdb6;color:#9aa888}
  .side{padding:30px 24px;display:flex;flex-direction:column;gap:14px}
  .main{padding:30px 40px 40px;display:flex;flex-direction:column;gap:22px}
  .toprow{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
  .sec{display:flex;flex-direction:column;gap:10px}
  .foot{display:flex;gap:12px;margin-top:14px}
</style>
</head>
<body>
<div class="page">
  <aside class="side">
    <div class="b" style="height:130px;width:90%">box-1</div>
    <div class="b lotus" style="height:130px;width:110px;margin-top:auto">box-2</div>
  </aside>
  <main class="main">
    <div class="toprow">
      <div class="b" style="height:24px;width:240px">box-3</div>
      <div class="b torii" style="width:120px;height:80px;flex-shrink:0">box-4</div>
    </div>
    <div class="b" style="height:46px;width:78%">box-5</div>
    <div class="sec"><div class="b" style="height:22px;width:42%">box-6</div><div class="b" style="height:60px;width:84%">box-7</div><div class="b" style="height:48px;width:74%">box-8</div></div>
    <div class="sec"><div class="b" style="height:22px;width:34%">box-9</div><div class="b" style="height:54px;width:80%">box-10</div></div>
  </main>
</div>
</body>
</html>$tallhtml$,
    jsonb_build_object('practice', true, 'height', 'tall', 'source', 'apothecary reference, trimmed to first 10 boxes')
  )
  returning id into tall_id;

  insert into public.study_pairs (reference_id, candidate_a, candidate_b, is_gold, is_practice)
  values (ref_id, short_id, tall_id, false, true);
end $$;

-- ── 10. Row Level Security ──────────────────────────────────────────────────────
alter table public.study_references   enable row level security;
alter table public.study_candidates   enable row level security;
alter table public.study_pairs        enable row level security;
alter table public.judgments          enable row level security;
alter table public.study_slots        enable row level security;
alter table public.study_participants enable row level security;
alter table public.survey_responses   enable row level security;

create policy "anon reads references" on public.study_references
  for select to anon using (true);
create policy "authenticated reads references" on public.study_references
  for select to authenticated using (true);

create policy "anon reads candidates" on public.study_candidates
  for select to anon using (true);

create policy "anon reads pairs" on public.study_pairs
  for select to anon using (true);

-- Write-only drop box: anon INSERT only, no SELECT/UPDATE/DELETE policy at
-- all. The app must insert without chaining .select() (supabase-js
-- return=minimal), or PostgREST needs a SELECT policy we deliberately don't
-- grant. Reading judgment progress goes through admin_prefelic_progress()
-- (SECURITY DEFINER) instead.
create policy "anon inserts judgments" on public.judgments
  for insert to anon with check (true);

create policy survey_responses_insert on public.survey_responses
  for insert to anon with check (true);

-- study_slots / study_participants: RLS enabled, NO policies — every access
-- goes through the SECURITY DEFINER functions below.

-- ── 11. Functions — final versions only ─────────────────────────────────────────

-- Admin guard: raises unless the caller's verified JWT email is the researcher account.
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'rajvirsinghvirdi1@gmail.com' then
    raise exception 'Not authorized';
  end if;
end $$;
revoke all on function public.assert_admin() from public;

-- Admin dashboard: top-line counts, counting both legacy user_id-keyed pilot
-- rows and Prolific prolific_pid-keyed rows.
create or replace function public.admin_overview()
returns table (
  references_total         int,
  participants_total       int,
  participants_prolific    int,
  participants_completed   int,
  participants_in_progress int,
  sessions_total            int,
  generations_total        int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select
    (select count(*)::int from study_references where coalesce(is_practice, false) = false),
    (select count(*)::int from study_participants),
    (select count(*)::int from study_participants where prolific_pid is not null),
    (select count(*)::int from study_participants
       where (user_id is not null and completed_at is not null)
          or (prolific_pid is not null and outcome = 'completed')),
    (select count(*)::int from study_participants
       where (user_id is not null and completed_at is null)
          or (prolific_pid is not null and outcome is null)),
    (select count(*)::int from conversations c
       where c.reference_id is not null
         and coalesce(c.is_tutorial, false) = false
         and (
           c.user_id in (select user_id from study_participants where user_id is not null)
           or c.prolific_pid in (select prolific_pid from study_participants where prolific_pid is not null)
         )),
    (select count(*)::int from messages m
       join conversations c on c.id = m.conversation_id
       where m.role = 'assistant'
         and c.reference_id is not null
         and coalesce(c.is_tutorial, false) = false
         and (
           c.user_id in (select user_id from study_participants where user_id is not null)
           or c.prolific_pid in (select prolific_pid from study_participants where prolific_pid is not null)
         ));
end $$;
revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;

-- Admin dashboard: per-reference breakdown, excluding the practice reference.
create or replace function public.admin_reference_stats()
returns table (
  reference_id uuid,
  name         text,
  generators   int,
  sessions     int,
  generations  int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select r.id, r.name,
    (select count(distinct coalesce(c.user_id::text, c.prolific_pid))::int from conversations c
       where c.reference_id = r.id
         and (c.user_id in (select user_id from study_participants where user_id is not null)
              or c.prolific_pid in (select prolific_pid from study_participants where prolific_pid is not null))),
    (select count(*)::int from conversations c
       where c.reference_id = r.id
         and (c.user_id in (select user_id from study_participants where user_id is not null)
              or c.prolific_pid in (select prolific_pid from study_participants where prolific_pid is not null))),
    (select count(*)::int from messages m
       join conversations c on c.id = m.conversation_id
       where c.reference_id = r.id and m.role = 'assistant'
         and (c.user_id in (select user_id from study_participants where user_id is not null)
              or c.prolific_pid in (select prolific_pid from study_participants where prolific_pid is not null)))
  from study_references r
  where coalesce(r.is_practice, false) = false
  order by r.name;
end $$;
revoke all on function public.admin_reference_stats() from public;
grant execute on function public.admin_reference_stats() to authenticated;

-- Admin dashboard: full conversation drill-down for one reference.
create or replace function public.admin_reference_conversations(p_reference_id uuid)
returns table (
  conversation_id         uuid,
  user_id                 uuid,
  prolific_pid            text,
  conversation_created_at timestamptz,
  turn                    int,
  role                    text,
  content                 text,
  message_created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select c.id, c.user_id, c.prolific_pid, c.created_at, m.turn, m.role, m.content, m.created_at
  from conversations c
  join messages m on m.conversation_id = c.id
  where c.reference_id = p_reference_id
    and (c.user_id in (select sp.user_id from study_participants sp where sp.user_id is not null)
         or c.prolific_pid in (select sp.prolific_pid from study_participants sp where sp.prolific_pid is not null))
  order by c.created_at, c.id, m.created_at;
end $$;
revoke all on function public.admin_reference_conversations(uuid) from public;
grant execute on function public.admin_reference_conversations(uuid) to authenticated;

-- Admin dashboard: Participants tab — one row per Prolific participant.
create or replace function public.admin_participants()
returns table (
  prolific_pid                text,
  study_id                    text,
  is_test                     boolean,
  outcome                     text,
  stage                       text,
  current_session             int,
  stage_started_at            timestamptz,
  current_session_started_at  timestamptz,
  extend_used                 boolean,
  stage_log                   jsonb,
  claimed_at                  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select sp.prolific_pid, sp.study_id, sp.is_test, sp.outcome, sp.stage, sp.current_session,
         sp.stage_started_at, sp.current_session_started_at, sp.extend_used,
         sp.stage_log, sp.started_at
  from public.study_participants sp
  where sp.prolific_pid is not null
  order by sp.started_at desc;
end $$;
revoke all on function public.admin_participants() from public;
grant execute on function public.admin_participants() to authenticated;

-- Admin dashboard: /prefelic/admin — judgment progress per rater (judgments has no SELECT policy).
create or replace function public.admin_prefelic_progress()
returns table (
  prolific_pid       text,
  prolific_study_id  text,
  judgment_count     int,
  first_at           timestamptz,
  last_at            timestamptz,
  avg_response_ms    numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select j.prolific_pid,
    (array_agg(j.prolific_study_id order by j.created_at desc))[1],
    count(*)::int,
    min(j.created_at),
    max(j.created_at),
    round(avg(j.response_ms), 0)
  from judgments j
  where j.prolific_pid is not null
  group by j.prolific_pid
  order by max(j.created_at) desc;
end $$;
revoke all on function public.admin_prefelic_progress() from public;
grant execute on function public.admin_prefelic_progress() to authenticated;

-- h2a round-robin: claim a slot (idempotent), keyed on prolific_pid.
create or replace function public.prolific_claim_assignment(
  p_prolific_pid text, p_study_id text, p_session_id text, p_is_test boolean default false
)
returns table (
  slot                       int,
  ref_ids                    uuid[],
  stage                      text,
  stage_started_at           timestamptz,
  current_session            int,
  current_session_started_at timestamptz,
  is_test                    boolean,
  extend_used                boolean,
  outcome                    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  p           public.study_participants;
  seq         bigint;
  chosen_slot int;
begin
  perform pg_advisory_xact_lock(hashtext(p_prolific_pid));

  select * into p from public.study_participants where prolific_pid = p_prolific_pid;

  if not found then
    seq := nextval('public.study_claim_seq');
    chosen_slot := ((seq - 1) % 10) + 1;
    insert into public.study_participants
      (prolific_pid, study_id, prolific_session_id, is_test, claim_seq, slot,
       stage, stage_started_at, stage_log,
       current_session, current_session_started_at, started_at)
    values (
      p_prolific_pid, p_study_id, p_session_id, p_is_test, seq, chosen_slot,
      'instructions', now(),
      jsonb_build_array(jsonb_build_object('stage', 'instructions', 'entered_at', now())),
      1, now(), now()
    );
    select * into p from public.study_participants where prolific_pid = p_prolific_pid;
  end if;

  return query
    select sl.slot, sl.ref_ids, p.stage, p.stage_started_at, p.current_session, p.current_session_started_at,
           p.is_test, p.extend_used, p.outcome
    from public.study_slots sl
    where sl.slot = p.slot;
end $$;
revoke all on function public.prolific_claim_assignment(text,text,text,boolean) from public;
grant execute on function public.prolific_claim_assignment(text,text,text,boolean) to service_role;

-- h2a round-robin: read current state, no side effects.
create or replace function public.prolific_get_state(p_prolific_pid text)
returns table (
  stage                      text,
  stage_started_at           timestamptz,
  current_session            int,
  current_session_started_at timestamptz,
  outcome                    text,
  slot                       int,
  ref_ids                    uuid[],
  is_test                    boolean,
  extend_used                boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare p public.study_participants;
begin
  select * into p from public.study_participants where prolific_pid = p_prolific_pid;
  if not found then return; end if;
  return query
    select p.stage, p.stage_started_at, p.current_session, p.current_session_started_at, p.outcome,
           sl.slot, sl.ref_ids, p.is_test, p.extend_used
    from public.study_slots sl where sl.slot = p.slot;
end $$;
revoke all on function public.prolific_get_state(text) from public;
grant execute on function public.prolific_get_state(text) to service_role;

-- h2a round-robin: advance stage (instructions -> tutorial -> session x2 ->
-- survey -> done), handle per-session extend, and force-outcome on timeout.
-- FINAL version (from study_survey_migration.sql) — includes the survey stage.
create or replace function public.prolific_advance_stage(
  p_prolific_pid text,
  p_extend boolean default false,
  p_force_outcome text default null  -- 'partial' on timeout; null = normal forward progression
)
returns table (
  stage                      text,
  stage_started_at           timestamptz,
  current_session            int,
  current_session_started_at timestamptz,
  outcome                    text,
  is_test                    boolean,
  extend_used                boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare p public.study_participants;
begin
  perform pg_advisory_xact_lock(hashtext(p_prolific_pid));
  select * into p from public.study_participants where prolific_pid = p_prolific_pid for update;
  if not found then raise exception 'No assignment for this prolific_pid'; end if;

  if p.outcome is not null then
    return query select p.stage, p.stage_started_at, p.current_session, p.current_session_started_at, p.outcome, p.is_test, p.extend_used;
    return;
  end if;

  if p_force_outcome is not null then
    update public.study_participants
       set stage = 'done', outcome = p_force_outcome, completed_at = now(),
           stage_log = stage_log || jsonb_build_object('stage', 'done', 'entered_at', now(), 'outcome', p_force_outcome)
     where prolific_pid = p_prolific_pid
     returning * into p;
    return query select p.stage, p.stage_started_at, p.current_session, p.current_session_started_at, p.outcome, p.is_test, p.extend_used;
    return;
  end if;

  if p_extend then
    if p.extend_used then raise exception 'Extend already used for this session'; end if;
    if p.stage <> 'session' then raise exception 'Extend only valid during a real session'; end if;
    update public.study_participants
       set current_session_started_at = now(), extend_used = true
     where prolific_pid = p_prolific_pid
     returning * into p;
    return query select p.stage, p.stage_started_at, p.current_session, p.current_session_started_at, p.outcome, p.is_test, p.extend_used;
    return;
  end if;

  if p.stage = 'instructions' then
    update public.study_participants
       set stage = 'tutorial', stage_started_at = now(),
           stage_log = stage_log || jsonb_build_object('stage', 'tutorial', 'entered_at', now())
     where prolific_pid = p_prolific_pid returning * into p;

  elsif p.stage = 'tutorial' then
    update public.study_participants
       set stage = 'session', stage_started_at = now(),
           current_session = 1, current_session_started_at = now(),
           extend_used = false,
           stage_log = stage_log || jsonb_build_object('stage', 'session_1', 'entered_at', now())
     where prolific_pid = p_prolific_pid returning * into p;

  elsif p.stage = 'session' and p.current_session < 2 then
    update public.study_participants sp
       set current_session = sp.current_session + 1,
           current_session_started_at = now(),
           extend_used = false,
           stage_log = sp.stage_log || jsonb_build_object('stage', 'session_' || (sp.current_session + 1), 'entered_at', now())
     where sp.prolific_pid = p_prolific_pid returning * into p;

  elsif p.stage = 'session' then
    -- Last session just finished: one more stop (survey) before done.
    update public.study_participants
       set stage = 'survey', stage_started_at = now(),
           stage_log = stage_log || jsonb_build_object('stage', 'survey', 'entered_at', now())
     where prolific_pid = p_prolific_pid returning * into p;

  else
    -- stage = 'survey' (submitted or timed out).
    update public.study_participants
       set stage = 'done', outcome = 'completed', completed_at = now(),
           stage_log = stage_log || jsonb_build_object('stage', 'done', 'entered_at', now(), 'outcome', 'completed')
     where prolific_pid = p_prolific_pid returning * into p;
  end if;

  return query select p.stage, p.stage_started_at, p.current_session, p.current_session_started_at, p.outcome, p.is_test, p.extend_used;
end $$;
revoke all on function public.prolific_advance_stage(text,boolean,text) from public;
grant execute on function public.prolific_advance_stage(text,boolean,text) to service_role;

-- Test-mode-only: lets a is_test=true participant reset their own row.
create or replace function public.prolific_test_reset(p_prolific_pid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.study_participants
   where prolific_pid = p_prolific_pid
     and is_test = true;
end $$;
revoke all on function public.prolific_test_reset(text) from public;
grant execute on function public.prolific_test_reset(text) to service_role;
