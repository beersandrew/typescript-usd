// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp,
//  pxr/imaging/hdSt/testenv/testHdStShaders.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp
// Copyright 2021, 2023, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Imaging status ledger: turns the runners' results (see run.mjs) into
// packages/usd/docs/imaging-status.json and imaging-status.md. Tooling only
// (no upstream OpenUSD counterpart).
//
// Rows: one per image of an upstream image test (or per check, for the
// suites that compare buffers rather than images: hdst-gpu, tessellator) and
// one per asset of the asset acceptance. Each failing row gets a cause from
// classification.json (first matching rule; "unclassified" when none), with
// the cause's FAITHFULNESS-DEBT / PLATFORM-DIVERGENCE tags and owner. The JSON keeps one row per
// line, sorted, without timestamps beyond each section's run date, so that
// `git diff` of two runs shows what changed.
//
// Browsers: Safari's rows are imaging-status.json; Chrome's (run.mjs
// --browser chrome) are imaging-status-chrome.json, the same shape, whose
// sections also carry the Chrome version and WebGPU adapter. A run rebuilds
// both ledgers (the other browser's rows as they are, reclassified), and
// imaging-status.md shows Safari's rows and, when Chrome's ledger exists, a
// Chrome section: its summary, its causes and every row whose result differs
// from Safari's. A classification rule with "browser" applies to that
// browser's rows only.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const load = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
const pct = fraction => typeof fraction === 'number' ? +(fraction * 100).toFixed(3) : null
// The code-comment tag of a debt id (FAITHFULNESS-DEBT or PLATFORM-DIVERGENCE),
// from the generated ledger docs/faithfulness-debt.json.
const debtTags = load(path.join(here, '../../../docs/faithfulness-debt.json'))?.ids ?? {}
const marker = id => `${debtTags[id]?.tag ?? 'FAITHFULNESS-DEBT'}(${id})`
const firstLine = text => text == null ? null : String(text).split('\n')[0].slice(0, 240)

// --- per-suite parsers: results.json -> rows {test, image, result, ...} ---
function imageRow(test, image, c) {
  if (!c) return { test, image, result: 'error', error: 'no comparison' }
  const failed = c.error ? 'error' : c.pass ? 'pass' : 'fail'
  return {
    test, image, result: failed,
    differingPx: c.differingPixels ?? null, differingPct: pct(c.fraction), overTolerancePx: c.pixelsOverTolerance ?? null, maxDiff: c.maxDiff ?? null,
    ...(c.error ? { error: firstLine(c.error) } : {}),
  }
}
const notRunRows = (notRun, imageOf = () => '') => (notRun ?? []).map(n => ({ test: n.name, image: imageOf(n.name), result: 'not run', error: firstLine(n.reason) }))

