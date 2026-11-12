import { describe, expect, it, vi } from 'vitest'
import { LoadProgressTracker, countingFetch, payloadBatches, progressLines } from '../src/load-progress'
import { parseStartupOptions, normalizeStartupOptions } from '../src/startup-options'

describe('load progress (mock transport, not a browser test)', () => {
  it('counts layer reads, failures and decoded bytes by phase', async () => {
    const seen = vi.fn()
    const tracker = new LoadProgressTracker(seen)
    const base = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('missing.usda')
      ? new Response('no', { status: 404 }) : new Response(new Uint8Array(10)))
    const transport = countingFetch(base as typeof fetch, tracker)
    await (await transport('a.usda')).arrayBuffer()
    await transport('missing.usda')
    await expect(countingFetch(async () => { throw new TypeError('offline') }, tracker)('b.usda')).rejects.toThrow('offline')
    expect(tracker.snapshot().layers).toEqual({ requested: 3, done: 1, failed: 2 })
    tracker.setPhase('payloads')
    const pending = transport('payload.usd')
    expect(tracker.snapshot().payloadFiles).toEqual({ requested: 1, done: 0, failed: 0 })
    await (await pending).arrayBuffer()
    expect(tracker.snapshot()).toMatchObject({ phase: 'payloads', bytes: 20, payloadFiles: { requested: 1, done: 1, failed: 0 }, layers: { requested: 3 } })
    expect(seen).toHaveBeenCalled()
  })
  it('counts a body read once even when the reader retries', async () => {
    const tracker = new LoadProgressTracker()
    const response = await countingFetch(async () => new Response(new Uint8Array(4)), tracker)('a.usda')
    await response.arrayBuffer()
    await expect(response.arrayBuffer()).rejects.toThrow()
    expect(tracker.snapshot().layers).toEqual({ requested: 1, done: 1, failed: 0 })
  })
  it('batches deferred payloads geometrically and keeps every path once', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/P${i}`)
    const batches = payloadBatches(paths)
    expect(batches.map(b => b.length)).toEqual([2, 4, 8, 6])
    expect(batches.flat()).toEqual(paths)
    expect(payloadBatches([])).toEqual([])
  })
  it('formats overlay lines', () => {
    expect(progressLines({ phase: 'payloads', layers: { requested: 5, done: 5, failed: 0 }, payloadFiles: { requested: 3, done: 2, failed: 1 }, payloads: { requested: 10, done: 4, failed: 0 }, bytes: 3 * 1024 * 1024 }))
      .toEqual(['Layers: 5/5', 'Payloads: 4/10', 'Payload files: 2/3 · 1 failed', '3.0 MB'])
  })
  it('parses ?progressive and round-trips it', () => {
    expect(parseStartupOptions('?progressive=0').options.progressive).toBe(false)
    expect(parseStartupOptions('?progressive=1').options.progressive).toBe(true)
    expect(parseStartupOptions('?progressive=yes').warnings).toEqual(['Invalid startup progressive: yes. Expected 0 or 1.'])
    expect(normalizeStartupOptions({ progressive: false }).options.progressive).toBe(false)
  })
})
