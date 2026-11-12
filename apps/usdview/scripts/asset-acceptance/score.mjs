// Browser asset acceptance: the bar of packages/usd/docs/imaging-i2.md,
// "Decision: one faithful implementation, no backup renderer" (Andy, November
// 5, 2026): the viewer renders only through the faithful Storm port, and its
// renders are compared with native OpenUSD only (pixels and diagnostics, like
// for like with usdrecord/usdview), not with a second renderer.
// Tooling only (no upstream counterpart). Pure functions over per-run records;
// report.mjs gathers the records from <out>/<id>/runs/storm/<k>/ and renders
// the verdicts.
//
//   Runs: the set runs requiredRuns times (default 3); an asset is scored by
//     the median of its significant-pixel counts (pixels with any RGB channel
//     more than TOL = 2 levels from the scoring reference), with the spread
//     (max - min) recorded.
//   Verdicts per asset:
//     fails      any run has a hard failure (crash, timeout, no image, size
//                mismatch, uncaught browser error, WebGPU validation error);
//     incomplete no runs, fewer than requiredRuns runs, or no reference image;
//     matches    median <= 0.1 % of the image (262 px at 512x512);
//     differs    median above that band (the px are reported).
//   Diagnostics (median distinct count over runs) are reported, not gated.
//
// Performance guard (imaging-i2.md section 1.3, adopted in its Decisions of
// November 5, 2026: it gates the final switch; recorded every run). Its
// reference is the hand-written renderer, deleted at the switch, so its
// numbers are the recorded baseline perf-baseline.json: hdStWgsl at
// 15513a1 (the last commit with it), three Safari runs on the same machine
// (perf-baseline.mjs writes it from such a run). Per asset with a baseline:
//   settledMs       the median at most SETTLED_FACTOR (1.5) x the baseline's;
//   lastFrameCpuMs  for assets whose manifest entry has "guard":
//                   {"lastFrameCpuMs": k}: at most
//                   k x the baseline's;
//   playbackP95Ms   for assets with "guard": {"playback": true} (BrainStem):
//                   at least as smooth, i.e. the p95 frame time over the
//                   stage's time codes at most the baseline's plus 3 x the
//                   larger run-to-run spread (the tie-band rule of 1.3).
// A check without a measurement on either side is null (not measured); an
// asset without a baseline (the renderer failed it) is not guarded.
// Overall: fails if any check fails, incomplete if any is null, else passes.
// Timings depend on the machine and its load: the baseline is only
// comparable with runs on the machine that recorded it.

export const TOL = 2
export const SETTLED_FACTOR = 1.5
/** The one browser renderer: run k is written to <out>/<id>/runs/<RENDERER>/<k>/. */
export const RENDERER = 'storm'

export const median = values => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const spread = values => values.length ? Math.max(...values) - Math.min(...values) : 0
/** 0.1 % of the image: 262 px at 512x512. */
export const floorBand = pixels => Math.floor(pixels * 0.001)

const VALIDATION = /GPUValidationError|validation error|uncapturederror|Invalid (CommandBuffer|RenderPipeline|BindGroup|ShaderModule|Buffer|Texture)/i

/** The hard failure of one run, or null. A run is
 *  { outcome, error?, image: { width, height } | null, reference: { width, height },
 *    significant?, uncaught?, console?, gpuErrors?, diagnostics? }.
 *  The viewer lists Storm's WebGPU validation errors as error diagnostics (and
 *  echoes diagnostics to the console) rather than failing the load, so the
 *  validation pattern is applied only to gpuErrors (the device's
 *  uncapturederror events) and uncaught errors, never to console or
 *  diagnostics text. */
export function hardFailure(run) {
  if (!run) return 'not run'
  if (run.outcome === 'timeout') return 'timeout'
  if (run.outcome !== 'captured') return `${run.outcome}${run.error ? `: ${String(run.error).split('\n')[0]}` : ''}`
  if (!run.image) return 'no image'
  if (run.reference && (run.image.width !== run.reference.width || run.image.height !== run.reference.height))
    return `size mismatch: ${run.image.width}x${run.image.height} vs reference ${run.reference.width}x${run.reference.height}`
  const validation = [...(run.gpuErrors ?? []), ...(run.uncaught ?? [])].map(m => m?.message ?? String(m)).find(m => VALIDATION.test(m))
  if (validation) return `WebGPU validation error: ${validation.split('\n')[0].slice(0, 200)}`
  if (run.uncaught?.length) return `uncaught browser error: ${String(run.uncaught[0]).split('\n')[0]}`
  if (typeof run.significant !== 'number') return 'not compared'
  return null
}

