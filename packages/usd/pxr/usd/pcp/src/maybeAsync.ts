// PLATFORM-DIVERGENCE(usd-async-layer-open-composition), usd/src/stage.ts.
// typescript-usd adaptation: OpenUSD composes and processes changes synchronously,
// opening layers on demand. typescript-usd opens layers asynchronously, so a
// computation that needs an unopened layer throws PcpNeedsLayer and is
// retried after the layer loads. A MaybeAsync computation is a generator
// that yields a promise only when it must wait for one; run synchronously,
// it completes before returning unless a layer actually has to load.

import { PcpNeedsLayer } from './layerStack.ts'

/** A computation that yields the promises it must wait for. */
export type PcpMaybeAsync<T> = Generator<Promise<unknown>, T, unknown>

/**
 * Runs the computation synchronously until it yields a promise; only then
 * does it continue asynchronously. Returns the result, or a promise of it.
 */
export function pcpRunMaybeAsync<T>(computation: PcpMaybeAsync<T>): T | Promise<T> {
  const step = computation.next()
  if (step.done) return step.value
  return continueAsync(computation, step.value)
}

async function continueAsync<T>(computation: PcpMaybeAsync<T>, wait: Promise<unknown>): Promise<T> {
  for (;;) {
    let step: IteratorResult<Promise<unknown>, T>
    let value: unknown
    try {
      value = await wait
    } catch (error) {
      // The computation sees the rejection where it yielded.
      step = computation.throw(error)
      if (step.done) return step.value
      wait = step.value
      continue
    }
    step = computation.next(value)
    if (step.done) return step.value
    wait = step.value
  }
}

/**
 * Runs fn, loading each layer it reports missing and retrying until it
 * completes.
 */
export function* pcpRetryLoadingLayers<T>(
  load: (identifier: string) => Promise<void>, fn: () => T,
): PcpMaybeAsync<T> {
  for (;;) {
    try {
      return fn()
    } catch (e) {
      if (!(e instanceof PcpNeedsLayer)) throw e
      yield load(e.identifier)
    }
  }
}
