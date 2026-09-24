// Reusable scoring CLI: given a JSON array of {id, ref_html, gen_html},
// renders each pair (one shared browser, ref boxes cached per unique
// ref_html) and returns the same weighted score used everywhere else in
// this project (data.py's _weight_vector(), applied to the same 5 kept
// features from analysis/prefelic_refit/weights_final.csv). Exists so a
// script outside data_pipeline/ (e.g. a Python experiment) can get an
// exact, consistent score for arbitrary HTML without reimplementing
// extractBoxes/computeFeatures in another language.
//
//   node score_html_batch.mjs input.json output.json
//   input.json:  [{ "id": "...", "ref_html": "...", "gen_html": "..." }, ...]
//   output.json: [{ "id": "...", "score": 0.73, "k": 4, "n_ref": 5, "n_gen": 5,
//                    "f1_recall": ..., ... }, ...]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'
import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'
import { computeFeatures } from './features-compute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: node score_html_batch.mjs input.json output.json')
  process.exit(1)
}

function weightVector() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'analysis/features-final.json'), 'utf8'))
  const wLines = fs.readFileSync(path.join(REPO_ROOT, 'analysis/prefelic_refit/weights_final.csv'), 'utf8')
    .trim().split('\n')
  const wHeader = wLines[0].split(',')
  const wRows = wLines.slice(1).map((l) => {
    const cells = l.split(',')
    const row = {}
    wHeader.forEach((h, i) => { row[h] = cells[i] })
    return row
  })
  const coefByFeature = new Map(wRows.map((r) => [r.feature, Number(r.coef_raw)]))
  const geo = cfg.kept.filter((f) => coefByFeature.has(f))
  const wvec = geo.map((f) => coefByFeature.get(f))
  const maxScore = wvec.reduce((a, b) => a + b, 0)
  return { geo, wvec, maxScore }
}

const { geo, wvec, maxScore } = weightVector()

function scoreOf(f) {
  const dot = geo.reduce((s, feat, i) => s + f[feat] * wvec[i], 0)
  return dot / maxScore
}

const items = JSON.parse(fs.readFileSync(inPath, 'utf8'))

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport(VIEWPORT)

const refBoxesCache = new Map() // ref_html -> boxes
async function refBoxesFor(refHtml) {
  if (refBoxesCache.has(refHtml)) return refBoxesCache.get(refHtml)
  await page.setContent(refHtml || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes } = await extractRefBoxes(page)
  refBoxesCache.set(refHtml, boxes)
  return boxes
}

const results = []
let n = 0
for (const item of items) {
  const refBoxes = await refBoxesFor(item.ref_html)
  await page.setContent(item.gen_html || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes: genBoxes } = await extractBoxes(page)
  const f = computeFeatures(refBoxes, genBoxes)
  results.push({ id: item.id, score: scoreOf(f), k: f.k, n_ref: f.n_ref, n_gen: f.n_gen, ...f })
  n++
  console.log(`  …scored ${n}/${items.length} (${item.id})`)
}
await browser.close()

fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`Wrote ${results.length} scores → ${outPath}`)
