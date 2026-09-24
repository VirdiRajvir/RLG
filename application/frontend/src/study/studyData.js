// ── Binary Preference Study — data layer ──────────────────────────────────────
//
// Reads the seeded corpus from Supabase (public anon read) and turns it into the
// shuffled, position-randomized trial list a single rater judges. Each choice is
// mapped to an append-only judgments row by toJudgment().
//
//   loadStudy()                  → { references, candidates, pairs }   (anon read)
//   buildTrials(study, opts?)    → ordered, position-randomized trials
//   toJudgment(trial, side, ms, session) → one judgments record
//   loadPracticePair()           → { refHtml, left, right } | null     (tutorial only)

import { supabase } from '../lib/supabase'
import { loadFixtureStudy, isMockMode } from './studyFixture'

/**
 * loadStudy — public anon read of the stimuli. Only HTML + ids are fetched;
 * humans judge the rendered pages, not the stored boxes.
 *
 * In fixture mode (?mock=1) the local fixture corpus is returned instead, so the
 * frontend can be verified end-to-end before the backend ingest exists.
 */
export async function loadStudy() {
  if (isMockMode()) return loadFixtureStudy()
  const [refs, cands, pairs] = await Promise.all([
    supabase.from('study_references').select('id, html'),
    supabase.from('study_candidates').select('id, reference_id, html'),
    supabase.from('study_pairs').select('id, reference_id, candidate_a, candidate_b, is_gold').eq('is_practice', false),
  ])
  if (refs.error) throw refs.error
  if (cands.error) throw cands.error
  if (pairs.error) throw pairs.error
  return { references: refs.data || [], candidates: cands.data || [], pairs: pairs.data || [] }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * buildTrials — FULL OVERLAP: every rater judges EVERY pair. Each pair becomes a
 * trial whose reference is the Target and whose two candidates are A/B, with the
 * LEFT side randomized per trial (recorded as presented_left). Gold pairs are
 * interleaved by the same shuffle.
 *
 * Full overlap (rather than the old per-session sample) is deliberate: many
 * judgments per pair → empirical P(A≻B) per pair → inter-rater agreement → the
 * noise level τ that anchors the power simulation. The corpus is kept small
 * enough for this by selecting K candidates/reference upstream.
 *
 * `limit` is a debugging escape hatch only (e.g. a short manual pass); production
 * leaves it null so all pairs are served.
 *
 * candidateA/candidateB are the STABLE identities (from the pair); left/right are
 * just what the screen shows. choice is later resolved in identity terms.
 */
export function buildTrials({ references, candidates, pairs }, { limit = null } = {}) {
  const refHtml = new Map(references.map((r) => [r.id, r.html]))
  const cand = new Map(candidates.map((c) => [c.id, c]))

  const ordered = shuffle(pairs)
  const served = limit ? ordered.slice(0, limit) : ordered

  return served
    .map((p) => {
      const a = cand.get(p.candidate_a)
      const b = cand.get(p.candidate_b)
      if (!a || !b || !refHtml.has(p.reference_id)) return null // skip incomplete rows
      const candidateA = { id: a.id, html: a.html }
      const candidateB = { id: b.id, html: b.html }
      const aOnLeft = Math.random() < 0.5
      return {
        pairId: p.id,
        referenceId: p.reference_id,
        refHtml: refHtml.get(p.reference_id),
        candidateA,
        candidateB,
        left: aOnLeft ? candidateA : candidateB,
        right: aOnLeft ? candidateB : candidateA,
        isGold: !!p.is_gold,
      }
    })
    .filter(Boolean)
}

/**
 * toJudgment — map a click to the append-only judgments record.
 *
 * The subtlety: a click on 'left' is a vote for trial.left, which may be the
 * stable A or B depending on this trial's randomization — so we resolve identity
 * through the trial's left/right before emitting 'a' / 'b'.
 */
export function toJudgment(trial, side, responseMs, session) {
  let choice
  if (side === 'tie') {
    choice = 'tie'
  } else {
    const chosen = side === 'left' ? trial.left : trial.right
    choice = chosen.id === trial.candidateA.id ? 'a' : 'b'
  }
  return {
    pair_id: trial.pairId,
    reference_id: trial.referenceId,
    candidate_a: trial.candidateA.id,
    candidate_b: trial.candidateB.id,
    choice,
    presented_left: trial.left.id,
    response_ms: responseMs,
    rater_id: session.raterId || null,
    prolific_pid: session.prolificPid || null,
    prolific_study_id: session.prolificStudyId || null,
    prolific_session_id: session.prolificSessionId || null,
    session_id: session.sessionId,
    is_gold: trial.isGold,
  }
}

/**
 * loadPracticePair — the one is_practice=true pair, used only by the tutorial.
 * Returns null if it isn't seeded yet (or in fixture/?mock=1 mode, where no
 * practice pair exists locally) — TutorialTrial shows a spinner in that case
 * rather than crash, and the tutorial's own timeout still eventually resolves
 * the session even if this never loads (see Task 8).
 */
export async function loadPracticePair() {
  if (isMockMode()) return null
  const { data: pairRow, error: pairErr } = await supabase
    .from('study_pairs')
    .select('id, reference_id, candidate_a, candidate_b')
    .eq('is_practice', true)
    .limit(1)
    .maybeSingle()
  if (pairErr || !pairRow) return null

  const [{ data: ref }, { data: cands }] = await Promise.all([
    supabase.from('study_references').select('id, html').eq('id', pairRow.reference_id).maybeSingle(),
    supabase.from('study_candidates').select('id, html').in('id', [pairRow.candidate_a, pairRow.candidate_b]),
  ])
  if (!ref || !cands || cands.length < 2) return null

  const byId = new Map(cands.map((c) => [c.id, c]))
  const a = byId.get(pairRow.candidate_a)
  const b = byId.get(pairRow.candidate_b)
  if (!a || !b) return null

  return {
    refHtml: ref.html,
    left: { id: a.id, html: a.html },
    right: { id: b.id, html: b.html },
  }
}
