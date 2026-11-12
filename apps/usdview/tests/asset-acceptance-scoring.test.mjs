// Controller tests (Node, no browser) of the asset-acceptance scoring
// (scripts/asset-acceptance/score.mjs): the comparison with native OpenUSD of
// packages/usd/docs/imaging-i2.md, "Decision: one faithful implementation, no
// backup renderer" (November 5, 2026).
// Tooling tests: the inputs are synthetic run records, not USD results.
import { describe, expect, it } from 'vitest'
import { classify, floorBand, guard, guardOverall, hardFailure, median, overall, performance, spread, summarizeRuns } from '../scripts/asset-acceptance/score.mjs'

const PX = 512 * 512
const size = { width: 512, height: 512 }
const run = (significant, extra = {}) => ({ outcome: 'captured', image: size, reference: size, significant, uncaught: [], console: [], gpuErrors: [], diagnostics: [], timings: { settledMs: 1000 }, ...extra })
const three = (...counts) => summarizeRuns(counts.map(c => run(c)))
const verdict = summary => classify({ summary, pixels: PX }).verdict

describe('asset-acceptance scoring against native OpenUSD', () => {
  it('scores the median of the runs and records the spread', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(spread([5, 1, 3])).toBe(4)
    const s = three(26347, 51637, 26347)
    expect(s).toMatchObject({ runs: 3, median: 26347, spread: 25290, counts: [26347, 51637, 26347], failures: [] })
  })

  it('matches within 0.1 % of the image and differs above it', () => {
    expect(floorBand(PX)).toBe(262)
    expect(verdict(three(0, 0, 0))).toBe('matches')
    expect(verdict(three(262, 300, 100))).toBe('matches')
    const c = classify({ summary: three(263, 263, 263), pixels: PX })
    expect(c).toMatchObject({ verdict: 'differs', median: 263, band: 262 })
    expect(c.reasons[0]).toMatch(/263 px/)
  })

  it('fails on a hard failure in any run, even with a matching median', () => {
    expect(hardFailure({ outcome: 'timeout' })).toBe('timeout')
    expect(hardFailure({ outcome: 'error', error: 'boom\nstack' })).toBe('error: boom')
    expect(hardFailure({ outcome: 'captured', image: null })).toBe('no image')
    expect(hardFailure(run(0, { image: { width: 256, height: 256 } }))).toMatch(/^size mismatch/)
    expect(hardFailure(run(0, { uncaught: ['TypeError: x'] }))).toMatch(/^uncaught/)
    expect(hardFailure(run(0, { gpuErrors: ['GPUValidationError: Invalid BindGroup'] }))).toMatch(/^WebGPU validation/)
    expect(hardFailure(run(0, { uncaught: ['GPUValidationError: Invalid Buffer'] }))).toMatch(/^WebGPU validation/)
    expect(hardFailure({ ...run(0), significant: undefined })).toBe('not compared')
    expect(hardFailure(run(0))).toBeNull()
    const c = classify({ summary: summarizeRuns([run(0), run(0), { outcome: 'timeout' }]), pixels: PX })
    expect(c.verdict).toBe('fails')
    expect(c.reasons[0]).toMatch(/^hard failure: timeout/)
    expect(verdict(summarizeRuns([{ outcome: 'error', error: 'x' }]))).toBe('fails')
  })

  it('does not fail on validation errors the viewer reports as diagnostics and echoes to the console', () => {
    const message = 'GPUValidationError: Invalid RenderPipeline "storm"'
    const r = run(10, { diagnostics: [{ severity: 'error', message }], console: [{ level: 'error', message, count: 1 }] })
    expect(hardFailure(r)).toBeNull()
    const s = summarizeRuns([r, r, r])
    expect(s.diagnostics).toBe(1)
    expect(classify({ summary: s, pixels: PX }).verdict).toBe('matches')
  })

  it('is incomplete without runs, without enough runs or without a reference', () => {
    expect(classify({ summary: null, pixels: PX })).toMatchObject({ verdict: 'incomplete', reasons: ['no runs'] })
    const two = classify({ summary: summarizeRuns([run(0), run(0)]), pixels: PX })
    expect(two).toMatchObject({ verdict: 'incomplete', reasons: ['2 of 3 runs'] })
    expect(classify({ summary: summarizeRuns([run(0)]), pixels: PX, requiredRuns: 1 }).verdict).toBe('matches')
    expect(classify({ summary: three(0, 0, 0), pixels: null }).verdict).toBe('incomplete')
  })

  it('reports measured performance as medians', () => {
    const timed = (settledMs, lastFrameCpuMs, p95Ms) => run(0, { timings: { settledMs, lastFrameCpuMs }, playback: { p95Ms } })
    const s = summarizeRuns([timed(900, 10, 20), timed(1200, 30, 26), timed(1000, 12, 21)])
    expect(performance(s)).toEqual({ settledMs: 1000, lastFrameCpuMs: 12, playbackP95Ms: 21 })
    expect(s.playbackSpreadMs).toBe(6)
    expect(performance(null)).toEqual({ settledMs: null, lastFrameCpuMs: null, playbackP95Ms: null })
  })

  it('counts verdicts and total significant px over all assets', () => {
    const row = summary => ({ summary, classification: classify({ summary, pixels: PX }) })
    const rows = [row(three(0, 0, 0)), row(three(100, 120, 100)), row(three(5000, 5000, 5100)), row(summarizeRuns([run(0), { outcome: 'timeout' }, run(0)])), row(null)]
    expect(overall(rows)).toMatchObject({ assets: 5, matches: 2, differs: 1, fails: 1, incomplete: 1, allMatch: false, totalSignificant: 5100, verdict: '2 of 5 match (1 fail, 1 differ, 1 incomplete)' })
    expect(overall(rows.slice(0, 2))).toMatchObject({ allMatch: true, verdict: 'all 2 match' })
    expect(overall([])).toMatchObject({ assets: 0, allMatch: false, verdict: 'no assets' })
  })

  // The performance guard of imaging-i2.md section 1.3 against a recorded
  // baseline (perf-baseline.json).
  it('guards settled time at 1.5x the baseline per asset', () => {
    const s = summarizeRuns([run(0, { timings: { settledMs: 1400 } }), run(0, { timings: { settledMs: 1500 } }), run(0, { timings: { settledMs: 1600 } })])
    expect(guard({ summary: s, baseline: { settledMs: 1000 } })).toEqual({ pass: true, checks: [{ name: 'settledMs', base: 1000, cand: 1500, limit: 1500, pass: true }] })
    expect(guard({ summary: s, baseline: { settledMs: 999 } }).pass).toBe(false)
    expect(guard({ summary: s, baseline: undefined })).toEqual({ checks: [], pass: null, reason: 'no baseline' })
    expect(guard({ summary: null, baseline: { settledMs: 1000 } }).pass).toBeNull()
  })

  it('guards last-frame CPU time and playback only where the manifest asks', () => {
    const timed = (lastFrameCpuMs, p95Ms) => run(0, { timings: { settledMs: 1000, lastFrameCpuMs }, playback: { p95Ms } })
    const s = summarizeRuns([timed(30, 20), timed(34, 26), timed(40, 22)])
    const baseline = { settledMs: 1000, lastFrameCpuMs: 17, playbackP95Ms: 18, playbackSpreadMs: 1 }
    expect(guard({ summary: s, baseline }).checks.map(c => c.name)).toEqual(['settledMs'])
    const cpu = guard({ summary: s, baseline, spec: { lastFrameCpuMs: 2 } })
    expect(cpu.checks[1]).toEqual({ name: 'lastFrameCpuMs', base: 17, cand: 34, limit: 34, pass: true })
    // p95 median 22, limit 18 + 3 x max(1, spread 6) = 36.
    const play = guard({ summary: s, baseline, spec: { playback: true } })
    expect(play.checks[1]).toEqual({ name: 'playbackP95Ms', base: 18, cand: 22, limit: 36, pass: true })
    const steady = summarizeRuns([timed(30, 40), timed(34, 40), timed(40, 40)])
    expect(guard({ summary: steady, baseline, spec: { playback: true } }).pass).toBe(false)
    expect(guard({ summary: steady, baseline: { settledMs: 1000, playbackP95Ms: null }, spec: { playback: true } }).pass).toBeNull()
  })

  it('passes overall only when every guarded asset passes', () => {
    const g = pass => ({ guard: { checks: [{ name: 'settledMs' }], pass } })
    expect(guardOverall([g(true), g(true), { guard: { checks: [], pass: null } }])).toEqual({ guarded: 2, failed: 0, incomplete: 0, verdict: 'passes' })
    expect(guardOverall([g(true), g(null)]).verdict).toBe('incomplete')
    expect(guardOverall([g(true), g(null), g(false)]).verdict).toBe('fails')
    expect(guardOverall([]).verdict).toBe('no baseline')
  })
})
