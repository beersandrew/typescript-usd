import { afterEach, describe, expect, it } from 'vitest'
import { timed, timedAsync } from '../src/load-timing'

const spans = () => performance.getEntriesByType('measure').filter(e => e.name.startsWith('usdview:')).map(e => e.name)

describe('load timing spans', () => {
  afterEach(() => performance.clearMeasures())

  it('records a synchronous span and returns its value, also when it throws', () => {
    expect(timed('sync', () => 42)).toBe(42)
    expect(() => timed('fails', () => { throw new Error('x') })).toThrow('x')
    expect(spans()).toEqual(['usdview:sync', 'usdview:fails'])
  })

  it('returns the async function\'s own promise and records the span once it settles', async () => {
    const promise = Promise.resolve(7)
    const rejected = Promise.reject(new Error('no'))
    expect(timedAsync('open', () => promise)).toBe(promise)
    const failing = timedAsync('broken', () => rejected)
    expect(failing).toBe(rejected)
    await expect(failing).rejects.toThrow('no')
    await promise
    expect(spans().sort()).toEqual(['usdview:broken', 'usdview:open'])
  })
})
