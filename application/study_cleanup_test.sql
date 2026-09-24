-- =============================================================================
-- Remove a TEST participant's data so it doesn't pollute the study.
-- Replace 'TEST_EMAIL_HERE' (appears 3×) with your test account's email, then run.
--
-- Deletes: their messages, their conversations, and their study_participants row.
-- Does NOT touch study_candidates/study_pairs (untouched by generation),
-- study_slots, or study_references.
-- =============================================================================

-- 1) Their messages (delete before conversations regardless of cascade settings)
delete from public.messages
where conversation_id in (
  select c.id
  from public.conversations c
  join auth.users u on u.id = c.user_id
  where u.email = 'TEST_EMAIL_HERE'
);

-- 2) Their conversations
delete from public.conversations
where user_id in (select id from auth.users where email = 'TEST_EMAIL_HERE');

-- 3) Their assignment / participant row (frees them from the study)
delete from public.study_participants
where user_id in (select id from auth.users where email = 'TEST_EMAIL_HERE');

-- 4) Reset the round-robin counter so the FIRST real participant gets slot 1.
--    Safe ONLY while no real participants have claimed yet (i.e. during testing).
alter sequence public.study_claim_seq restart with 1;

-- 5) (optional) sanity check — should now be 0 if the test account was the only one:
-- select count(*) as remaining_participants from public.study_participants;
