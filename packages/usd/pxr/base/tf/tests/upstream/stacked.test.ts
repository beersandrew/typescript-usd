// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/stacked.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/testenv/stacked.cpp (testTf registration
// TfStacked). Destructors are
// Dispose(); the std::thread cases run on logical lanes (logicalLane.ts).
import { describe, expect, it } from 'vitest'
import { TfStacked } from '../../src/index.ts'
import { Tf_RunInNewLane } from '../../src/logicalLane.ts'

// stacked.cpp:23-28
class Tf_SafeStacked extends TfStacked {
  constructor(readonly value: number) { super() }
}

// stacked.cpp:30-35: TF_DEFINE_STACKED(Tf_UnsafeStacked, false, )
class Tf_UnsafeStacked extends TfStacked {
  static override readonly PerThread = false
  constructor(readonly value: number) { super() }
}

// stacked.cpp:38-49
class Tf_FallbackStacked extends TfStacked {
  constructor(readonly value: number) { super() }
  static override _initializeStack(): void {
    new Tf_FallbackStacked(-2)
    new Tf_FallbackStacked(-1)
  }
}

interface Probe {
  make(v: number): TfStacked & { value: number }
  top(): { value: number } | undefined
  previous(): { value: number } | undefined
  stack(): readonly { value: number }[]
}

const safe: Probe = {
  make: v => new Tf_SafeStacked(v),
  top: () => Tf_SafeStacked.getStackTop(),
  previous: () => Tf_SafeStacked.getStackPrevious(),
  stack: () => Tf_SafeStacked.getStack(),
}
const unsafe: Probe = {
  make: v => new Tf_UnsafeStacked(v),
  top: () => Tf_UnsafeStacked.getStackTop(),
  previous: () => Tf_UnsafeStacked.getStackPrevious(),
  stack: () => Tf_UnsafeStacked.getStack(),
}

// stacked.cpp:62-130 (Test<Stacked>)
function runTest(s: Probe): void {
  expect(s.top()).toBeUndefined()
  expect(s.previous()).toBeUndefined()
  expect(s.stack().length).toBe(0)

  const a = s.make(1)
  const b = s.make(2)
  expect(s.top()!.value).toBe(2)
  expect(s.previous()!.value).toBe(1)
  expect(s.stack().map(x => x.value)).toEqual([1, 2])

  const c = s.make(3)
  const d = s.make(4)
  const e = s.make(5)
  expect(s.top()!.value).toBe(5)
  expect(s.previous()!.value).toBe(4)
  expect(s.stack().map(x => x.value)).toEqual([1, 2, 3, 4, 5])
  e.dispose(); d.dispose(); c.dispose()

  expect(s.top()!.value).toBe(2)
  expect(s.previous()!.value).toBe(1)
  expect(s.stack().map(x => x.value)).toEqual([1, 2])
  b.dispose(); a.dispose()

  expect(s.top()).toBeUndefined()
  expect(s.previous()).toBeUndefined()
  expect(s.stack().length).toBe(0)
}

describe('TfStacked (testenv/stacked.cpp)', () => {
  it('Test<Tf_SafeStacked>', () => runTest(safe))
  it('Test<Tf_UnsafeStacked>', () => runTest(unsafe))

  // stacked.cpp:133-140 and :150-158: the fallback initializer runs once per lane.
  it('runs TestFallbackStackedInAThread on many lanes', async () => {
    await Promise.all(Array.from({ length: 8 }, () => Tf_RunInNewLane(async () => {
      await Promise.resolve()
      expect(Tf_FallbackStacked.getStackTop()!.value).toBe(-1)
      expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(-2)
    })))
  })

  // stacked.cpp:161-185
  it('keeps fallback values beneath pushed values', () => {
    expect(Tf_FallbackStacked.getStackTop()!.value).toBe(-1)
    expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(-2)
    const s = new Tf_FallbackStacked(1234)
    expect(Tf_FallbackStacked.getStackTop()).toBe(s)
    expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(-1)
    const t = new Tf_FallbackStacked(2345)
    expect(Tf_FallbackStacked.getStackTop()).toBe(t)
    expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(1234)
    t.dispose()
    expect(Tf_FallbackStacked.getStackTop()!.value).toBe(1234)
    expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(-1)
    s.dispose()
    expect(Tf_FallbackStacked.getStackTop()!.value).toBe(-1)
    expect(Tf_FallbackStacked.getStackPrevious()!.value).toBe(-2)
  })
})

describe('TfStacked storage', () => {
  it('gives each lane its own per-thread stack and shares a global one', () => {
    const outerSafe = new Tf_SafeStacked(1)
    const outerUnsafe = new Tf_UnsafeStacked(1)
    Tf_RunInNewLane(() => {
      expect(Tf_SafeStacked.getStack()).toEqual([])
      expect(Tf_UnsafeStacked.getStack()).toEqual([outerUnsafe])
      const inner = new Tf_SafeStacked(2)
      expect(Tf_SafeStacked.getStack()).toEqual([inner])
      inner.dispose()
    })
    expect(Tf_SafeStacked.getStack()).toEqual([outerSafe])
    outerUnsafe.dispose()
    outerSafe.dispose()
  })

  it('keeps interleaved asynchronous lanes apart across awaits', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const seen: number[][] = []
    const lane = (v: number) => Tf_RunInNewLane(async () => {
      const s = new Tf_SafeStacked(v)
      await gate
      seen.push(Tf_SafeStacked.getStack().map(x => x.value))
      s.dispose()
    })
    const all = Promise.all([lane(1), lane(2), lane(3)])
    release()
    await all
    expect(seen).toEqual([[1], [2], [3]])
    expect(Tf_SafeStacked.getStack()).toEqual([])
  })

  // stacked.h:182-193: destroying out of order is a fatal error.
  it('refuses to pop out of stack order', () => {
    const a = new Tf_SafeStacked(1)
    const b = new Tf_SafeStacked(2)
    expect(() => a.dispose()).toThrow(/out of stack order/)
    b.dispose()
    a.dispose()
    expect(Tf_SafeStacked.getStack()).toEqual([])
  })
})