const PARSERS = {
  'depth-bias': r => r.exception ? [{ test: 'testHdStDepthBias', image: '', result: 'error', error: firstLine(r.exception) }]
    : r.comparisons.map(c => imageRow('testHdStDepthBias', `testHdStDepthBias_${c.name}.png`, c)),
  textures: r => [
    ...(r.exception ? [{ test: '(page)', image: '', result: 'error', error: firstLine(r.exception) }] : []),
    ...r.comparisons.map(c => imageRow(c.test, c.name, c)),
  ],
  'lighting-shaders': r => r.exception ? [{ test: 'testHdStShaders (no scene materials)', image: '', result: 'error', error: firstLine(r.exception) }]
    : r.comparisons.map(c => imageRow('testHdStShaders (no scene materials)', `${c.name}.png`, c)),
  'lighting-simple': r => r.exception ? [{ test: 'testHdStSimpleLighting', image: '', result: 'error', error: firstLine(r.exception) }]
    : r.comparisons.map(c => imageRow('testHdStSimpleLighting', `${c.name}.png`, c)),
  'basic-drawing': (r, ctx) => [...r.results.map(x => imageRow(x.name, ctx.imageOf(x.name), x)), ...notRunRows(r.notRun, ctx.imageOf)],
  curves: (r, ctx) => [...r.results.map(x => imageRow(x.name, ctx.imageOf(x.name), x)), ...notRunRows(r.notRun, ctx.imageOf)],
  'usdimaging-gl': usdImagingRows,
  'usdimaging-gl-materialx': usdImagingRows,
  'usdimaging-gl-nurbs-tetmesh': usdImagingRows,
  'usdimaging-gl-velocity-motion': usdImagingRows,
  'hdst-gpu': r => [
    ...(r.tests?.results ?? []).map(t => ({ test: t.name, image: '', result: t.pass ? 'pass' : 'fail', ...(t.error ? { error: firstLine(t.error) } : {}) })),
    ...(r.testHdStSubdivision?.calls ?? []).map(c => ({ test: 'testHdStSubdivision', image: c.label, result: c.pass ? 'pass' : 'fail',
      ...(c.pass ? {} : { error: firstLine(c.exception ?? (c.counterFailures?.length ? c.counterFailures.join('; ') : 'output differs from the baseline')) }) })),
  ],
  tessellator: r => (r.results ?? []).map(t => ({ test: 'HgiWebGPU tessellator kernels', image: t.config, result: t.mismatches.length ? 'fail' : 'pass',
    ...(t.mismatches.length ? { error: firstLine(t.mismatches[0]) } : {}) })),
  hdx: hdxRows,
  'hdst-programs': genericRows,
}
function usdImagingRows(r) {
  const rows = []
  for (const t of r.results) {
    if (t.status === 'timeout') { rows.push({ test: t.name, image: '', result: 'error', error: 'timeout' }); continue }
    if (!t.comparisons?.length) { rows.push({ test: t.name, image: '', result: 'error', error: firstLine(t.exception) ?? 'no images declared' }); continue }
    for (const c of t.comparisons) {
      const row = imageRow(t.name, c.image, c)
      if (t.exception && row.result !== 'pass' && !row.error) row.error = firstLine(t.exception)
      if (t.exception && row.result === 'pass') { row.result = 'fail'; row.error = firstLine(t.exception) }
      rows.push(row)
    }
  }
  return [...rows, ...notRunRows(r.notRun)]
}
// tests/browser/hdx-image: one record per test program, with its images, the
// images native wrote that ours did not, its exit status and stdout.
function hdxRows(r) {
  const rows = []
  for (const t of r.results) {
    const other = [t.exception && firstLine(t.exception), t.status !== t.nativeStatus && t.nativeStatus != null ? `exit ${t.status} vs native ${t.nativeStatus}` : null,
      t.stdoutMatchesNative === false ? 'stdout differs from native' : null].filter(Boolean).join('; ')
    for (const c of t.images) {
      const row = imageRow(t.test, c.image, c)
      if (other && row.result === 'pass' && !t.pass) { row.result = 'fail'; row.error = other }
      else if (other && !row.error && row.result !== 'pass') row.error = other
      rows.push(row)
    }
    for (const m of t.missingImages ?? []) rows.push({ test: t.test, image: m, result: 'error', error: `not written${other ? `; ${other}` : ''}` })
    if (!t.images.length && !(t.missingImages ?? []).length) rows.push({ test: t.test, image: '', result: t.pass ? 'pass' : 'fail', ...(other ? { error: other } : {}) })
  }
  return [...rows, ...notRunRows(r.notRun)]
}
// A runner that follows basic-drawing's format, with per-test comparisons
// (storm-image/hdst-programs): one row per registered image; a test with no
// images is one row; a test that failed on its exit status or an exception
// while its images pass fails on its rows, with the reason.
function genericRows(r) {
  return [...(r.results ?? []).flatMap(x => {
    if (!x.comparisons) return [imageRow(x.name, x.image ?? '', x)]
    const other = [x.exception && firstLine(x.exception), x.status != null && x.nativeStatus != null && x.status !== x.nativeStatus ? `exit ${x.status} vs native ${x.nativeStatus}` : null].filter(Boolean).join('; ')
    if (!x.comparisons.length) return [{ test: x.name, image: '', result: x.pass === false ? 'fail' : 'pass', ...(other ? { error: other } : {}) }]
    return x.comparisons.map(c => {
      const row = imageRow(x.name, c.image ?? c.name, c)
      if (x.pass === false && row.result === 'pass') { row.result = 'fail'; row.error = other || 'test failed' }
      else if (other && row.result !== 'pass' && !row.error) row.error = other
      return row
    })
  }), ...notRunRows(r.notRun)]
}

