// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdAppUtils/frameRecorder.cpp
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Browser asset acceptance: comparison and report (see run.mjs). Also runnable
// alone to rebuild the report from an existing output folder:
//
//   node scripts/asset-acceptance/report.mjs [--out DIR] [--manifest FILE]
//       [--reference usdview|usdrecord] [--score-reference usdrecord|usdview]
//       [--runs N] [--perf-baseline FILE]
//
// The bar is the comparison with native OpenUSD (score.mjs; imaging-i2.md
// "Decision: one faithful implementation, no backup renderer"): every run
// under <out>/<id>/runs/storm/<k>/ is scored against --score-reference
// (default usdrecord) and --runs runs are required (default 3). The
// performance guard (score.mjs) compares the timings with perf-baseline.json
// (--perf-baseline FILE to use another; run.mjs passes it through).
//
// References: `usdview` (default) is usdview's own StageView through
// testusdview (run by the native half; see run.mjs), whose lighting the viewer follows, compared
// with browser.png; `usdrecord` is usdrecord, whose camera light adds ambient
// 0.01 that usdview's does not, compared with browser-usdrecord.png, the
// capture with usdrecord's lighting state (harness.ts). Every reference that
// exists is compared; the chosen one gives the verdict.
//
// Comparison: usdrecord writes RGBA over a (0,0,0,0) clear with Storm's
// premultiplied colour, so its RGB is the image over black; usdview's grab
// and the viewer canvas are opaque over a black background. RGB channels are
// compared; usdrecord's alpha is used only for its coverage mask (for usdview
// the coverage is non-black RGB, as for the browser). A pixel "differs" when any RGB
// channel differs by more than TOL levels (a 2/255
// tolerance). PSNR is over all pixels' RGB, 8-bit sRGB values.
// Gap classes come from notes.json (a reviewer's reading of the images and
// diagnostics, not computed); unlisted assets are "unclassified".
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng, writePng } from './png.mjs'
import { TOL, RENDERER, SETTLED_FACTOR, summarizeRuns, classify, performance, overall, guard, guardOverall } from './score.mjs'

export { TOL }
const here = path.dirname(fileURLToPath(import.meta.url))
const load = file => { try { const text = readFileSync(file, 'utf8'); return text ? JSON.parse(text) : null } catch { return null } }
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function compareImages(native, browser, nativeOpaque = false) {
  const { width, height } = native, n = width * height
  const diff = new Uint8Array(n * 4)
  let differing = 0, significant = 0, maxDiff = 0, se = 0, nativeCoverage = 0, browserCoverage = 0, coverageMismatch = 0
  const sums = { native: [0, 0, 0], browser: [0, 0, 0] }
  for (let p = 0; p < n; p++) {
    const o = p * 4
    let d = 0
    for (let c = 0; c < 3; c++) { const e = native.data[o + c] - browser.data[o + c]; se += e * e; d = Math.max(d, Math.abs(e)) }
    const nc = nativeOpaque ? native.data[o] + native.data[o + 1] + native.data[o + 2] > 0 : native.data[o + 3] > 0, bc = browser.data[o] + browser.data[o + 1] + browser.data[o + 2] > 0
    if (nc) { nativeCoverage++; for (let c = 0; c < 3; c++) { sums.native[c] += native.data[o + c]; sums.browser[c] += browser.data[o + c] } }
    if (bc) browserCoverage++
    if (nc !== bc) coverageMismatch++
    if (d) differing++
    if (d > TOL) significant++
    maxDiff = Math.max(maxDiff, d)
    if (d > TOL) { diff[o] = Math.min(255, 64 + d * 2); diff[o + 3] = 255 }
    else { const g = Math.floor((native.data[o] + native.data[o + 1] + native.data[o + 2]) / 9); diff[o] = diff[o + 1] = diff[o + 2] = g; diff[o + 3] = 255 }
  }
  const mse = se / (n * 3)
  const mean = s => s.map(v => nativeCoverage ? +(v / nativeCoverage).toFixed(1) : 0)
  return {
    diff,
    stats: { pixels: n, differing, significant, significantPct: +(100 * significant / n).toFixed(2), maxDiff,
      psnr: mse === 0 ? Infinity : +(10 * Math.log10(255 * 255 / mse)).toFixed(2),
      nativeCoverage, browserCoverage, coverageMismatch,
      meanRgbInNativeCoverage: { native: mean(sums.native), browser: mean(sums.browser) } },
  }
}

