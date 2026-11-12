// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/scoped.cpp,
//  pxr/base/tf/scoped.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/scoped.cpp, registrations
// TfScoped (Test_TfScoped, scoped.cpp:48-123) and TfScopedVar
// (Test_TfScopedVar, scoped.cpp:125-157), run by testTf.
//
// Adaptation (src/scoped.ts): the C++ destructor is Dispose(). TfScoped takes
// one callback, so the function-with-argument and member-function forms of
// TfScoped<F> become closures. TfScopedVar/TfScopedAutoVar take a
// { value } cell where C++ binds a reference.
import { describe, expect, it } from 'vitest'
import { TfScoped, TfScopedAutoVar, TfScopedVar } from '../../src/index.ts'

let x = false
const Func = () => { x = false }
const BoundFunc = (_y: { value: boolean }, value: boolean) => { x = value }
const ResetFunc = (_y: { value: boolean }) => { x = false }
class Resetter {
  constructor(private readonly reset: () => void) {}
  Reset(): void { this.reset() }
}

describe('TfScoped (testenv/scoped.cpp:48-123)', () => {
  it('runs the callback when the scope ends', () => {
    // Function
    expect(x).toBe(false)
    {
      x = true
      const scope = new TfScoped(Func)
      expect(x).toBe(true)
      scope.dispose()
    }
    expect(x).toBe(false)

    // std::bind
    {
      x = true
      const scope = new TfScoped(() => BoundFunc({ value: x }, false))
      expect(x).toBe(true)
      scope.dispose()
    }
    expect(x).toBe(false)

    // Function with arg
    {
      x = true
      const scope = new TfScoped(() => ResetFunc({ value: x }))
      expect(x).toBe(true)
      scope.dispose()
    }
    expect(x).toBe(false)

    // Method
    {
      const r = new Resetter(() => { x = false })
      x = true
      const scope = new TfScoped(() => r.Reset())
      expect(x).toBe(true)
      scope.dispose()
    }
    expect(x).toBe(false)
  })
})

describe('TfScopedVar (testenv/scoped.cpp:125-157)', () => {
  it('restores the previous value when the scope ends', () => {
    const b = { value: false }
    {
      const scope = new TfScopedVar(b, true)
      expect(b.value).toBe(true)
      scope.dispose()
    }
    expect(b.value).toBe(false)

    const y = { value: 5 }
    {
      const scope = new TfScopedAutoVar(y, 8)
      expect(y.value).toBe(8)
      scope.dispose()
    }
    expect(y.value).toBe(5)
  })
})
