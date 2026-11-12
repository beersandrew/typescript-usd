import { describe, expect, it } from 'vitest'
import { ArResolverContext } from '../../src/resolverContext.ts'
import { _getArTraceContext, _withArTraceContext } from '../../src/internal.ts'

describe('private Ar trace-context carrier', () => {
  it('does not install a carrier without a resolver context', async () => {
    const result = await _withArTraceContext(undefined, undefined, () => 42)

    expect(result).toBe(42)
    expect(_getArTraceContext(undefined)).toBeUndefined()
  })

  it('does not resurrect an earlier overlapping installation', async () => {
    const resolverContext = new ArResolverContext()
    const firstContext = { laneId: 'first' }
    const secondContext = { laneId: 'second' }
    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve })

    const first = _withArTraceContext(resolverContext, firstContext, () => firstGate)
    const second = _withArTraceContext(resolverContext, secondContext, () => secondGate)
    expect(_getArTraceContext(resolverContext)).toBe(secondContext)

    releaseFirst()
    await first
    expect(_getArTraceContext(resolverContext)).toBe(secondContext)

    releaseSecond()
    await second
    expect(_getArTraceContext(resolverContext)).toBeUndefined()
  })
})