// native | browser | diff, side by side, for reviewing one asset at a glance.
function strip(images) {
  const { width, height } = images[0], W = width * images.length, data = new Uint8Array(W * height * 4)
  for (let y = 0; y < height; y++) images.forEach((im, k) => data.set(im.data.subarray(y * width * 4, (y + 1) * width * 4), (y * W + k * width) * 4))
  return { width: W, height, data }
}
const opaque = img => { const data = new Uint8Array(img.data); for (let i = 3; i < data.length; i += 4) data[i] = 255; return { ...img, data } }

// browser: the browser capture lit as the reference is (harness.ts):
// usdview's lighting for usdview, usdrecord's frame recorder's
// (frameRecorder.cpp:396-454) for usdrecord. Outputs of runs before the
// second capture existed have only browser.png, which is then used for both.
const references = {
  usdview: { json: 'usdview.json', png: 'usdview.png', browser: 'browser.png', opaque: true, label: 'OpenUSD 26.11.1 usdview (testusdview)' },
  usdrecord: { json: 'native.json', png: 'native.png', browser: 'browser-usdrecord.png', opaque: false, label: 'OpenUSD 26.11.1 usdrecord (alpha dropped)' },
}
/** The browser capture to compare with reference `r` in folder `dir`. */
const browserFor = (dir, r) => existsSync(path.join(dir, r.browser)) ? path.join(dir, r.browser) : path.join(dir, 'browser.png')

export const BROWSER_LABEL = 'typescript-usd viewer (Storm/WebGPU)'

/** Every run of one asset, compared with the scoring reference:
 *  <dir>/runs/storm/<k>/browser.{json,png} (run.mjs --runs), or the single
 *  <dir>/browser.{json,png} of an older run. */
export function collectRuns(dir, scoreRef) {
  const refRecord = load(path.join(dir, scoreRef.json)), refPng = path.join(dir, scoreRef.png)
  const refImage = refRecord?.exit === 0 && existsSync(refPng) ? readPng(refPng) : null
  const runs = []
  const add = (runDir, k) => {
    const browser = load(path.join(runDir, 'browser.json'))
    if (!browser) return
    const png = browserFor(runDir, scoreRef)
    const image = browser.outcome === 'captured' && existsSync(png) ? readPng(png) : null
    const run = { k, outcome: browser.outcome, error: browser.error, uncaught: browser.uncaught, console: browser.console, gpuErrors: browser.gpuErrors,
      diagnostics: browser.diagnostics, timings: browser.timings, playback: browser.playback,
      image: image && { width: image.width, height: image.height }, reference: refImage && { width: refImage.width, height: refImage.height }, browserImage: path.basename(png) }
    if (image && refImage && image.width === refImage.width && image.height === refImage.height) run.significant = compareImages(refImage, image, scoreRef.opaque).stats.significant
    runs.push(run)
  }
  const runsDir = path.join(dir, 'runs', RENDERER)
  if (existsSync(runsDir)) for (const k of readdirSync(runsDir).sort((a, b) => a - b)) add(path.join(runsDir, k), Number(k))
  else if (!existsSync(path.join(dir, 'runs')) && existsSync(path.join(dir, 'browser.json'))) add(dir, 1)
  return { pixels: refImage ? refImage.width * refImage.height : null, runs, reference: refImage ? scoreRef.png : null }
}

