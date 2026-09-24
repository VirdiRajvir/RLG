// Build a self-contained review page for the FULL /prefelic candidate pool
// (every qualifying generation across the whole corpus, not just the K-selected
// subset that made it into study_candidates/study_pairs): same simple
// two-panel carousel as review.js (reference pinned left, one generation at a
// time on the right, ↑/↓ switches reference, ←/→ steps through that
// reference's generations) — plus a "remove" checkbox per generation that
// accumulates a copyable id list, restricted to exactly the sessions that
// qualify for fig_prolific_trend.py (a session counts only if it reaches
// k>=2 — matched, non-vacuous boxes — at least once in its trajectory; see
// that script's docstring). A session that never qualifies (e.g.
// broken/empty generations) is excluded from candidature entirely — its
// generations never even reach this review page.
//
// Both panels render EXACTLY like the live study's StimulusPanel.jsx (not a
// plain flex:1 iframe): fixed 1080px canvas, scaled via CSS transform to the
// largest square that fits, including the same height:auto override for
// generations styled with height:100vh/100% (see StimulusPanel.jsx's
// handleIframeLoad for why that's needed — without it, some generations
// measure their own MEASURING_HEIGHT placeholder back as if it were real
// content height, crushing the scale to near-unreadable). This is what makes
// the review page trustworthy for deciding "is this too bad to show
// participants" — a plain iframe wouldn't reproduce that failure mode at all.
//
// Quality badge (session/turn/k/f1) comes straight from the already-computed
// φ-features in features_prolific.csv — no re-derivation, no Puppeteer pass
// needed here.
//
//   node review-prolific.js   →  review-prolific.html
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV = path.resolve(__dirname, '../analysis/A2A_analysis/prolific/features_prolific.csv')

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── 1. read the manifest, same minimal-CSV convention as ingest-candidates.js ──
function readManifest() {
  const text = fs.readFileSync(CSV, 'utf8').trim()
  const [head, ...lines] = text.split('\n')
  const cols = head.split(',')
  const idx = (name) => cols.indexOf(name)
  const iGen = idx('generation_id'), iConv = idx('conversation_id'), iRef = idx('reference_id')
  const iName = idx('reference_name'), iTurn = idx('turn'), iPid = idx('prolific_pid'), iSession = idx('session')
  const iNRef = idx('n_ref'), iNGen = idx('n_gen'), iK = idx('k'), iRecall = idx('f1_recall')
  return lines.filter(Boolean).map((l) => {
    const c = l.split(',')
    return {
      generation_id: c[iGen],
      conversation_id: c[iConv],
      reference_id: c[iRef],
      reference_name: c[iName].replace(/^"|"$/g, ''),
      turn: parseInt(c[iTurn], 10),
      prolific_pid: c[iPid] || null,
      session: parseInt(c[iSession], 10),
      n_ref: parseInt(c[iNRef], 10),
      n_gen: parseInt(c[iNGen], 10),
      k: parseInt(c[iK], 10),
      f1_recall: parseFloat(c[iRecall]),
    }
  })
}

const manifest = readManifest()

// ── 2. session-level qualification — IDENTICAL rule to fig_prolific_trend.py:
// a session (conversation_id) is in the pool only if it reaches k>=2 at least
// once anywhere in its trajectory. Everything else is excluded from
// candidature outright, not just hidden — this review page never fetches or
// shows their HTML at all.
const qualifyingSessions = new Set(manifest.filter((r) => r.k >= 2).map((r) => r.conversation_id))
const pool = manifest.filter((r) => qualifyingSessions.has(r.conversation_id))

console.log(`${qualifyingSessions.size} qualifying sessions, ${pool.length} generations in the pool (of ${manifest.length} total rows / ${new Set(manifest.map((r) => r.conversation_id)).size} sessions in the manifest).`)

// ── 3. fetch HTML for every generation in the pool + every referenced reference ─
const genIds = [...new Set(pool.map((r) => r.generation_id))]
const htmlByGen = new Map()
for (let i = 0; i < genIds.length; i += 50) {
  const { data, error } = await db.from('messages').select('id,content').in('id', genIds.slice(i, i + 50))
  if (error) throw error
  for (const m of data) htmlByGen.set(m.id, m.content)
}

const refIds = [...new Set(pool.map((r) => r.reference_id))]
const { data: refRows, error: refErr } = await db.from('study_references').select('id,html').in('id', refIds)
if (refErr) throw refErr
const htmlByRef = new Map(refRows.map((r) => [r.id, r.html]))

// ── 4. group: reference → flat, ordered list of qualifying generations ────────
// Flat and pre-sorted (pid, then session, then turn) — mirrors review.js's
// r.gens shape exactly, so ←/→ steps through one person's session in order
// before moving to the next, with no extra grouping UI needed.
const refMap = new Map() // reference_id -> { name, html, gens: [...] }
for (const r of pool) {
  if (!refMap.has(r.reference_id)) {
    refMap.set(r.reference_id, { id: r.reference_id, name: r.reference_name, html: htmlByRef.get(r.reference_id) || '', gens: [] })
  }
  refMap.get(r.reference_id).gens.push({
    id: r.generation_id, pid: r.prolific_pid, session: r.session, turn: r.turn,
    n_ref: r.n_ref, n_gen: r.n_gen, k: r.k, f1_recall: r.f1_recall,
    html: htmlByGen.get(r.generation_id) || '',
  })
}

