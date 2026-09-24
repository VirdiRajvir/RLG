// Generates a self-contained review.html for browsing the seeded corpus:
// pick a reference, slide ←/→ through its candidates (turn_1…turn_5, gold), with
// the reference pinned alongside and every gen's id + tier shown. View-only.
//   node review.js   →  writes review.html   (then open it in a browser)
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: refs, error: e1 } = await db.from('study_references').select('id,name,html').order('name')
if (e1) throw e1
const { data: cands, error: e2 } = await db.from('study_candidates').select('id,reference_id,tier,html')
if (e2) throw e2

const tierRank = (t) => ({ turn_1: 1, turn_2: 2, turn_3: 3, turn_4: 4, turn_5: 5, gold_broken: 9 }[t] ?? 8)
const DATA = refs.map((r) => ({
  id: r.id,
  name: r.name,
  refHtml: r.html,
  gens: cands
    .filter((c) => c.reference_id === r.id)
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
    .map((c) => ({ id: c.id, tier: c.tier, html: c.html })),
}))

const TEMPLATE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Corpus Review</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#212121;color:#ececec;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{display:flex;align-items:center;gap:16px;padding:10px 18px;background:#171717;border-bottom:1px solid #2f2f2f;flex-wrap:wrap}
  .nav{display:flex;align-items:center;gap:8px}
  button{background:#2f2f2f;border:1px solid #424242;color:#ececec;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}
  button:hover{background:#3a3a3a}
  .meta{font-size:13px;color:#b4b4b4}
  .name{font-size:15px;font-weight:600;color:#ececec}
  .mono{font-family:Menlo,Monaco,monospace;font-size:12px;color:#4a9eff;user-select:all}
  main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;min-height:0}
  .panel{display:flex;flex-direction:column;background:#171717;border:1px solid #2f2f2f;border-radius:10px;overflow:hidden}
  .panel.target{border-color:#4a9eff66}
  .bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #2f2f2f;font-size:12px;flex-wrap:wrap}
  .pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 9px;border-radius:10px;white-space:nowrap}
  .pill.t{background:#1a2a3a;color:#4a9eff;border:1px solid #4a9eff44}
  .pill.g{background:#2a2a2a;color:#b4b4b4;border:1px solid #424242}
  .pill.gold{background:#3a2a1a;color:#d8a657;border:1px solid #6a4a2a}
  iframe{flex:1;border:0;background:#fff;width:100%}
  kbd{background:#2f2f2f;border:1px solid #424242;border-radius:4px;padding:1px 6px;font-size:11px}
</style></head>
<body>
<header>
  <div class="nav"><button id="refPrev">◀</button><span class="meta">ref <b id="refPos"></b>/<span id="refTotal"></span></span><button id="refNext">▶</button></div>
  <span class="name" id="refName"></span><span class="mono" id="refId"></span>
  <span style="margin-left:auto" class="meta">refs <kbd>↑</kbd><kbd>↓</kbd> &nbsp; gens <kbd>←</kbd><kbd>→</kbd></span>
</header>
<main>
  <div class="panel target">
    <div class="bar"><span class="pill t">Reference</span><span class="meta" id="refName2"></span></div>
    <iframe id="refFrame" sandbox=""></iframe>
  </div>
  <div class="panel">
    <div class="bar"><button id="genPrev">◀</button><span class="pill g" id="genTier"></span><span class="meta">gen <b id="genPos"></b>/<span id="genTotal"></span></span><span class="mono" id="genId"></span><button id="genNext" style="margin-left:auto">▶</button></div>
    <iframe id="genFrame" sandbox=""></iframe>
  </div>
</main>
<script>
const DATA = __DATA__;
let ri = 0, gi = 0;
const $ = (id) => document.getElementById(id);
function render(){
  const r = DATA[ri], g = (r.gens||[])[gi] || {};
  $('refPos').textContent = ri+1; $('refTotal').textContent = DATA.length;
  $('refName').textContent = r.name; $('refName2').textContent = r.name;
  $('refId').textContent = r.id;
  $('refFrame').srcdoc = r.refHtml;
  $('genFrame').srcdoc = g.html || '';
  const tierEl = $('genTier');
  tierEl.textContent = g.tier || '-';
  tierEl.className = 'pill ' + (g.tier === 'gold_broken' ? 'gold' : 'g');
  $('genId').textContent = g.id || '';
  $('genPos').textContent = r.gens.length ? gi+1 : 0;
  $('genTotal').textContent = r.gens.length;
}
function setRef(i){ ri = (i + DATA.length) % DATA.length; gi = 0; render(); }
function setGen(i){ const n = DATA[ri].gens.length; if(!n) return; gi = (i + n) % n; render(); }
$('refPrev').onclick = () => setRef(ri-1); $('refNext').onclick = () => setRef(ri+1);
$('genPrev').onclick = () => setGen(gi-1); $('genNext').onclick = () => setGen(gi+1);
addEventListener('keydown', (e) => {
  if(e.key==='ArrowLeft'){e.preventDefault();setGen(gi-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();setGen(gi+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();setRef(ri-1);}
  else if(e.key==='ArrowDown'){e.preventDefault();setRef(ri+1);}
});
render();
</script>
</body></html>`

// Escape '<' so any markup inside the embedded HTML can't break out of <script>.
const json = JSON.stringify(DATA).replace(/</g, '\\u003c')
const out = join(dirname(fileURLToPath(import.meta.url)), 'review.html')
writeFileSync(out, TEMPLATE.replace('__DATA__', json))
console.log(
  `review.html written — ${DATA.length} references, ${cands.length} candidates.\n` +
    `Open it: open "${out}"`
)