export function buildReport({ manifest, manifestPath, out, assets, width, reference = 'usdview', scoreReference = 'usdrecord', requiredRuns = 3, perfBaseline = path.join(here, 'perf-baseline.json') }) {
  const baseline = load(perfBaseline)
  const ref = references[reference], scoreRef = references[scoreReference]
  if (!ref) throw new Error(`unknown reference ${reference}`)
  if (!scoreRef) throw new Error(`unknown score reference ${scoreReference}`)
  const notes = load(path.join(here, 'notes.json'))?.assets ?? {}
  const rows = []
  for (const asset of assets) {
    const dir = path.join(out, asset.id)
    const meta = load(path.join(dir, 'meta.json')) ?? {}
    const native = load(path.join(dir, ref.json))
    const browser = load(path.join(dir, 'browser.json'))
    const row = { id: asset.id, label: asset.label, group: asset.group, source: meta.source ?? asset.path, meta, reference, native, browser, note: notes[asset.id] ?? null }
    const nativePng = path.join(dir, ref.png), browserPng = browserFor(dir, ref)
    const hasNative = native?.exit === 0 && existsSync(nativePng), hasBrowser = browser?.outcome === 'captured' && existsSync(browserPng)
    if (meta.error) row.verdict = `prepare failed: ${meta.error}`
    else if (!native) row.verdict = 'native not run'
    else if (!hasNative) row.verdict = native.timedOut ? 'native timed out' : `native failed (exit ${native.exit})`
    else if (!browser) row.verdict = 'browser not run'
    else if (!hasBrowser) row.verdict = `browser ${browser.outcome}`
    if (hasNative) writePng(path.join(dir, 'native-opaque.png'), opaque(readPng(nativePng)))
    if (hasBrowser) {
      // Every available reference, for reading the two side by side.
      row.statsByReference = {}
      for (const [name, r] of Object.entries(references)) {
        const file = path.join(dir, r.png), record = load(path.join(dir, r.json))
        if (record?.exit !== 0 || !existsSync(file)) continue
        const a = readPng(file), b = readPng(browserFor(dir, r))
        if (a.width === b.width && a.height === b.height) row.statsByReference[name] = compareImages(a, b, r.opaque).stats
      }
    }
    if (hasNative && hasBrowser) {
      const a = readPng(nativePng), b = readPng(browserPng)
      if (a.width !== b.width || a.height !== b.height) row.verdict = `size mismatch: native ${a.width}x${a.height}, browser ${b.width}x${b.height}`
      else {
        const { diff, stats } = compareImages(a, b, ref.opaque)
        writePng(path.join(dir, 'diff.png'), { width: a.width, height: a.height, data: diff })
        writePng(path.join(dir, 'strip.png'), strip([opaque(a), b, { ...a, data: diff }]))
        row.stats = stats
        row.verdict = stats.significant === 0 ? 'match' : `${stats.significantPct}% differ`
      }
    }
    // The comparison with native OpenUSD (score.mjs).
    const collected = collectRuns(dir, scoreRef)
    const summary = collected.runs.length ? summarizeRuns(collected.runs) : null
    row.scoring = { summary, pixels: collected.pixels,
      classification: classify({ summary, pixels: collected.pixels, requiredRuns }), performance: performance(summary),
      guard: guard({ summary, baseline: baseline?.assets?.[asset.id], spec: asset.guard }) }
    rows.push(row)
  }
  const scoring = { reference: scoreReference, requiredRuns, ...overall(rows.map(r => r.scoring)),
    guard: { ...guardOverall(rows.map(r => r.scoring)), baseline: baseline ? { file: perfBaseline, renderer: baseline.renderer, commit: baseline.commit, recorded: baseline.recorded, runs: baseline.runs } : null } }
  const rank = row => row.stats ? 2 : row.verdict.startsWith('browser') ? 0 : 1
  rows.sort((a, b) => rank(a) - rank(b) || (b.stats?.significant ?? 0) - (a.stats?.significant ?? 0))
  const summary = {
    generatedAt: new Date().toISOString(), manifest: manifestPath, width, tolerance: TOL,
    reference,
    native: { usdRoot: rows.find(r => r.native)?.native.usdRoot, command: rows.find(r => r.native?.command)?.native.command ?? `${reference} --camera /AcceptanceCam` },
    browser_renderer: BROWSER_LABEL,
    browser: { userAgent: rows.find(r => r.browser?.userAgent)?.browser.userAgent, adapter: rows.find(r => r.browser?.adapter)?.browser.adapter },
    counts: { assets: rows.length, compared: rows.filter(r => r.stats).length, matching: rows.filter(r => r.verdict === 'match').length },
    scoring,
  }
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ summary, rows }, (k, v) => v === Infinity ? 'Infinity' : v, 1))
  writeFileSync(path.join(out, 'report.html'), html(summary, rows))
  return { summary, rows }
}