// A runner that hung or was killed writes no results.json; the per-test
// lines it printed (basic-drawing, curves: "pass|FAIL <test> over 2: N px,
// differing P%, max M") are kept, and the run is recorded as stopped.
function salvage(suite, run, logFile, ctx) {
  const why = `${run.timedOut ? 'timed out' : run.exit == null ? 'killed' : `exit ${run.exit}`}; no results.json (see runner.log)`
  const rows = []
  let text = ''
  try { text = readFileSync(logFile, 'utf8') } catch {}
  for (const m of text.matchAll(/^\s*(pass|FAIL) (\S+)\s+(?:over \d+: (\d+) px, differing ([\d.]+)%, max (\d+)|(.*))$/gm)) {
    rows.push({ test: m[2], image: ctx.imageOf(m[2]), result: m[1] === 'pass' ? 'pass' : m[3] == null ? 'error' : 'fail',
      differingPx: null, differingPct: m[4] != null ? Number(m[4]) : null, overTolerancePx: m[3] != null ? Number(m[3]) : null, maxDiff: m[5] != null ? Number(m[5]) : null,
      ...(m[6] ? { error: firstLine(m[6]) } : {}), salvagedFromLog: true })
  }
  rows.push({ test: '(suite)', image: '', result: 'error', error: rows.length ? `stopped after ${rows.length} tests: ${why}` : why })
  return rows
}

// --- assets: the harness's report.json -> rows ---
const VERDICT = { matches: 'pass', differs: 'fail', fails: 'error', incomplete: 'incomplete' }
function assetRows(report, scoreRef) {
  return report.rows.map(row => {
    const s = row.scoring?.summary, c = row.scoring?.classification, pixels = row.scoring?.pixels
    const ref = row.statsByReference?.[scoreRef]
    const nativeFailed = row.native && row.native.exit !== 0
    return {
      id: row.id, group: row.group, source: row.source,
      result: VERDICT[c?.verdict] ?? 'incomplete',
      medianPx: s?.median ?? null, medianPct: s?.median != null && pixels ? +(100 * s.median / pixels).toFixed(3) : null,
      spreadPx: s?.spread ?? null, runs: s?.runs ?? 0, maxDiff: ref?.maxDiff ?? null,
      ...(c?.reasons?.length && c.verdict !== 'matches' ? { error: firstLine(c.reasons.join('; ')) } : {}),
      ...(nativeFailed ? { native: row.native.timedOut ? 'timed out' : row.native.signal ? `crashed (${row.native.signal})` : `exit ${row.native.exit}` } : {}),
      ...(row.meta?.openFailed ? { openFailedInReference: true } : {}),
    }
  })
}

// An asset inside this repository (a harness fixture) is recorded relative to
// the repository root, so the ledger does not name the checkout or worktree a run
// happened in. Rows carried from an earlier run elsewhere are re-rooted when the
// same file exists here. An asset outside the repository is recorded as the
// asset manifests write it, ROOT/relative path, for the manifest root
// (assets.json roots, resolved as run.mjs resolves them) that holds it.
function manifestRoots(pkg) {
  const dir = path.resolve(pkg, '../../apps/usdview/scripts/asset-acceptance')
  const roots = new Map()
  for (const file of ['assets.json', 'assets-corpus.json']) {
    for (const [name, value] of Object.entries(load(path.join(dir, file))?.roots ?? {})) {
      roots.set(name, path.resolve(dir, (process.env[name] ?? value).replace(/^~(?=$|\/)/, homedir())))
    }
  }
  return roots
}
function repoSource(pkg, source) {
  if (typeof source !== 'string' || !path.isAbsolute(source)) return source
  const root = path.resolve(pkg, '../..'), rel = path.relative(root, source)
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/')
  const m = /\/((?:apps|packages)\/.+)$/.exec(source)
  if (m && existsSync(path.join(root, m[1]))) return m[1]
  for (const [name, dir] of manifestRoots(pkg)) {
    if (name !== 'FIXTURES' && source.startsWith(dir + path.sep)) {
      return `${name}/${path.relative(dir, source).split(path.sep).join('/')}`
    }
  }
  return source
}

// --- classification ---
function classifier(classification, browser) {
  const rules = (classification.rules ?? []).filter(r => !r.browser || r.browser === browser).map(r => ({ ...r, re: new RegExp(`^(?:${r.match})`) }))
  return (key, row) => {
    if (row.result === 'pass') return {}
    if (row.result === 'not run') return {}
    // A rule may also bound the row's largest channel difference (maxDiffAtMost).
    const rule = rules.find(r => r.re.test(key) && (r.maxDiffAtMost == null || (row.maxDiff != null && row.maxDiff <= r.maxDiffAtMost)))
    if (!rule) return { cause: 'unclassified' }
    const cause = classification.causes[rule.cause]
    if (!cause) throw new Error(`classification.json: rule ${rule.match} names unknown cause ${rule.cause}`)
    return { cause: rule.cause, ...(cause.debt?.length ? { debt: cause.debt } : {}), ...(cause.owner ? { owner: cause.owner } : {}) }
  }
}

