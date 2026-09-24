// Build a self-contained review page: each reference vs all its real generations,
// grouped by participant. Each generation shows its message id (click to copy),
// strict/malformed label counts, and a "remove" toggle that collects a copyable
// id list. Open the output in a browser; no server needed.
//
//   node review-generations.js   →  review-generations.html
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const VIEWPORT = { width: 1080, height: 900 }

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport(VIEWPORT)

async function counts(html) {
  try { await page.setContent(html || '', { waitUntil: 'load', timeout: 15000 }) } catch { /* still evaluate */ }
  return page.evaluate(() => {
    const STRICT = /^[a-z]+-\d+$/
    const LOOSE = /^(text|link|button|image|img|icon|nav|header|footer|logo|input|box|heading|title|section|menu|card|btn)[ _.\-]*\d{1,4}$/
    const best = new Map()
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 3 || r.height < 3) continue
      const t = el.textContent.trim().toLowerCase()
      if (!t || t.length > 30) continue
      const a = r.width * r.height
      if (!best.has(t) || a > best.get(t)) best.set(t, a)
    }
    let strict = 0, near = 0
    for (const t of best.keys()) { if (STRICT.test(t)) strict++; else if (LOOSE.test(t)) near++ }
    return { strict, near }
  })
}

const { data: parts } = await db.from('study_participants').select('user_id')
const partIds = new Set((parts || []).map(p => p.user_id))

const { data: refs } = await db.from('study_references').select('id,name,html')
const { data: convs } = await db.from('conversations').select('id,user_id,reference_id').not('reference_id', 'is', null)
const convsP = (convs || []).filter(c => partIds.has(c.user_id))
const convIds = convsP.map(c => c.id)

let msgs = []
for (let i = 0; i < convIds.length; i += 50) {
  const { data } = await db.from('messages')
    .select('id,conversation_id,turn,content').eq('role', 'assistant').in('conversation_id', convIds.slice(i, i + 50))
  msgs = msgs.concat(data || [])
}
const msgsByConv = new Map()
for (const m of msgs) { if (!msgsByConv.has(m.conversation_id)) msgsByConv.set(m.conversation_id, []); msgsByConv.get(m.conversation_id).push(m) }

// Build DATA
const references = []
for (const r of (refs || []).sort((a, b) => a.name.localeCompare(b.name))) {
  const nref = (await counts(r.html)).strict
  const refConvs = convsP.filter(c => c.reference_id === r.id).sort((a, b) => a.user_id.localeCompare(b.user_id))
  const convOut = []
  for (const c of refConvs) {
    const ms = (msgsByConv.get(c.id) || []).sort((a, b) => (a.turn || 0) - (b.turn || 0))
    const out = []
    for (const m of ms) {
      const { strict, near } = await counts(m.content)
      out.push({ id: m.id, turn: m.turn, html: m.content || '', strict, near })
    }
    if (out.length) convOut.push({ conv: c.id, user: c.user_id, msgs: out })
  }
  references.push({ id: r.id, name: r.name, html: r.html, nref, convs: convOut })
}
await browser.close()

const DATA = { references }
const json = JSON.stringify(DATA).replace(/</g, '\\u003c') // safe to embed inside <script>