/** One line per asset and the overall verdict, for the console. */
export function printScoring(summary, rows) {
  const s = summary.scoring, ms = v => v == null ? '-' : String(Math.round(v))
  const cell = x => !x ? '-' : x.failures.length ? `FAIL(${x.failures.length})` : `${x.median}±${x.spread}/${x.runs}`
  console.log(`${'asset'.padEnd(22)} ${'median px'.padStart(16)} ${'band'.padStart(6)} ${'diag'.padStart(5)} ${'settled ms'.padStart(10)} ${'cpu ms'.padStart(7)} ${'p95 ms'.padStart(7)}  verdict`)
  for (const r of rows) {
    const c = r.scoring.classification, p = r.scoring.performance
    console.log(`${r.id.padEnd(22)} ${cell(r.scoring.summary).padStart(16)} ${String(c.band ?? '-').padStart(6)} ${String(r.scoring.summary?.diagnostics ?? '-').padStart(5)} ${ms(p.settledMs).padStart(10)} ${ms(p.lastFrameCpuMs).padStart(7)} ${ms(p.playbackP95Ms).padStart(7)}  ${c.verdict}${c.reasons.length ? ` (${c.reasons.join('; ')})` : ''}`)
  }
  console.log(`${s.verdict}: ${s.matches} matches, ${s.differs} differs, ${s.fails} fails, ${s.incomplete} incomplete; total significant px ${s.totalSignificant} against ${s.reference}`)
  for (const r of rows) for (const c of r.scoring.guard?.checks ?? []) if (c.pass !== true)
    console.log(`  guard ${r.id} ${c.name}: ${ms(c.cand)} ms against a limit of ${ms(c.limit)} (baseline ${ms(c.base)}): ${c.pass === false ? 'FAILS' : 'not measured'}`)
  console.log(`performance guard: ${s.guard.verdict} (${s.guard.guarded} assets guarded, ${s.guard.failed} failed, ${s.guard.incomplete} incomplete)${s.guard.baseline ? ` against ${s.guard.baseline.renderer} at ${s.guard.baseline.commit}` : ''}`)
}

function diagList(title, items) {
  if (!items?.length) return `<p class=muted>${esc(title)}: none</p>`
  return `<details><summary>${esc(title)} (${items.length})</summary><ul>${items.map(i => `<li><code>${esc(i)}</code></li>`).join('')}</ul></details>`
}

