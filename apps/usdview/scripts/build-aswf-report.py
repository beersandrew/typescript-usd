#!/usr/bin/env python3
"""Join reproducible inventory, CPU probes and actual browser evidence; no inferred passes."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out/aswf'
def read(path, fallback=None):
    return json.loads(path.read_text()) if path.exists() else fallback
inventory = read(OUT/'inventory.json')
probes = read(OUT/'results.json')
browser = read(OUT/'browser-safari.json', {'results':[]})
deps = read(OUT/'dependency-audit.json')
requirements = read(OUT/'requirements.json', {})
by_path = {row['path']:row for row in probes['assets']}
by_browser = {row['label']:row for row in browser['results']}
rows = []
for asset in inventory['assets']:
    row = by_path.get(asset['path'], {})
    rows.append({'path':asset['path'], 'source':asset['source'], 'group':asset['group'],
        'role':asset.get('roleHint', asset.get('roleHints', 'Unclassified')),
        'native':row.get('native',{}), 'typescript':row.get('typescript',{}),
        'comparison':row.get('comparison',{}), 'browser':by_browser.get(asset['path'],{})})
data = {'inventory':inventory['summary'], 'commit':inventory['commit'], 'rows':rows,
        'cpuSummary':probes['summary'], 'browser':{k:v for k,v in browser.items() if k!='results'},
        'dependencies':deps, 'requirements':requirements}
encoded = json.dumps(data).replace('<','\\u003c')
html = r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASWF assets — complete inventory and observed gaps</title>
<style>body{font:15px/1.5 system-ui;margin:32px;color:#252525;background:#fafafa}main{max-width:1500px;margin:auto}h1{font-size:28px}h2{margin-top:32px}a{color:#145995}p{max-width:1000px}.cards{display:flex;gap:12px;flex-wrap:wrap}.card{padding:12px 18px;background:#eee;border-radius:4px}.card b{display:block;font-size:24px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:8px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{background:#e5e5e5;position:sticky;top:0}td:first-child{max-width:450px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:850px;font-size:11px}input,select{font:inherit;padding:8px;margin:4px}input{width:min(520px,80vw)}.note{background:#fff3d6;padding:12px}.good{color:#276335}.bad{color:#8a302b}.muted{color:#666}summary{cursor:pointer}.scroll{overflow:auto}code{font-size:12px}</style>
<main><h1>ASWF assets: full inventory, observed gaps</h1>
<p>All <b>284 tracked USD-family files</b> at <a href="https://github.com/usd-wg/assets/tree/091bb5c6f8eb665ad4cf9d6c10025cecc07eda88">091bb5c</a>, including documentation, full assets, dependencies and malformed tests. No external linked asset collections are included. October 30, 2026.</p>
<p class="note">Assessment is complete for CPU opening and selected composed feature counts; browser rendering is partial. Native reference is <b>OpenUSD 26.08</b>. Opening a file, matching counts, completing an orbit and matching native pixels are separate claims. No pixel parity or Core compliance percentage is implied.</p>
<div class="cards" id="cards"></div>
<p><a href="/?corpus=aswf">Open full-corpus viewer (local Vite server)</a> · <a href="results.json">All CPU evidence</a> · <a href="browser-safari.json">Safari results</a> · <a href="dependency-audit.json">Dependency audit and native source references</a> · <a href="requirements.json">Ranked requirements</a></p>
<p class="note">This is the preserved corpus baseline, preceding the shading implementation. See the <a href="../coverage/index.html">current coverage tracker</a> and <a href="../materialx-render/references.html">focused MaterialX rendering checkpoint</a> for subsequent fixes and browser evidence. The corpus was not rerun.</p><h2>Priorities from the corpus baseline</h2><p>Stop broad repeated sweeps. Use representative files to fix silent composition/material omissions, then GPU draw-range failures, then missing geometry adapters. Preserve malformed fixtures as diagnostic tests and dependency layers as dependency tests; neither should be counted as a failed standalone scene by default.</p>
<div id="requirements"></div>
<h2>What native usdview does</h2><ol id="pipeline"></ol><p>The Python/Qt application controls a C++ USD imaging engine. OpenSubdiv and MaterialX are rendering dependencies behind that engine, not features implemented by the Python UI. MaterialX support depends on the native build and selected material context; a file containing MaterialX alternatives may still render through its universal Preview Surface output.</p>
<h2>Are the TypeScript dependencies sufficient?</h2><p><b>OpenSubdiv: only for bounded Catmull–Clark previews.</b> Loop/bilinear, adaptive patches/stencils and limit-surface shading remain gaps. <b>MaterialX: not for the full corpus.</b> In the earlier dependency audit, across 19 MaterialX files / 31 materials, 25 generated WGSL, six rejected, and seven of the generated materials reported ignored inputs. The other 18 are not proven rendering successes.</p>
<div class="scroll"><table><thead><tr><th>Requirement</th><th>Current state</th><th>Remaining work / owner</th></tr></thead><tbody id="dependencies"></tbody></table></div>
<h2>Every USD-family file</h2><p>Expand any row for native/TypeScript counts, diagnostics, authored features and the actual Safari outcome. “Selected counts match” is deliberately narrower than composition equivalence.</p>
<input id="search" placeholder="Filter path, schema, shader or error" aria-label="Filter assets"><select id="filter" aria-label="Filter outcome"><option value="">All files</option><option>Composition differs</option><option>Native rejected/crashed</option><option>Blocked</option><option>Smoke pass</option><option>Stopped</option><option>Not browser-tested</option></select><span id="count"></span>
<div class="scroll"><table><thead><tr><th>File / evidence</th><th>Native / TS open</th><th>Selected counts</th><th>CPU preflight</th><th>Safari load / orbit</th><th>Reason / classification</th></tr></thead><tbody id="assets"></tbody></table></div>
</main><script type="application/json" id="data">__DATA__</script><script>
const data=JSON.parse(document.querySelector('#data').textContent);const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
const browserCounts={};for(const r of data.rows){const key=(r.browser.load||'Not run')+'/'+(r.browser.orbit||'Not run');browserCounts[key]=(browserCounts[key]||0)+1}
for(const [value,label] of [[284,'Tracked USD-family files'],[281,'Native opened (26.08)'],[20,'Selected composition counts differ'],[browserCounts['Pass/Pass']||0,'Safari load + orbit passes'],[browserCounts['Fail/Not run']||0,'Safari load/preflight failures']]){const c=el('div');c.className='card';c.append(el('b',value),el('span',label));document.querySelector('#cards').append(c)}
for(const step of data.dependencies.nativePipeline.stages)document.querySelector('#pipeline').append(el('li',step));
for(const r of data.dependencies.requirements){const tr=el('tr');tr.append(el('td',r.id+' — '+r.requirement),el('td',r.status+'\n'+r.existing),el('td',r.remaining+'\nOwner: '+r.implementationOwner));document.querySelector('#dependencies').append(tr)}
const req=data.requirements.requirements||[];if(req.length){const table=el('table'),head=el('tr');for(const h of ['Priority / requirement','Representative next step','Owner / dependencies / effort'])head.append(el('th',h));table.append(head);for(const r of req){const tr=el('tr');tr.append(el('td',r.priority+' '+r.id+' — '+r.title),el('td',r.boundedNextStep),el('td',r.owners.join('; ')+' · Dependencies: '+(r.dependsOn.join(', ')||'none')+' · Effort: '+r.effort.size+' (rough inference)'));table.append(tr)}document.querySelector('#requirements').append(table)}
function outcome(r){if(r.comparison.status==='differences-observed')return 'Composition differs';if(r.native.status!=='opened')return 'Native rejected/crashed';if(r.browser.load==='Fail'||r.browser.orbit==='Fail')return 'Blocked';if(r.browser.orbit==='Pass')return 'Smoke pass';if(r.browser.load==='Stopped'||r.browser.orbit==='Stopped')return 'Stopped';return 'Not browser-tested'}
function render(){const q=document.querySelector('#search').value.toLowerCase(),f=document.querySelector('#filter').value,body=document.querySelector('#assets');body.replaceChildren();let count=0;for(const r of data.rows){if(q&&!JSON.stringify(r).toLowerCase().includes(q)||f&&outcome(r)!==f)continue;count++;const tr=el('tr'),cell=el('td'),link=el('a',r.path);link.href=r.source;link.target='_blank';cell.append(link);const detail=el('details');detail.append(el('summary','Evidence'),el('pre',JSON.stringify(r,null,2)));cell.append(detail);const reason=r.browser.reason||r.typescript.capabilityCheck?.reasons?.join('; ')||'';tr.append(cell,el('td',(r.native.status||'not-run')+' / '+(r.typescript.status||'not-run')),el('td',r.comparison.status||'not-compared'),el('td',r.typescript.capabilityCheck?.status||'not-run'),el('td',(r.browser.load||'Not run')+' / '+(r.browser.orbit||'Not run')),el('td',outcome(r)+(reason?' — '+reason:'')));body.append(tr)}document.querySelector('#count').textContent=count+' / '+data.rows.length+' files'}
document.querySelector('#search').addEventListener('input',render);document.querySelector('#filter').addEventListener('change',render);render();
</script>'''.replace('__DATA__',encoded)
OUT.mkdir(exist_ok=True,parents=True)
(OUT/'index.html').write_text(html)
print('Wrote',OUT/'index.html',len(rows),'rows')
