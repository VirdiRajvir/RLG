// application/api/_verify-extraction.js
//
// Ad hoc Puppeteer verification for extractBoxes/extractRefBoxes's leaf-only
// lenient matching (Task 2) and, once Task 3 lands, container-N detection +
// childLabels. Not a formal test suite — page.evaluate() callbacks can't be
// unit-tested directly; see _lib/labelMatch.js / labelMatch.test.js for the
// part of this logic that CAN be, and is, unit-tested.
//   node application/api/_verify-extraction.js
import puppeteer from 'puppeteer'
import { extractBoxes } from './evaluation.js'

const FIXTURE = `<!doctype html><html><body>
  <div id="outer" style="position:relative;">
    <span style="position:absolute;top:4px;right:4px;">Container 1</span>
    <div style="width:100px;height:50px;">box1</div>
    <div id="inner" style="position:relative;width:200px;height:150px;">
      <span style="position:absolute;top:2px;right:2px;">container-2</span>
      <div style="width:40px;height:20px;">box-2</div>
      <div style="width:40px;height:20px;">box-3</div>
    </div>
  </div>
  <div style="width:60px;height:30px;">box-4</div>
</body></html>`

let pass = 0, fail = 0
function check(name, cond) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (cond) pass++; else fail++
}

const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.setContent(FIXTURE)
const { boxes } = await extractBoxes(page)
await browser.close()

const byLabel = Object.fromEntries(boxes.map((b) => [b.label, b]))

console.log('[lenient/normalized matching]')
check('finds "Container 1" as container-1 (normalized)', !!byLabel['container-1'])
check('finds "box1" as box-1 (normalized, no separator)', !!byLabel['box-1'])
check('finds exactly 6 boxes total (2 containers + 4 leaves)', boxes.length === 6)

console.log('\n[container geometry — parent rect, not tag rect]')
check('container-1 geometry is #outer (wide), not the tiny corner tag', (byLabel['container-1']?.w || 0) > 150)
check('container-2 geometry is #inner (~200 wide)', Math.abs((byLabel['container-2']?.w || 0) - 200) < 5)

console.log('\n[childLabels — transitive DOM containment]')
const c1 = byLabel['container-1']?.childLabels || []
const c2 = byLabel['container-2']?.childLabels || []
check('container-1 includes its direct child box-1', c1.includes('box-1'))
check('container-1 includes nested container-2 (transitive)', c1.includes('container-2'))
check('container-1 includes container-2\'s grandchildren box-2, box-3 (transitive)', c1.includes('box-2') && c1.includes('box-3'))
check('container-1 does NOT include box-4 (outside #outer)', !c1.includes('box-4'))
check('container-2 includes only box-2, box-3 — not box-1, not box-4', c2.includes('box-2') && c2.includes('box-3') && !c2.includes('box-1') && !c2.includes('box-4'))
check('leaf boxes carry childLabels: [] (always an array)', Array.isArray(byLabel['box-1']?.childLabels) && byLabel['box-1'].childLabels.length === 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