// The comparison with native OpenUSD: the overall counts, the per-asset
// table and the measured performance.
function scoringHtml(scoring, rows) {
  const n = v => v === null || v === undefined ? '' : Math.round(v).toLocaleString('en-US')
  const runsCell = s => !s ? '<span class=muted>not run</span>' : s.failures.length ? `<b>${s.failures.length} failed</b> <span class=muted>${esc(s.failures[0])}</span>` : `${n(s.median)} <span class=muted>±${n(s.spread)} · ${s.runs} run${s.runs > 1 ? 's' : ''}</span>`
  const ordered = [...rows].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.id.localeCompare(b.id))
  const table = ordered.map(r => { const c = r.scoring.classification, p = r.scoring.performance
    return `<tr><td><a href="#${esc(r.id)}">${esc(r.id)}</a></td><td>${esc(r.group)}</td><td class=num>${runsCell(r.scoring.summary)}</td><td class=num>${n(c.band)}</td>
<td class=num>${n(r.scoring.summary?.diagnostics)}</td><td class=num>${n(p.settledMs)}</td><td class=num>${n(p.lastFrameCpuMs)}</td><td class=num>${n(p.playbackP95Ms)}</td>
<td class="${esc(c.verdict)}">${esc(c.verdict)}</td><td class=muted>${esc(c.reasons.join('; '))}</td><td>${guardCell(r.scoring.guard)}</td></tr>` }).join('\n')
  const g = scoring.guard
  return `<h2>Comparison with native OpenUSD: <span class="${scoring.allMatch ? 'matches' : scoring.fails ? 'fails' : scoring.differs ? 'differs' : 'incomplete'}">${esc(scoring.verdict)}</span></h2>
<p>packages/usd/docs/imaging-i2.md, "Decision: one faithful implementation, no backup renderer" (November 5, 2026): the viewer renders only through the faithful Storm port, compared with native OpenUSD only. The set runs ${scoring.requiredRuns} times; an asset scores the median count of pixels more than ${TOL}/255 from <b>${esc(scoring.reference)}</b>, with the spread over runs. <b>matches</b>: median within 0.1 % of the image; <b>differs</b>: above that; <b>fails</b>: a hard failure in any run (crash, timeout, no image, size mismatch, uncaught error, WebGPU validation error raised on the device); <b>incomplete</b>: fewer than ${scoring.requiredRuns} runs or no reference. Diagnostics are reported, not gated; timings are checked by the performance guard below.</p>
<p>${scoring.matches} matches · ${scoring.differs} differs · ${scoring.fails} fails · ${scoring.incomplete} incomplete, of ${scoring.assets} assets. Total significant px: ${n(scoring.totalSignificant)}.</p>
<table><tr><th>asset</th><th>group</th><th>${esc(BROWSER_LABEL)} median px</th><th>band</th><th>diag.</th><th>settled ms</th><th>last frame CPU ms</th><th>playback p95 ms</th><th>verdict</th><th>reasons</th><th>performance guard</th></tr>
${table}</table>
<p class=muted>Timings are medians over runs: settled is until two identical captures; last frame CPU is the CPU time of the last frame; playback p95 is the 95th percentile frame time over the stage's time codes (assets with "guard": {"playback": true}).</p>
<h3>Performance guard: <span class="${g.verdict === 'passes' ? 'matches' : g.verdict === 'fails' ? 'fails' : 'incomplete'}">${esc(g.verdict)}</span></h3>
<p>imaging-i2.md section 1.3 (adopted November 5, 2026; it gates the final switch): settled time at most ${SETTLED_FACTOR}x the baseline's per asset; last-frame CPU time at most the manifest's guard factor for guarded assets; BrainStem playback at least as smooth (p95 frame time within the baseline's plus 3x the larger run-to-run spread). ${g.baseline ? `Baseline: ${esc(g.baseline.renderer)} at ${esc(g.baseline.commit)}, ${esc(g.baseline.runs)} runs recorded ${esc(g.baseline.recorded)} (${esc(path.basename(g.baseline.file))}).` : 'No baseline file: the guard is not evaluated.'} ${g.guarded} assets guarded, ${g.failed} failed, ${g.incomplete} incomplete. Timings depend on the machine and its load; the baseline is comparable only with runs on the machine that recorded it.</p>`
}

function guardCell(g) {
  if (!g?.checks.length) return `<span class=muted>${esc(g?.reason ?? '')}</span>`
  const n = v => v == null ? '-' : Math.round(v).toLocaleString('en-US')
  return `<span class="${g.pass === true ? 'matches' : g.pass === false ? 'fails' : 'incomplete'}">${g.pass === true ? 'passes' : g.pass === false ? 'fails' : 'incomplete'}</span> <span class=muted>${g.checks.map(c => `${esc(c.name)} ${n(c.cand)} / ${n(c.limit)}${c.pass === false ? ' ✗' : ''}`).join('; ')}</span>`
}