// --- the never-run list ---
function neverRun({ pkg, testRows, classification }) {
  const manifest = load(path.join(pkg, 'pxr/testing/upstreamTestManifest.json')).tests
  const registrations = manifest.filter(t => t.imageDiffCompare?.length)
  const captureDirs = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      if (!statSync(p).isDirectory() || name === 'node_modules') continue
      if (/^(testenvImages|materialXImages|textureImages|nurbsTetMeshImages|velocityMotionImages)$/.test(name) && /\/tests\/fixtures$/.test(dir)) captureDirs.push(p)
      else walk(p)
    }
  }
  walk(path.join(pkg, 'pxr'))
  const captured = t => t.imageDiffCompare.some(img =>
    captureDirs.some(d => existsSync(path.join(d, t.name, img))) ||
    existsSync(path.join(pkg, 'pxr/imaging/hdSt/tests/fixtures/depthBiasImages', img)))
  const ran = new Set(testRows.filter(r => r.result !== 'not run').map(r => r.test))
  const skipped = new Map(testRows.filter(r => r.result === 'not run').map(r => [r.test, `${r.section}: ${r.error}`]))
  const notes = (classification.neverRun ?? []).map(n => ({ ...n, re: new RegExp(`^(?:${n.match})`) }))
  const rows = []
  for (const t of registrations) {
    if (ran.has(t.name)) continue
    const capture = captured(t)
    const category = skipped.has(t.name) ? 'runner skips it' : capture ? 'captured, no runner' : 'no capture'
    const note = notes.find(n => n.re.test(t.name))
    rows.push({ name: t.name, library: t.library, registered: t.cmake, images: t.imageDiffCompare.length, capture, category,
      ...(skipped.has(t.name) ? { reason: skipped.get(t.name) } : note ? { reason: note.reason } : {}) })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { registrations: registrations.length, ran: registrations.filter(t => ran.has(t.name)).length, rows }
}

