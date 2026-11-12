import type { LoadCounts, LoadPhase, LoadProgress } from './contracts'

const zero = (): LoadCounts => ({ requested: 0, done: 0, failed: 0 })

/** Per-load transfer and payload counters. Fetches made before the first
 * frame are layer reads; later fetches belong to deferred payload loading. */
export class LoadProgressTracker {
  phase: LoadPhase = 'layers'
  readonly layers = zero()
  readonly payloadFiles = zero()
  readonly payloads = zero()
  bytes = 0
  constructor(private readonly changed: (progress: LoadProgress) => void = () => {}) {}
  snapshot(): LoadProgress {
    return { phase: this.phase, layers: { ...this.layers }, payloadFiles: { ...this.payloadFiles }, payloads: { ...this.payloads }, bytes: this.bytes }
  }
  notify(): void { this.changed(this.snapshot()) }
  setPhase(phase: LoadPhase): void { this.phase = phase; this.notify() }
  /** Fetches are attributed to the phase in which they start. */
  files(): LoadCounts { return this.phase === 'layers' ? this.layers : this.payloadFiles }
}

/** Wraps the resolver's transport so every asset read (layers, payload layers,
 * textures) is counted. Bytes are decoded body bytes as the resolver reads them. */
export function countingFetch(base: typeof fetch, tracker: LoadProgressTracker): typeof fetch {
  return async (input, init) => {
    const counts = tracker.files()
    ++counts.requested; tracker.notify()
    let response: Response
    try { response = await base(input, init) }
    catch (error) { ++counts.failed; tracker.notify(); throw error }
    if (!response.ok) { ++counts.failed; tracker.notify(); return response }
    const read = response.arrayBuffer.bind(response)
    let settled = false
    const settle = (bytes: number | undefined) => {
      if (settled) return
      settled = true
      if (bytes === undefined) ++counts.failed
      else { ++counts.done; tracker.bytes += bytes }
      tracker.notify()
    }
    response.arrayBuffer = async () => {
      try { const body = await read(); settle(body.byteLength); return body }
      catch (error) { settle(undefined); throw error }
    }
    return response
  }
}

/** Deferred payload batches grow geometrically: the first geometry appears after
 * a few payloads, and later batches amortize the per-batch imaging rebuild. */
export function payloadBatches(paths: readonly string[], first = 2, growth = 2): string[][] {
  const batches: string[][] = []
  for (let start = 0, size = Math.max(1, first); start < paths.length; start += size, size = Math.ceil(size * growth))
    batches.push(paths.slice(start, start + size))
  return batches
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** One overlay line per counter, in the order the load reaches them. */
export function progressLines(progress: LoadProgress): string[] {
  const counts = (label: string, c: LoadCounts) => `${label}: ${c.done}/${c.requested}${c.failed ? ` · ${c.failed} failed` : ''}`
  const lines = [counts('Layers', progress.layers)]
  if (progress.payloads.requested) {
    lines.push(counts('Payloads', progress.payloads))
    if (progress.payloadFiles.requested) lines.push(counts('Payload files', progress.payloadFiles))
  }
  lines.push(formatBytes(progress.bytes))
  return lines
}