const DATA = [...refMap.values()]
  .map((r) => ({ ...r, gens: r.gens.sort((a, b) => (a.pid || '').localeCompare(b.pid || '') || a.session - b.session || a.turn - b.turn) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const totalGens = DATA.reduce((s, r) => s + r.gens.length, 0)

const TEMPLATE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Prolific Candidate Review — final pool</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#212121;color:#ececec;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{display:flex;align-items:center;gap:16px;padding:10px 18px;background:#171717;border-bottom:1px solid #2f2f2f;flex-wrap:wrap}
  .nav{display:flex;align-items:center;gap:8px}
  button{background:#2f2f2f;border:1px solid #424242;color:#ececec;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}
  button:hover{background:#3a3a3a}
  .meta{font-size:13px;color:#b4b4b4}
  .name{font-size:15px;font-weight:600;color:#ececec}
  .mono{font-family:Menlo,Monaco,monospace;font-size:12px;color:#4a9eff;user-select:all;cursor:pointer}
  main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;min-height:0}
  .panel{display:flex;flex-direction:column;background:#171717;border:1px solid #2f2f2f;border-radius:10px;overflow:hidden}
  .panel.target{border-color:#4a9eff66}
  .panel.marked{border-color:#ec8a8a}
  .bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #2f2f2f;font-size:12px;flex-wrap:wrap}
  .pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 9px;border-radius:10px;white-space:nowrap}
  .pill.t{background:#1a2a3a;color:#4a9eff;border:1px solid #4a9eff44}
  .pill.ok{background:#1a2a1a;color:#7fd17f;border:1px solid #7fd17f44}
  .pill.warn{background:#2a2410;color:#e7c66a;border:1px solid #e7c66a44}
  .pill.err{background:#2a1414;color:#ec8a8a;border:1px solid #ec8a8a44}
  /* Square-fit panel — mirrors application/frontend/src/components/StimulusPanel.jsx
     exactly: .frame centers the JS-sized largest square that fits, .square is
     that square, .canvas keeps its full unscaled 1080px-wide layout and is
     scaled down via CSS transform to fill the square edge to edge. */
  .frame{flex:1;min-height:0;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .square{display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
  .canvas{flex-shrink:0}
  .canvas iframe{width:100%;height:100%;border:0;display:block;background:#fff}
  kbd{background:#2f2f2f;border:1px solid #424242;border-radius:4px;padding:1px 6px;font-size:11px}
  .rm{display:flex;align-items:center;gap:5px;cursor:pointer;color:#ec8a8a;font-weight:600;white-space:nowrap}
  .rm input{cursor:pointer}
  .copybtn{background:#4a9eff;color:#0d1b2a;border:none;font-weight:600}
  .copybtn:hover{background:#6cb0ff}
</style></head>
<body>
<header>
  <div class="nav"><button id="refPrev">◀</button><span class="meta">ref <b id="refPos"></b>/<span id="refTotal"></span></span><button id="refNext">▶</button></div>
  <span class="name" id="refName"></span><span class="mono" id="refId" title="click to copy"></span>
  <span style="margin-left:auto" class="meta">refs <kbd>↑</kbd><kbd>↓</kbd> &nbsp; gens <kbd>←</kbd><kbd>→</kbd></span>
  <button class="copybtn" id="copy">Copy removal list (0)</button>
</header>
<main>
  <div class="panel target">
    <div class="bar"><span class="pill t">Reference</span><span class="meta" id="refName2"></span></div>
    <div class="frame" id="refFrameWrap">
      <div class="square" id="refSquare">
        <div class="canvas" id="refCanvas"><iframe id="refFrame" sandbox="allow-same-origin"></iframe></div>
      </div>
    </div>
  </div>
  <div class="panel" id="genPanel">
    <div class="bar">
      <button id="genPrev">◀</button>
      <span class="pill" id="genBadge"></span>
      <span class="meta">gen <b id="genPos"></b>/<span id="genTotal"></span></span>
      <span class="mono" id="genId" title="click to copy"></span>
      <label class="rm" style="margin-left:auto"><input type="checkbox" id="genRemove"> remove</label>
      <button id="genNext">▶</button>
    </div>
    <div class="frame" id="genFrameWrap">
      <div class="square" id="genSquare">
        <div class="canvas" id="genCanvas"><iframe id="genFrame" sandbox="allow-same-origin"></iframe></div>
      </div>
    </div>
  </div>
</main>
<script>
const DATA = __DATA__;
const LS = 'prolific_review_marks';
let marks = new Set(JSON.parse(localStorage.getItem(LS) || '[]'));
let ri = 0, gi = 0;
const $ = (id) => document.getElementById(id);

// Square-fit panel — line-for-line the same measurement/scale logic as
// StimulusPanel.jsx (React state -> plain JS state), including the
// height:auto override for height:100vh/100% generations. Two instances:
// one for the reference panel, one for the generation panel.
const CANVAS_WIDTH = 1080;
const MEASURING_HEIGHT = 2400;
function makeSquarePanel(wrapEl, squareEl, canvasEl, frameEl) {
  let squareSize = 0;
  let naturalHeight = null;

  function apply() {
    const h = naturalHeight || MEASURING_HEIGHT;
    canvasEl.style.width = CANVAS_WIDTH + 'px';
    canvasEl.style.height = h + 'px';
    canvasEl.style.transform = 'scale(' + Math.min(squareSize / CANVAS_WIDTH, squareSize / h, 1) + ')';
    canvasEl.style.visibility = naturalHeight ? 'visible' : 'hidden';
    squareEl.style.width = squareSize + 'px';
    squareEl.style.height = squareSize + 'px';
  }

  new ResizeObserver(() => {
    const r = wrapEl.getBoundingClientRect();
    squareSize = Math.min(r.width, r.height);
    apply();
  }).observe(wrapEl);

  frameEl.addEventListener('load', () => {
    const doc = frameEl.contentDocument;
    if (!doc || !doc.body) return;
    // See StimulusPanel.jsx's handleIframeLoad for why this is needed: some
    // generations style html/body with height:100vh/100% instead of natural
    // document flow, which is otherwise circular against MEASURING_HEIGHT.
    const style = doc.createElement('style');
    style.textContent = 'html, body { height: auto !important; min-height: 0 !important; }';
    doc.head.appendChild(style);
    naturalHeight = doc.body.scrollHeight;
    apply();
  });

  return {
    setHtml(html) {
      naturalHeight = null;
      apply();
      frameEl.srcdoc = html || '';
    },
  };
}
const refPanel = makeSquarePanel($('refFrameWrap'), $('refSquare'), $('refCanvas'), $('refFrame'));
const genPanel = makeSquarePanel($('genFrameWrap'), $('genSquare'), $('genCanvas'), $('genFrame'));

function badgeClass(g){ if(g.n_gen===0) return 'err'; if(g.k<2) return 'warn'; return 'ok'; }

function refreshCopyBtn(){ $('copy').textContent = 'Copy removal list (' + marks.size + ')'; }
function saveMarks(){ localStorage.setItem(LS, JSON.stringify([...marks])); refreshCopyBtn(); }

function render(){
  const r = DATA[ri], g = (r.gens||[])[gi] || {};
  $('refPos').textContent = ri+1; $('refTotal').textContent = DATA.length;
  $('refName').textContent = r.name; $('refName2').textContent = r.name;
  $('refId').textContent = r.id;
  refPanel.setHtml(r.html);
  genPanel.setHtml(g.html || '');
  const badge = $('genBadge');
  badge.textContent = g.id ? ('pid ' + (g.pid||'').slice(0,8) + ' · s' + g.session + ' · turn ' + g.turn + ' · k ' + g.k + '/' + g.n_ref + ' · f1 ' + g.f1_recall.toFixed(2)) : '-';
  badge.className = 'pill ' + (g.id ? badgeClass(g) : '');
  $('genId').textContent = g.id || '';
  $('genPos').textContent = r.gens.length ? gi+1 : 0;
  $('genTotal').textContent = r.gens.length;
  $('genRemove').checked = g.id ? marks.has(g.id) : false;
  $('genPanel').classList.toggle('marked', g.id ? marks.has(g.id) : false);
}
function setRef(i){ ri = (i + DATA.length) % DATA.length; gi = 0; render(); }
function setGen(i){ const n = DATA[ri].gens.length; if(!n) return; gi = (i + n) % n; render(); }
$('refPrev').onclick = () => setRef(ri-1); $('refNext').onclick = () => setRef(ri+1);
$('genPrev').onclick = () => setGen(gi-1); $('genNext').onclick = () => setGen(gi+1);
$('refId').onclick = () => navigator.clipboard.writeText($('refId').textContent);
$('genId').onclick = () => navigator.clipboard.writeText($('genId').textContent);
$('genRemove').addEventListener('change', () => {
  const g = DATA[ri].gens[gi]; if(!g) return;
  if ($('genRemove').checked) marks.add(g.id); else marks.delete(g.id);
  saveMarks(); $('genPanel').classList.toggle('marked', marks.has(g.id));
});
$('copy').onclick = () => navigator.clipboard.writeText([...marks].join('\\n'));
addEventListener('keydown', (e) => {
  if(e.key==='ArrowLeft'){e.preventDefault();setGen(gi-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();setGen(gi+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();setRef(ri-1);}
  else if(e.key==='ArrowDown'){e.preventDefault();setRef(ri+1);}
});
refreshCopyBtn();
render();
</script>
</body></html>`

// Escape '<' so any markup inside the embedded HTML can't break out of <script>.
const json = JSON.stringify(DATA).replace(/</g, '\\u003c')
const out = path.join(__dirname, 'review-prolific.html')
fs.writeFileSync(out, TEMPLATE.replace('__DATA__', json))
console.log(`review-prolific.html written — ${DATA.length} references, ${totalGens} generations.\nOpen it: open "${out}"`)