// --- output ---
const lines = rows => rows.length ? `[\n${rows.map(r => `  ${JSON.stringify(r)}`).join(',\n')}\n ]` : '[]'
function writeJson(file, ledger) {
  const runs = Object.entries(ledger.runs).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
  const text = `{
 "comment": ${JSON.stringify(ledger.comment)},
 "generatedBy": ${JSON.stringify(ledger.generatedBy)},
 "tolerance": ${JSON.stringify(ledger.tolerance)},
 "sections": {\n${runs}\n },
 "summary": {
  "bySection": {\n${Object.entries(ledger.summary.bySection).map(([k, v]) => `   ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n  },
  "byCause": ${JSON.stringify(ledger.summary.byCause)},
  "byClass": ${JSON.stringify(ledger.summary.byClass)},
  "neverRun": ${JSON.stringify(ledger.summary.neverRun)}
 },
 "tests": ${lines(ledger.tests)},
 "assets": ${lines(ledger.assets)},
 "neverRun": {
  "registrations": ${ledger.neverRun.registrations},
  "ran": ${ledger.neverRun.ran},
  "rows": ${lines(ledger.neverRun.rows).replace(/\n {2}/g, '\n   ')}
 }
}
`
  writeFileSync(file, text)
}

const count = (rows, key) => rows.reduce((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m }, {})
function summarize(tests, assets, neverRunList, classification) {
  const bySection = {}
  for (const r of [...tests, ...assets]) {
    const s = bySection[r.section] ??= { tests: new Set(), rows: 0, pass: 0, fail: 0, error: 0, incomplete: 0, 'not run': 0 }
    s.rows++; s[r.result]++
    s.tests.add(r.test ?? r.id)
  }
  for (const s of Object.values(bySection)) { s.tests = s.tests.size; for (const k of ['fail', 'error', 'incomplete', 'not run']) if (!s[k]) delete s[k] }
  const failing = [...tests, ...assets].filter(r => r.result !== 'pass' && r.result !== 'not run')
  const byCause = Object.fromEntries(Object.entries(count(failing, r => r.cause ?? 'unclassified')).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
  // The failing rows by class (classification.json "classes"; each cause
  // names its class), image tests and assets apart.
  const classOf = r => classification.causes[r.cause]?.class ?? 'unclassified'
  const byClass = rows => {
    const m = {}
    for (const r of rows) { const c = m[classOf(r)] ??= { rows: 0, causes: {} }; c.rows++; c.causes[r.cause ?? 'unclassified'] = (c.causes[r.cause ?? 'unclassified'] ?? 0) + 1 }
    const order = Object.keys(classification.classes ?? {})
    const rank = k => { const i = order.indexOf(k); return i < 0 ? order.length : i }
    return Object.fromEntries(Object.entries(m).sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([k, v]) => [k, { rows: v.rows, causes: Object.fromEntries(Object.entries(v.causes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) }]))
  }
  const failingTests = failing.filter(r => !r.section.startsWith('assets-')), failingAssets = failing.filter(r => r.section.startsWith('assets-'))
  return {
    bySection, byCause,
    byClass: { tests: { pass: tests.filter(r => r.result === 'pass').length, run: tests.filter(r => r.result !== 'not run').length, ...byClass(failingTests) },
      assets: { pass: assets.filter(r => r.result === 'pass').length, run: assets.length, ...byClass(failingAssets) } },
    neverRun: count(neverRunList.rows, r => r.category),
  }
}

// The class summary: one line each for image tests and assets, as the
// README's Tests table gives them.
function classLines(summary, classification) {
  const line = (name, c) => {
    const parts = Object.entries(c).filter(([k]) => k !== 'pass' && k !== 'run').map(([k, v]) => {
      const label = classification.classes?.[k]?.label ?? 'not classified'
      return `${v.rows} ${label} (${Object.entries(v.causes).map(([cause, n]) => `${cause} ${n}`).join(', ')})`
    })
    return `- ${name}: ${c.pass} of ${c.run} run pass${parts.length ? '; ' + parts.join('; ') : ''}.`
  }
  return [line('Image tests', summary.byClass.tests), line('Assets', summary.byClass.assets)]
}

function classTable(classification) {
  const out = ['| class | meaning |', '|---|---|']
  for (const [k, c] of Object.entries(classification.classes ?? {})) out.push(`| ${k}: ${esc(c.label)} | ${esc(c.description)} |`)
  return out
}

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
function writeMarkdown(file, ledger, classification, sectionOrder, chrome) {
  const { summary } = ledger
  const out = []
  out.push('# Imaging status')
  out.push('')
  out.push('Generated by `packages/usd/tests/browser/imaging-status/run.mjs` (do not edit by hand; causes come from `tests/browser/imaging-status/classification.json`).')
  out.push('Every Safari image suite of the repo and the viewer asset acceptance, compared with native OpenUSD 26.11.1:')
  out.push(`image tests under the I-1 tolerance (every channel within ${ledger.tolerance.channel}/255 and at most ${ledger.tolerance.maxFraction * 100}% of pixels differing at all; imaging-i1.md section 6.3),`)
  out.push('assets under the asset-acceptance score (median significant pixels over the runs within 0.1% of the image, against usdrecord; imaging-i2.md 1.3).')
  out.push('"differing" is pixels with any channel difference; "over tol." is pixels over the channel tolerance; for assets the px are the median significant pixels (RGB more than 2 levels from usdrecord).')
  out.push('Renders are not committed; rerun the script to see them.')
  out.push('')
  out.push('## Summary by suite')
  out.push('')
  out.push('| suite | run | commit | tests / assets | rows | pass | fail | error | incomplete | not run |')
  out.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|')
  let tot = { tests: 0, rows: 0, pass: 0, fail: 0, error: 0, incomplete: 0, 'not run': 0 }
  for (const id of sectionOrder) {
    const s = summary.bySection[id], r = ledger.runs[id]
    if (!s && !r) continue
    const v = s ?? { tests: 0, rows: 0, pass: 0 }
    for (const k of Object.keys(tot)) tot[k] += v[k] ?? 0
    const status = r ? `${r.date}${r.timedOut ? ' (timed out)' : ''}${r.exit && r.exit !== 0 && !r.timedOut ? ` (exit ${r.exit})` : ''}` : ''
    out.push(`| ${id} | ${status} | ${r?.commit ?? ''} | ${v.tests} | ${v.rows} | ${v.pass} | ${v.fail ?? 0} | ${v.error ?? 0} | ${v.incomplete ?? 0} | ${v['not run'] ?? 0} |`)
  }
  out.push(`| **total** | | | ${tot.tests} | ${tot.rows} | ${tot.pass} | ${tot.fail} | ${tot.error} | ${tot.incomplete} | ${tot['not run']} |`)
  out.push('')
  out.push('## Failures by class')
  out.push('')
  out.push('Every failing or error row by the class of its cause (classification.json: each cause names its class).')
  out.push('')
  out.push(...classLines(summary, classification))
  out.push('')
  out.push(...classTable(classification))
  out.push('')
  out.push('## Failures by cause')
  out.push('')
  out.push('| cause | rows | debt / owning gap | description |')
  out.push('|---|---:|---|---|')
  for (const [cause, n] of Object.entries(summary.byCause)) {
    const c = classification.causes[cause] ?? { label: 'no rule in classification.json matches these rows' }
    out.push(`| ${cause} | ${n} | ${esc([...(c.debt ?? []).map(marker), c.owner].filter(Boolean).join('; '))} | ${esc(c.label)} |`)
  }
  out.push('')
  out.push(`Never run: ${ledger.neverRun.rows.length} of ${ledger.neverRun.registrations} upstream image registrations (${ledger.neverRun.ran} ran): ` +
    Object.entries(summary.neverRun).map(([k, n]) => `${n} ${k}`).join(', ') + '. List at the end.')
  out.push('')
  out.push('## Image tests')
  const cell = r => r.result === 'pass' ? 'pass' : `**${r.result}**`
  for (const id of sectionOrder) {
    const rows = ledger.tests.filter(r => r.section === id)
    if (!rows.length) continue
    out.push('')
    out.push(`### ${id}`)
    out.push('')
    out.push('| test | image / check | result | differing px | % | over tol. | max | cause | debt / owner | error |')
    out.push('|---|---|---|---:|---:|---:|---:|---|---|---|')
    for (const r of rows) out.push(`| ${esc(r.test)} | ${esc(r.image)} | ${cell(r)} | ${r.differingPx ?? ''} | ${r.differingPct ?? ''} | ${r.overTolerancePx ?? ''} | ${r.maxDiff ?? ''} | ${r.cause ?? ''} | ${esc([...(r.debt ?? []), r.owner].filter(Boolean).join('; '))} | ${esc(r.error ?? '')} |`)
  }
  out.push('')
  out.push('## Assets')
  for (const id of sectionOrder.filter(s => s.startsWith('assets-'))) {
    const rows = ledger.assets.filter(r => r.section === id)
    if (!rows.length) continue
    out.push('')
    out.push(`### ${id}`)
    out.push('')
    out.push('| asset | group | result | median px | % | spread | runs | max | cause | debt / owner | note |')
    out.push('|---|---|---|---:|---:|---:|---:|---:|---|---|---|')
    for (const r of rows) out.push(`| ${esc(r.id)} | ${esc(r.group)} | ${cell(r)} | ${r.medianPx ?? ''} | ${r.medianPct ?? ''} | ${r.spreadPx ?? ''} | ${r.runs} | ${r.maxDiff ?? ''} | ${r.cause ?? ''} | ${esc([...(r.debt ?? []), r.owner].filter(Boolean).join('; '))} | ${esc([r.error, r.native ? `native ${r.native}` : null, r.openFailedInReference ? 'the reference build cannot open it' : null].filter(Boolean).join('; '))} |`)
  }
  if (chrome) chromeMarkdown(out, ledger, chrome, classification, sectionOrder)
  out.push('')
  out.push('## Causes')
  out.push('')
  for (const [id, c] of Object.entries(classification.causes)) {
    out.push(`- **${id}**: ${c.label}${c.debt?.length ? ` Debt: ${c.debt.map(d => `\`${marker(d)}\``).join(', ')}.` : ''}${c.owner ? ` Owner: ${c.owner}.` : ''} Evidence: ${c.evidence}`)
  }
  out.push('')
  out.push('## Never run')
  out.push('')
  out.push('Upstream image registrations (pxr/testing/upstreamTestManifest.json entries with IMAGE_DIFF_COMPARE) that no suite ran, by library and category. "captured, no runner": a native capture is committed but no runner drives the test; "no capture": no native capture is committed; "runner skips it": a runner lists it as not run, with its reason.')
  const groups = {}
  for (const r of ledger.neverRun.rows) (groups[`${r.library} · ${r.category}`] ??= []).push(r)
  for (const [k, rows] of Object.entries(groups).sort()) {
    out.push('')
    out.push(`- **${k}** (${rows.length}): ` + rows.map(r => `${r.name}${r.reason ? ` (${r.reason})` : ''}`).join(', '))
  }
  out.push('')
  writeFileSync(file, out.join('\n'))
}

