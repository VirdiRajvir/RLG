// ── Within-group pairing ─────────────────────────────────────────────────────
// Exhaustive C(5,2) = 10 pairs among the 5 turn-candidates, plus 1 gold pair
// (strongest real candidate vs the broken sentinel).

/**
 * @param referenceId    the group these candidates belong to
 * @param turnCandidates [{ id, turn }] — the 5 generations
 * @param goldCandidate  { id } — the gold-broken sentinel for this group
 * @returns rows ready for study_pairs
 */
export function buildPairs({ referenceId, turnCandidates, goldCandidate }) {
  const pairs = []

  // Stable identity: candidate_a is always the LOWER turn of the pair, so
  // choice 'a'/'b' is well-defined regardless of screen side (which the app
  // randomizes per trial and records in judgments.presented_left).
  const sorted = [...turnCandidates].sort((a, b) => a.turn - b.turn)

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push({
        reference_id: referenceId,
        candidate_a: sorted[i].id,
        candidate_b: sorted[j].id,
        is_gold: false,
      })
    }
  }

  // Gold pair: the strongest real candidate (last turn) vs the broken sentinel.
  // Pairing against a STRONG candidate keeps the check unambiguous — pairing the
  // sentinel against an early, also-rough turn would not be an obvious call.
  if (goldCandidate && sorted.length) {
    const strongest = sorted[sorted.length - 1]
    pairs.push({
      reference_id: referenceId,
      candidate_a: strongest.id,
      candidate_b: goldCandidate.id,
      is_gold: true,
    })
  }

  return pairs
}