const totalGens = references.reduce((s, r) => s + r.convs.reduce((t, c) => t + c.msgs.length, 0), 0)

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Generation Review</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a1a;color:#ececec}
  .top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:10px 16px;background:#111;border-bottom:1px solid #333}
  select{background:#212121;color:#ececec;border:1px solid #444;border-radius:8px;padding:7px 10px;font:inherit;font-size:14px}
  .info{font-size:13px;color:#9aa}
  .spacer{flex:1}
  .copybtn{background:#4a9eff;color:#0d1b2a;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
  .copybtn:hover{background:#6cb0ff}
  .navbtn{background:#212121;color:#ececec;border:1px solid #444;border-radius:8px;padding:7px 11px;cursor:pointer;font:inherit}
  .refpane{display:flex;gap:16px;padding:16px;align-items:flex-start;border-bottom:2px solid #333}
  .refframe{flex:0 0 46%;height:340px;border:1px solid #444;border-radius:8px;background:#fff}
  .refframe iframe{width:100%;height:100%;border:none;border-radius:8px;display:block;background:#fff}
  .refmeta h2{margin:0 0 6px;font-size:18px}
  .refmeta .sub{color:#9aa;font-size:13px}
  .conv{padding:8px 16px}
  .conv h3{font-size:14px;color:#cdd;margin:14px 0 8px;border-left:3px solid #4a9eff;padding-left:8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
  .card{background:#222;border:1px solid #333;border-radius:10px;overflow:hidden}
  .card.flag{border-color:#caa14a}
  .card.bad{border-color:#d35e5e}
  .card.marked{outline:3px solid #d35e5e;outline-offset:-1px}
  .thumb{height:150px;background:#fff;overflow:hidden}
  .thumb iframe{width:100%;height:100%;border:none;display:block;background:#fff}
  .cmeta{padding:8px 10px;font-size:12px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:2px 0}
  .counts{font-size:11px}
  .ok{color:#7fd17f}.warn{color:#e7c66a}.err{color:#ec8a8a}
  code.id{font-family:Menlo,monospace;font-size:10.5px;color:#9cf;cursor:pointer;background:#1a1a1a;padding:1px 4px;border-radius:3px}
  code.id:hover{background:#0a2a4a}
  .rm{display:flex;align-items:center;gap:5px;cursor:pointer;color:#ec8a8a;font-weight:600}
  .rmpanel{position:fixed;right:14px;bottom:14px;width:300px;max-height:46vh;background:#0e0e0e;border:1px solid #444;border-radius:10px;padding:10px;z-index:30;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  .rmpanel h4{margin:0 0 6px;font-size:13px}
  .rmpanel textarea{width:100%;height:160px;background:#161616;color:#cdd;border:1px solid #333;border-radius:6px;font-family:Menlo,monospace;font-size:10.5px;resize:vertical}
</style></head>
<body>
  <div class="top">
    <button class="navbtn" id="prev">↑ Prev</button>
    <select id="refsel"></select>
    <button class="navbtn" id="next">↓ Next</button>
    <span class="info" id="refinfo"></span>
    <span class="spacer"></span>
    <button class="copybtn" id="copy">Copy removal list (0)</button>
  </div>
  <div class="refpane">
    <div class="refframe"><iframe id="refframe" sandbox=""></iframe></div>
    <div class="refmeta"><h2 id="refname"></h2><div class="sub" id="refsub"></div>
      <p class="sub" style="max-width:380px;margin-top:10px">Mark the generations to remove with the <b style="color:#ec8a8a">remove</b> toggle. Cards are pre-tinted: <span class="warn">amber</span> = some malformed labels, <span class="err">red</span> = no usable labels. Click an id to copy it.</p>
    </div>
  </div>
  <div id="convs"></div>
  <div class="rmpanel">
    <h4>Marked for removal (<span id="rmcount">0</span>)</h4>
    <textarea id="rmlist" readonly></textarea>
  </div>
<script>
const DATA = JSON.parse(${JSON.stringify(json)});
const LS = 'gen_review_marks';
let marks = new Set(JSON.parse(localStorage.getItem(LS) || '[]'));
let idx = 0;

const sel = document.getElementById('refsel');
DATA.references.forEach((r,i)=>{ const o=document.createElement('option'); o.value=i; const g=r.convs.reduce((s,c)=>s+c.msgs.length,0); o.textContent=r.name+' ('+g+' gens, '+r.convs.length+' people)'; sel.appendChild(o); });

function flagClass(g, nref){ if(g.strict===0 && g.near>0) return 'bad'; if(g.near>g.strict) return 'flag'; return ''; }
function countClass(g){ if(g.strict===0&&g.near>0) return 'err'; if(g.near>g.strict) return 'warn'; return 'ok'; }

function saveMarks(){ localStorage.setItem(LS, JSON.stringify([...marks])); refreshPanel(); }
function refreshPanel(){
  document.getElementById('rmcount').textContent = marks.size;
  document.getElementById('copy').textContent = 'Copy removal list ('+marks.size+')';
  document.getElementById('rmlist').value = [...marks].join('\\n');
}

function render(){
  const r = DATA.references[idx];
  sel.value = idx;
  document.getElementById('refname').textContent = r.name;
  document.getElementById('refsub').textContent = 'reference boxes: '+r.nref+'  ·  '+r.convs.length+' participants  ·  '+r.convs.reduce((s,c)=>s+c.msgs.length,0)+' generations';
  document.getElementById('refinfo').textContent = (idx+1)+' / '+DATA.references.length;
  document.getElementById('refframe').srcdoc = r.html;
  const root = document.getElementById('convs');
  root.innerHTML = '';
  r.convs.forEach((c,ci)=>{
    const h = document.createElement('div'); h.className='conv';
    const title = document.createElement('h3'); title.textContent = 'Participant '+(ci+1)+' · '+c.user.slice(0,8)+' · '+c.msgs.length+' turns'; h.appendChild(title);
    const grid = document.createElement('div'); grid.className='grid';
    c.msgs.forEach(g=>{
      const card = document.createElement('div');
      card.className = 'card '+flagClass(g,r.nref)+(marks.has(g.id)?' marked':'');
      const thumb = document.createElement('div'); thumb.className='thumb';
      const ifr = document.createElement('iframe'); ifr.setAttribute('sandbox',''); ifr.srcdoc = g.html; thumb.appendChild(ifr);
      const meta = document.createElement('div'); meta.className='cmeta';
      meta.innerHTML =
        '<div class="row"><span>turn '+g.turn+'</span><span class="counts '+countClass(g)+'">strict '+g.strict+' / near '+g.near+'</span></div>'+
        '<div class="row"><code class="id" title="click to copy">'+g.id+'</code></div>';
      const rm = document.createElement('label'); rm.className='rm';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=marks.has(g.id);
      cb.addEventListener('change',()=>{ if(cb.checked){marks.add(g.id);card.classList.add('marked');} else {marks.delete(g.id);card.classList.remove('marked');} saveMarks(); });
      rm.appendChild(cb); rm.appendChild(document.createTextNode('remove'));
      const rmrow = document.createElement('div'); rmrow.className='row'; rmrow.appendChild(rm);
      meta.appendChild(rmrow);
      meta.querySelector('code.id').addEventListener('click',()=>navigator.clipboard.writeText(g.id));
      card.appendChild(thumb); card.appendChild(meta); grid.appendChild(card);
    });
    h.appendChild(grid); root.appendChild(h);
  });
}
document.getElementById('prev').onclick=()=>{ idx=(idx-1+DATA.references.length)%DATA.references.length; render(); };
document.getElementById('next').onclick=()=>{ idx=(idx+1)%DATA.references.length; render(); };
sel.onchange=()=>{ idx=+sel.value; render(); };
document.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){e.preventDefault();idx=(idx-1+DATA.references.length)%DATA.references.length;render();} else if(e.key==='ArrowDown'){e.preventDefault();idx=(idx+1)%DATA.references.length;render();} });
document.getElementById('copy').onclick=()=>{ navigator.clipboard.writeText([...marks].join('\\n')); };
refreshPanel(); render();
</script>
</body></html>`

const out = join(here, 'review-generations.html')
fs.writeFileSync(out, HTML)
console.log('written: ' + out + '  (' + references.length + ' references, ' + totalGens + ' generations)')