// Chrome's section of imaging-status.md (see the header).
function chromeMarkdown(out, safari, chrome, classification, sectionOrder) {
  const { summary } = chrome
  const testKey = r => `${r.section}\0${r.test}\0${r.image}`, assetKey = r => `${r.section}\0${r.id}`
  const safariRows = new Map([...safari.tests.map(r => [testKey(r), r]), ...safari.assets.map(r => [assetKey(r), r])])
  const pair = [...chrome.tests.map(r => [r, safariRows.get(testKey(r))]), ...chrome.assets.map(r => [r, safariRows.get(assetKey(r))])]
  const px = r => r == null ? '' : r.medianPx != null ? `${r.medianPx} / ${r.maxDiff ?? ''}` : r.overTolerancePx != null || r.differingPx != null ? `${r.differingPx ?? ''} (${r.overTolerancePx ?? ''} over) / ${r.maxDiff ?? ''}` : ''
  const samePixels = (a, b) => a.differingPx === b.differingPx && a.overTolerancePx === b.overTolerancePx && a.maxDiff === b.maxDiff && a.medianPx === b.medianPx
  out.push('')
  out.push('## Chrome')
  out.push('')
  out.push('The same suites and asset sets in Google Chrome (`run.mjs --browser chrome`, `tests/browser/browser.mjs`: a separate instance with a fresh profile, WebGPU at Chrome\'s defaults), against the same native captures and tolerances. Its rows are in `imaging-status-chrome.json`. "vs Safari": rows whose result differs from Safari\'s, and rows with the same result but other pixel counts.')
  out.push('')
  out.push('| suite | run | commit | Chrome | WebGPU adapter | tests / assets | rows | pass | fail | error | incomplete | not run | vs Safari: result | vs Safari: pixels |')
  out.push('|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const id of sectionOrder) {
    const s = summary.bySection[id], r = chrome.runs[id]
    if (!s && !r) continue
    const v = s ?? { tests: 0, rows: 0, pass: 0 }
    const mine = pair.filter(([c]) => c.section === id), withSafari = mine.filter(([, sf]) => sf)
    const status = r ? `${r.date}${r.timedOut ? ' (timed out)' : ''}${r.exit && r.exit !== 0 && !r.timedOut ? ` (exit ${r.exit})` : ''}` : ''
    out.push(`| ${id} | ${status} | ${r?.commit ?? ''} | ${esc(r?.chrome ?? '')} | ${esc(r?.adapter ?? '')} | ${v.tests} | ${v.rows} | ${v.pass} | ${v.fail ?? 0} | ${v.error ?? 0} | ${v.incomplete ?? 0} | ${v['not run'] ?? 0} | ${withSafari.filter(([c, sf]) => c.result !== sf.result).length} | ${withSafari.filter(([c, sf]) => c.result === sf.result && !samePixels(c, sf)).length} |`)
  }
  out.push('')
  out.push('Chrome\'s failing or error rows by class:')
  out.push('')
  out.push(...classLines(summary, classification))
  out.push('')
  out.push('| cause (Chrome) | rows | debt / owning gap |')
  out.push('|---|---:|---|')
  for (const [cause, n] of Object.entries(summary.byCause)) {
    const c = classification.causes[cause] ?? {}
    out.push(`| ${cause} | ${n} | ${esc([...(c.debt ?? []).map(marker), c.owner].filter(Boolean).join('; '))} |`)
  }
  const differs = pair.filter(([c, sf]) => !sf || c.result !== sf.result)
  out.push('')
  out.push(`### Where Chrome's result differs from Safari's (${differs.length})`)
  out.push('')
  out.push('px: differing (over tol.) / max for image tests; median significant px / max for assets.')
  out.push('')
  out.push('| suite | test / asset | image | Safari | Chrome | Safari px | Chrome px | Chrome cause | Chrome error |')
  out.push('|---|---|---|---|---|---|---|---|---|')
  const cell = r => r == null ? 'not run' : r.result === 'pass' ? 'pass' : `**${r.result}**`
  for (const [c, sf] of differs) out.push(`| ${c.section} | ${esc(c.test ?? c.id)} | ${esc(c.image ?? '')} | ${cell(sf)} | ${cell(c)} | ${px(sf)} | ${px(c)} | ${c.cause ?? ''} | ${esc(c.error ?? '')} |`)
}