/** Summary of one asset's runs. */
export function summarizeRuns(runs) {
  const failures = runs.map(hardFailure).filter(Boolean)
  const counts = runs.filter(r => !hardFailure(r)).map(r => r.significant)
  const timing = key => runs.map(r => r.timings?.[key]).filter(v => typeof v === 'number')
  const p95s = runs.map(r => r.playback?.p95Ms).filter(v => typeof v === 'number')
  return {
    runs: runs.length, failures,
    counts, median: failures.length ? null : median(counts), spread: failures.length ? null : spread(counts),
    diagnostics: median(runs.map(r => r.diagnostics?.length ?? 0)),
    settledMs: median(timing('settledMs')), lastFrameCpuMs: median(timing('lastFrameCpuMs')),
    playbackP95Ms: median(p95s), playbackSpreadMs: spread(p95s),
  }
}

/** The verdict of one asset. summary is a summarizeRuns result (or null when
 *  the asset has no runs); pixels is the scoring reference's size (null when
 *  there is no reference image). */
export function classify({ summary, pixels, requiredRuns = 3 }) {
  const band = pixels ? floorBand(pixels) : null
  const out = { verdict: 'incomplete', reasons: [], band, median: summary?.median ?? null }
  if (!summary?.runs) { out.reasons.push('no runs'); return out }
  if (summary.failures.length) {
    out.verdict = 'fails'
    out.reasons.push(`hard failure: ${summary.failures[0]}${summary.failures.length > 1 ? ` (${summary.failures.length} runs)` : ''}`)
    return out
  }
  if (!pixels) { out.reasons.push('no scoring reference image'); return out }
  if (summary.runs < requiredRuns) { out.reasons.push(`${summary.runs} of ${requiredRuns} runs`); return out }
  if (summary.median <= band) out.verdict = 'matches'
  else { out.verdict = 'differs'; out.reasons.push(`${summary.median} px over a band of ${band}`) }
  return out
}

/** Measured performance of one asset (medians over runs; null: not measured). */
export const performance = summary => ({
  settledMs: summary?.settledMs ?? null, lastFrameCpuMs: summary?.lastFrameCpuMs ?? null, playbackP95Ms: summary?.playbackP95Ms ?? null,
})

/** The performance guard of one asset: summary is its summarizeRuns result,
 *  baseline its perf-baseline.json entry (or undefined), spec its manifest
 *  "guard" object. */
export function guard({ summary, baseline, spec = {} }) {
  if (!baseline) return { checks: [], pass: null, reason: 'no baseline' }
  const checks = []
  const check = (name, base, cand, limit) => checks.push({ name, base: base ?? null, cand: cand ?? null, limit: limit ?? null,
    pass: base == null || cand == null || limit == null ? null : cand <= limit })
  check('settledMs', baseline.settledMs, summary?.settledMs, baseline.settledMs == null ? null : SETTLED_FACTOR * baseline.settledMs)
  if (spec.lastFrameCpuMs) check('lastFrameCpuMs', baseline.lastFrameCpuMs, summary?.lastFrameCpuMs, baseline.lastFrameCpuMs == null ? null : spec.lastFrameCpuMs * baseline.lastFrameCpuMs)
  if (spec.playback) check('playbackP95Ms', baseline.playbackP95Ms, summary?.playbackP95Ms,
    baseline.playbackP95Ms == null ? null : baseline.playbackP95Ms + 3 * Math.max(baseline.playbackSpreadMs ?? 0, summary?.playbackSpreadMs ?? 0))
  return { checks, pass: checks.some(c => c.pass === false) ? false : checks.some(c => c.pass === null) ? null : true }
}

/** The guard over all assets: rows are [{ guard }]. */
export function guardOverall(rows) {
  const guarded = rows.filter(r => r.guard?.checks.length)
  const failed = guarded.filter(r => r.guard.pass === false).length, open = guarded.filter(r => r.guard.pass === null).length
  return { guarded: guarded.length, failed, incomplete: open,
    verdict: !guarded.length ? 'no baseline' : failed ? 'fails' : open ? 'incomplete' : 'passes' }
}

/** Counts over all assets: rows are [{ summary, classification }]. */
export function overall(rows) {
  const count = v => rows.filter(r => r.classification.verdict === v).length
  const matches = count('matches'), differs = count('differs'), fails = count('fails'), incomplete = count('incomplete')
  const parts = [[fails, 'fail'], [differs, 'differ'], [incomplete, 'incomplete']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`)
  return {
    assets: rows.length, matches, differs, fails, incomplete,
    allMatch: rows.length > 0 && matches === rows.length,
    verdict: !rows.length ? 'no assets' : parts.length ? `${matches} of ${rows.length} match (${parts.join(', ')})` : `all ${rows.length} match`,
    totalSignificant: rows.reduce((sum, r) => sum + (r.summary?.median ?? 0), 0),
  }
}
