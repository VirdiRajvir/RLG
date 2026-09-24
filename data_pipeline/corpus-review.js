// Generates a self-contained corpus-review.html for eyeballing the trimmed
// 5-reference h2a corpus: one reference at a time in a carousel (◀/▶ or
// arrow keys), rendered exactly the way the live study's ReferencePanel.jsx
// renders it — the frame itself is JS-sized to the largest square that fits
// the available panel box (same 44%-of-viewport width, clamped 320–820px,
// full-height column), and every reference's fixed 1080x1080 canvas is
// scaled via CSS transform to fill that square edge to edge, with zero
// letterbox. No grayscale filter — the corpus bakes a consistent white/grey/
// dark-grey palette into every reference's own CSS instead of relying on a
// display-time filter.
// Try resizing this browser window: the reference re-scales live, exactly
// like it will for a participant on a different device or a different zoom
// level — that's the actual fix, not just a fixed-size preview.
//   node corpus-review.js   →  writes corpus-review.html   (open in a browser)
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { REFERENCES } from './references.js'

const NAMES = ['midcentury', 'steel', 'stickynotes', 'retro', 'darkminimal', 'apothecary']
const DATA = NAMES.map((name) => {
  const ref = REFERENCES.find((r) => r.name === name)
  if (!ref) throw new Error(`Reference "${name}" not found in references.js`)
  return { name, html: ref.html }
})

const TEMPLATE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Corpus Review — trimmed 5-reference set</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{font-family:system-ui,-apple-system,sans-serif;background:#171717;color:#ececec;display:flex;flex-direction:column;overflow:hidden}
  header{display:flex;align-items:center;gap:16px;padding:14px 20px;background:#212121;border-bottom:1px solid #2a2a2a;flex-shrink:0}
  .nav{display:flex;align-items:center;gap:8px}
  button{background:#2f2f2f;border:1px solid #424242;color:#ececec;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}
  button:hover{background:#3a3a3a}
  .meta{font-size:13px;color:#b4b4b4}
  .name{font-size:15px;font-weight:600}
  kbd{background:#2f2f2f;border:1px solid #424242;border-radius:4px;padding:1px 6px;font-size:11px}
  /* Mirrors ProlificStudy.css's .ps-ref / .ps-ref-bar / .ps-ref-frame /
     .ps-ref-square / .ps-ref-iframe and ReferencePanel.jsx's square-fit
     logic exactly — same panel sizing rule, same JS-computed square frame,
     same fixed 1080px canvas + transform:scale. */
  main{flex:1;min-height:0;display:flex;justify-content:center;background:#0e0e0e}
  .ps-ref{flex:0 0 44%;max-width:820px;min-width:320px;display:flex;flex-direction:column;border-left:1px solid #2a2a2a;border-right:1px solid #2a2a2a}
  .ps-ref-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #2a2a2a;font-size:12px;opacity:.8}
  .ps-ref-frame{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .ps-ref-square{display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
  .ps-ref-canvas{flex-shrink:0}
  .ps-ref-iframe{width:100%;height:100%;border:0;background:#242424}
  #scaleInfo{font-size:11px;color:#6a6a6a}
</style></head>
<body>
<header>
  <div class="nav"><button id="prev">◀</button><span class="meta">reference <b id="pos"></b>/<span id="total"></span></span><button id="next">▶</button></div>
  <span class="name" id="refName"></span>
  <span id="scaleInfo"></span>
  <span style="margin-left:auto" class="meta">nav with <kbd>←</kbd> <kbd>→</kbd> &nbsp; resize the window to see it re-scale</span>
</header>
<main>
  <aside class="ps-ref">
    <div class="ps-ref-bar"><span>REFERENCE</span><span class="meta" id="refName2"></span></div>
    <div class="ps-ref-frame" id="frame">
      <div class="ps-ref-square" id="square" style="width:0;height:0">
        <div class="ps-ref-canvas" id="canvas" style="width:1080px;visibility:hidden">
          <iframe class="ps-ref-iframe" id="iframe" title="Reference" sandbox="allow-same-origin"></iframe>
        </div>
      </div>
    </div>
  </aside>
</main>
<script>
const DATA = __DATA__;
const CANVAS_WIDTH = 1080, MEASURING_HEIGHT = 2400;
let i = 0, naturalHeight = null, squareSize = 0;
const $ = (id) => document.getElementById(id);
const frame = $('frame'), square = $('square'), canvas = $('canvas'), iframe = $('iframe');

function computeScale(){
  if(!naturalHeight || !squareSize) return;
  const scale = Math.min(squareSize/CANVAS_WIDTH, squareSize/naturalHeight, 1);
  canvas.style.height = naturalHeight + 'px';
  canvas.style.transform = 'scale(' + scale + ')';
  canvas.style.visibility = 'visible';
  $('scaleInfo').textContent = 'panel ' + Math.round(squareSize) + '×' + Math.round(squareSize) +
    'px, reference ' + CANVAS_WIDTH + '×' + naturalHeight + 'px, scale ' + scale.toFixed(2);
}
function computeSquare(){
  const r = frame.getBoundingClientRect();
  squareSize = Math.min(r.width, r.height);
  square.style.width = squareSize + 'px';
  square.style.height = squareSize + 'px';
  computeScale();
}
new ResizeObserver(computeSquare).observe(frame);

iframe.onload = () => {
  const doc = iframe.contentDocument;
  if (doc && doc.body) { naturalHeight = doc.body.scrollHeight; computeScale(); }
};

function render(){
  const r = DATA[i];
  $('pos').textContent = i+1; $('total').textContent = DATA.length;
  $('refName').textContent = r.name; $('refName2').textContent = r.name;
  naturalHeight = null;
  canvas.style.height = MEASURING_HEIGHT + 'px';
  canvas.style.visibility = 'hidden';
  iframe.srcdoc = r.html;
}
function setRef(n){ i = (n + DATA.length) % DATA.length; render(); }
$('prev').onclick = () => setRef(i-1);
$('next').onclick = () => setRef(i+1);
addEventListener('keydown', (e) => {
  if(e.key==='ArrowLeft'){e.preventDefault();setRef(i-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();setRef(i+1);}
});
render();
</script>
</body></html>`

const json = JSON.stringify(DATA).replace(/</g, '\\u003c')
const out = join(dirname(fileURLToPath(import.meta.url)), 'corpus-review.html')
writeFileSync(out, TEMPLATE.replace('__DATA__', json))
console.log(`corpus-review.html written — ${DATA.length} references (${NAMES.join(', ')}).\nOpen it: open "${out}"`)
