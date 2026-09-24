// application/frontend/src/explore/loadExploreData.js
import h2aJson from '../explore-data/h2a.json'
import a2aJson from '../explore-data/a2a.json'
import prefelicJson from '../explore-data/prefelic.json'
import referencesJson from '../explore-data/references.json'

export const h2aData = h2aJson
export const a2aData = a2aJson
export const prefelicData = prefelicJson
export const referencesData = referencesJson

const referenceIndex = new Map(referencesData.references.map((r) => [r.id, r]))

export function referenceById(id) {
  return referenceIndex.get(id) ?? null
}
