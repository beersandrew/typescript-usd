// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBufferSourceDependency.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStBufferSourceDependency.cpp
// (OpenUSD 26.11.1). Upstream gets the registry from an HdRenderIndex over an
// HdStRenderDelegate and a platform Hgi; here the registry is constructed over
// the recording test Hgi (tests/bufferTestHgi.ts). The assertions are
// upstream's TF_VERIFYs and its clean error mark.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { NullBufferSource as HdNullBufferSource } from 'typescript-usd/hd'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { BufferTestHgi } from '../bufferTestHgi.ts'

/** testHdStBufferSourceDependency.cpp:22-26 */
abstract class ComputationBase extends HdNullBufferSource {
  abstract getResult(): number
}

/** testHdStBufferSourceDependency.cpp:28-50 */
class CpuComputation extends ComputationBase {
  private _result = 0
  constructor(private readonly _source: number) { super() }
  override resolve(): boolean {
    if (!this._tryLock()) return false
    this._result = this._source + 1
    this._setResolved()
    return true
  }
  getResult(): number { return this._result }
  protected override _checkValid(): boolean { return true }
}

/** testHdStBufferSourceDependency.cpp:52-77 */
class CpuDependentComputation extends ComputationBase {
  private _result = 0
  constructor(private readonly _other: ComputationBase) { super() }
  override resolve(): boolean {
    if (this._other && !this._other.isResolved()) return false
    if (!this._tryLock()) return false
    this._result = this._other.getResult() + 10
    this._setResolved()
    return true
  }
  getResult(): number { return this._result }
  protected override _checkValid(): boolean { return true }
}

describe('testHdStBufferSourceDependency', () => {
  it('resolves dependent CPU computations in order (testHdStBufferSourceDependency.cpp:79-165)', () => {
    const mark = new TfErrorMark()
    mark.setMark()
    const registry = new HdStResourceRegistry(new BufferTestHgi())

    {
      // just a computation.
      const comp = new CpuComputation(100)
      registry.addSource(comp)
      registry.commit()
      expect(comp.getResult()).toBe(101)
    }
    {
      // two computations, has to run sequentially.
      const comp1 = new CpuComputation(100)
      const comp2 = new CpuDependentComputation(comp1)
      registry.addSource(comp1)
      registry.addSource(comp2)
      registry.commit()
      expect(comp1.getResult()).toBe(101)
      expect(comp2.getResult()).toBe(111)
    }
    {
      // registring order shouldn't be a problem.
      const comp1 = new CpuComputation(100)
      const comp2 = new CpuDependentComputation(comp1)
      registry.addSource(comp2)
      registry.addSource(comp1)
      registry.commit()
      expect(comp1.getResult()).toBe(101)
      expect(comp2.getResult()).toBe(111)
    }
    {
      // three computations, has to run sequentially.
      const comp1 = new CpuComputation(100)
      const comp2 = new CpuDependentComputation(comp1)
      const comp3 = new CpuDependentComputation(comp2)
      registry.addSource(comp1)
      registry.addSource(comp2)
      registry.addSource(comp3)
      registry.commit()
      expect(comp1.getResult()).toBe(101)
      expect(comp2.getResult()).toBe(111)
      expect(comp3.getResult()).toBe(121)
    }
    {
      // many computations, can be run in parallel once comp1 has finished.
      const comp1 = new CpuComputation(100)
      registry.addSource(comp1)
      const comps: CpuDependentComputation[] = []
      for (let i = 0; i < 100; ++i) {
        const comp = new CpuDependentComputation(comp1)
        registry.addSource(comp)
        comps.push(comp)
      }
      registry.commit()
      expect(comp1.getResult()).toBe(101)
      for (let i = 0; i < 100; ++i) {
        expect(comps[i]!.getResult()).toBe(111)
      }
    }

    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
    mark.clear()
  })
})