function html(summary, rows) {
  // The browser the captures came from (run.mjs --browser), by its user agent.
  const browserName = /\bChrome\//.test(summary.browser.userAgent ?? '') ? 'Chrome' : 'Safari'
  const ms = v => v === undefined || v === null ? '' : Math.round(v).toLocaleString('en-US')
  const table = rows.map(r => {
    const b = r.browser ?? {}, s = r.stats
    const bDiag = (b.diagnostics?.length ?? 0) + (b.console?.length ?? 0) + (b.uncaught?.length ?? 0)
    return `<tr><td><a href="#${esc(r.id)}">${esc(r.id)}</a><br><span class=muted>${esc(r.label)}</span></td><td>${esc(r.verdict)}</td>
<td class=num>${s ? `${s.significantPct}% (${s.significant.toLocaleString('en-US')})` : ''}</td><td class=num>${s ? s.psnr : ''}</td><td class=num>${s ? s.maxDiff : ''}</td>
<td class=num>${ms(r.native?.wallMs)}</td><td class=num>${ms(b.timings?.openMs)} / ${ms(b.timings?.settledMs)}</td>
<td class=num>${r.native?.diagnostics?.length ?? ''} / ${b.outcome ? bDiag : ''}</td>
<td>${esc(r.note?.class ?? 'unclassified')}</td><td>${esc(r.note?.summary ?? '')}</td></tr>`
  }).join('\n')
  const sections = rows.map(r => {
    const b = r.browser ?? {}, s = r.stats
    const img = (file, label) => `<figure><img src="${esc(r.id)}/${file}" width=256 height=256 alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>`
    return `<section id="${esc(r.id)}"><h3>${esc(r.label)} <span class=muted>(${esc(r.id)})</span></h3>
<p class=muted>${esc(r.source)}${r.meta?.time !== undefined ? ` · time ${r.meta.time}` : ''} · up ${esc(r.meta?.upAxis)} · bounds ${esc(JSON.stringify(r.meta?.boundsMin))}–${esc(JSON.stringify(r.meta?.boundsMax))}</p>
<div class=figs>${img('native-opaque.png', references[summary.reference].label)}${img('browser.png', `${summary.browser_renderer}, ${browserName}`)}${s ? img('diff.png', `difference > ${TOL} levels in red`) : ''}</div>
${r.scoring ? `<p>Against native OpenUSD: <b>${esc(r.scoring.classification.verdict)}</b>${r.scoring.classification.reasons.length ? ` (${esc(r.scoring.classification.reasons.join('; '))})` : ''}; runs scored against ${esc(summary.scoring.reference)}: ${esc(JSON.stringify(r.scoring.summary?.counts ?? []))}${r.scoring.summary?.failures.length ? ` failures ${esc(r.scoring.summary.failures.join('; '))}` : ''}.</p>` : ''}
<p><b>${esc(r.verdict)}</b>${s ? ` · ${s.significant.toLocaleString('en-US')} of ${s.pixels.toLocaleString('en-US')} pixels differ by more than ${TOL} levels (${s.differing.toLocaleString('en-US')} at all); max ${s.maxDiff}; PSNR ${s.psnr} dB; coverage native ${s.nativeCoverage.toLocaleString('en-US')} / browser ${s.browserCoverage.toLocaleString('en-US')} (mismatch ${s.coverageMismatch.toLocaleString('en-US')}); mean RGB in native coverage ${JSON.stringify(s.meanRgbInNativeCoverage.native)} vs ${JSON.stringify(s.meanRgbInNativeCoverage.browser)}` : ''}</p>
${r.note ? `<p>Gap class: <b>${esc(r.note.class)}</b>. ${esc(r.note.detail ?? r.note.summary ?? '')}</p>` : ''}
<p>Native: exit ${esc(r.native?.exit)}, ${ms(r.native?.wallMs)} ms wall (python start, open, render, write). Browser: ${esc(b.outcome)}${b.error ? ` <code>${esc(b.error.split('\n')[0])}</code>` : ''}; timings ${esc(JSON.stringify(b.timings ?? {}))}; captures until stable ${esc(b.capturesUntilStable)}</p>
${diagList('Native diagnostics (usdrecord stderr)', r.native?.diagnostics?.map(d => `${d.count}× ${d.message}`))}
${diagList('Viewer diagnostics', b.diagnostics?.map(d => `${d.severity}: ${d.message}`))}
${diagList('Browser console warnings/errors', b.console?.map(c => `${c.count}× ${c.level}: ${c.message}`))}
${diagList('Uncaught errors', b.uncaught)}
${diagList('Viewer status messages', b.statuses)}
${diagList('Viewer load spans (usdview:* performance.measure, ms)', Object.entries(b.measures ?? {}).map(([k, v]) => `${k}: ${v}`))}
</section>`
  }).join('\n')
  return `<!doctype html><html lang=en><head><meta charset=utf-8><title>typescript-usd browser asset acceptance</title>
<style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:24px;max-width:1200px;color:#222}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top;text-align:left}
.num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#777;font-size:12px}figure{display:inline-block;margin:0 8px 0 0}figure img{background:#000;image-rendering:pixelated}figcaption{font-size:12px;color:#555}
section{border-top:1px solid #ccc;margin-top:18px}.matches{color:#0a6b2d;font-weight:600}.differs{color:#8a5a00;font-weight:600}.fails{color:#b00020;font-weight:600}.incomplete{color:#777}code{font-size:12px;white-space:pre-wrap}details{margin:2px 0}</style></head><body>
<h1>typescript-usd browser asset acceptance</h1>
<p>Reference: <b>${esc(summary.reference)}</b>; browser renderer: <b>${esc(summary.browser_renderer)}</b>.</p>
<p>Each asset is subLayered unchanged under a camera <code>/AcceptanceCam</code> framing its bounds, rendered by OpenUSD 26.11.1 <code>${esc(summary.native.command)}</code> (${esc(summary.native.usdRoot)}) and by the typescript-usd viewer runtime (Storm/WebGPU) in ${browserName} at the same size and camera, then compared on RGB.
${summary.counts.matching} of ${summary.counts.compared} compared assets match within ${TOL}/255 (${summary.counts.assets} assets in the run). Generated ${esc(summary.generatedAt)}.</p>
<p class=muted>Browser: ${esc(summary.browser.userAgent)} · adapter ${esc(JSON.stringify(summary.browser.adapter ?? null))}. Settings matched: camera light, scene lights, default material specular 0.1 and ambient ${esc(rows.find(r => r.browser?.settings)?.browser.settings.materialAmbient)} (usdview's default; the usdrecord comparison uses the capture with usdrecord's lighting state, whose camera light adds ambient 0.01; see run.mjs), dome light camera visibility off, complexity low (1.0), purposes default+proxy, stage start time code, payloads loaded before the first frame, black background. Not matched or not controllable: ${esc((load(path.join(here, 'notes.json'))?.harness ?? []).filter(h => !h.startsWith('Signing off')).join(' '))}</p>
${scoringHtml(summary.scoring, rows)}
<h2>Latest run against the ${esc(summary.reference)} reference</h2>
<table><tr><th>asset</th><th>verdict</th><th>px &gt;${TOL}</th><th>PSNR dB</th><th>max</th><th>native ms</th><th>browser open / settled ms</th><th>diag. native / browser</th><th>gap class</th><th>note</th></tr>
${table}</table>
${sections}
</body></html>
`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] }
  const manifestPath = path.resolve(option('--manifest', path.join(here, 'assets.json')))
  const out = path.resolve(option('--out', path.join(here, 'out')))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const assets = manifest.groups.flatMap(group => group.assets.map(asset => ({ ...asset, group: group.id }))).filter(a => existsSync(path.join(out, a.id)))
  const { rows, summary } = buildReport({ manifest, manifestPath, out, assets, width: Number(option('--width', 512)), reference: option('--reference', 'usdview'),
    scoreReference: option('--score-reference', 'usdrecord'), requiredRuns: Number(option('--runs', 3)), perfBaseline: path.resolve(option('--perf-baseline', path.join(here, 'perf-baseline.json'))) })
  printScoring(summary, rows)
}