const LEDGER_FILES = { safari: 'docs/imaging-status.json', chrome: 'docs/imaging-status-chrome.json' }
const COMMENTS = {
  safari: 'Imaging status ledger (packages/usd/tests/browser/imaging-status/run.mjs). One row per line; sections carry their run date and commit. Renders are never committed.',
  chrome: 'Imaging status ledger, Google Chrome (packages/usd/tests/browser/imaging-status/run.mjs --browser chrome). One row per line; sections carry their run date, commit, Chrome version and WebGPU adapter. Renders are never committed.',
}

/** Rebuilds the ledger of `browser` from the runs into `out` (refreshed
 *  sections) and both ledgers' JSON, and imaging-status.md. */
export function buildLedger({ out, runs, suites, pkg, harness, browser = 'safari' }) {
  const classification = load(path.join(here, 'classification.json'))
  const mdFile = path.join(pkg, 'docs/imaging-status.md')
  const ledgers = {}
  for (const b of Object.keys(LEDGER_FILES)) {
    const jsonFile = path.join(pkg, LEDGER_FILES[b])
    if (b !== browser && !existsSync(jsonFile)) continue
    ledgers[b] = browserLedger({ out, runs: b === browser ? runs : {}, suites, pkg, classification, browser: b, jsonFile })
  }
  if (ledgers.safari) writeMarkdown(mdFile, ledgers.safari, classification, [...suites.map(s => s.id), 'assets-curated', 'assets-corpus'], ledgers.chrome)
  const jsonFile = path.join(pkg, LEDGER_FILES[browser])
  return { json: jsonFile, md: mdFile, ledger: ledgers[browser] }
}

