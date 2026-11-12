/** Named spans of scene loading, recorded as `usdview:<name>` performance.measure
 * entries so Web Inspector timelines and tests can attribute main-thread time. */
export function timed<T>(name: string, fn: () => T): T {
  const start = performance.now()
  try { return fn() } finally { measure(name, start) }
}

/** Returns fn's own promise, so awaiting it schedules exactly as awaiting fn() would. */
export function timedAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const promise = fn()
  promise.then(() => measure(name, start), () => measure(name, start))
  return promise
}

function measure(name: string, start: number) {
  try { performance.measure(`usdview:${name}`, { start, end: performance.now() }) } catch { /* timing is best effort */ }
}