function browserLedger({ out, runs, suites, pkg, classification, browser, jsonFile }) {
  const classify = classifier(classification, browser)
  const previous = load(jsonFile)
  const refreshed = new Set(Object.keys(runs))
  const manifest = load(path.join(pkg, 'pxr/testing/upstreamTestManifest.json')).tests
  const byName = new Map(manifest.map(t => [t.name, t]))
  const ctx = { imageOf: name => byName.get(name)?.imageDiffCompare?.[0] ?? '' }

  // A suite no longer in run.mjs's list (retired, e.g. storm-image/volumes,
  // whose tests the usdimaging-gl suite runs through the engine) drops out
  // of the ledger with its rows.
  const known = new Set([...suites.map(s => s.id), 'assets-curated', 'assets-corpus'])
  let tests = (previous?.tests ?? []).filter(r => known.has(r.section) && !refreshed.has(r.section))
  let assets = (previous?.assets ?? []).filter(r => known.has(r.section) && !refreshed.has(r.section))
  const sections = Object.fromEntries(Object.entries(previous?.sections ?? {}).filter(([id]) => known.has(id)))
  for (const suite of suites) {
    if (!refreshed.has(suite.id)) continue
    sections[suite.id] = runs[suite.id]
    const r = load(path.join(out, 'suites', suite.id, 'results.json'))
    const run = runs[suite.id]
    const rows = r ? PARSERS[suite.id](r, ctx) : salvage(suite, run, path.join(out, 'suites', suite.id, 'runner.log'), ctx)
    tests.push(...rows.map(row => ({ section: suite.id, ...row })))
  }
  for (const set of ['curated', 'corpus']) {
    const id = `assets-${set}`
    if (!refreshed.has(id)) continue
    sections[id] = runs[id]
    const report = load(path.join(out, id, 'report.json'))
    if (report) assets.push(...assetRows(report, report.summary.scoring.reference).map(row => ({ section: id, ...row })))
  }
  const order = [...suites.map(s => s.id), 'assets-curated', 'assets-corpus']
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  tests = tests.map(r => { const { cause, debt, owner, ...rest } = r; return { ...rest, ...classify(`${r.section}/${r.test}/${r.image}`, r) } })
  assets = assets.map(r => { const { cause, debt, owner, ...rest } = r; return { ...rest, source: repoSource(pkg, r.source), ...classify(`${r.section}/${r.id}`, r) } })
  tests.sort((a, b) => rank(a.section) - rank(b.section) || a.test.localeCompare(b.test) || a.image.localeCompare(b.image))
  assets.sort((a, b) => rank(a.section) - rank(b.section) || (a.group ?? '').localeCompare(b.group ?? '') || a.id.localeCompare(b.id))
  const registered = new Set(manifest.map(t => t.name))
  tests = tests.map(r => ({ ...r, registered: registered.has(r.test) }))
  const never = neverRun({ pkg, testRows: tests, classification })
  const sortedSections = Object.fromEntries(Object.entries(sections).sort((a, b) => rank(a[0]) - rank(b[0])))
  const ledger = {
    comment: COMMENTS[browser],
    generatedBy: 'packages/usd/tests/browser/imaging-status/run.mjs',
    tolerance: { channel: 2, maxFraction: 0.005, assets: 'median significant px <= 0.1% of the image against usdrecord (score.mjs)' },
    runs: sortedSections,
    summary: null, tests, assets, neverRun: never,
  }
  ledger.summary = summarize(tests, assets, never, classification)
  writeJson(jsonFile, ledger)
  return ledger
}
