// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStSubResourceRegistry.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/testenv/testHdStSubResourceRegistry.cpp
// (OpenUSD 26.11.1), over the recording test Hgi (tests/bufferTestHgi.ts)
// instead of a platform Hgi with a GL context.

import { describe, expect, it } from 'vitest'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import { TfErrorMark } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  ResourceRegistry as HdResourceRegistry,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
} from 'typescript-usd/hd'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { BufferTestHgi } from '../bufferTestHgi.ts'

/** testHdStSubResourceRegistry.cpp:24-77 */
class My_ResourceRegistry extends HdResourceRegistry {
  private _commitCount = 0
  private _garbageCollectCount = 0
  constructor(private readonly _hdStResourceRegistry: HdStResourceRegistry) { super() }
  getCommitCount(): number { return this._commitCount }
  getGarbageCollectCount(): number { return this._garbageCollectCount }
  resetCounters(): void {
    this._commitCount = 0
    this._garbageCollectCount = 0
  }
  protected override _commit(): void {
    // Do an operation on the HdStResourceRegistry that lets us determine
    // when HdStResourceRegistry::_Commit is invoked.
    const points = new VtArray<GfVec3f>(
      [new GfVec3f(0), new GfVec3f(1), new GfVec3f(2)], VtValueTypes.GfVec3f)
    this._hdStResourceRegistry.addSource(
      new HdVtBufferSource(HdTokens.points, VtValue.createArray(points)))
    this._commitCount += 1
  }
  protected override _garbageCollect(): void {
    this._garbageCollectCount += 1
  }
}

/** testHdStSubResourceRegistry.cpp:79-125 */
function _GetSubResourceRegistry(hdStResourceRegistry: HdStResourceRegistry): My_ResourceRegistry {
  const perfLog = HdPerfLog.GetInstance()
  perfLog.resetCounters()

  const id = 'testHdStSubResourceRegistry'
  const factory = () => new My_ResourceRegistry(hdStResourceRegistry)
  const myResourceRegistry =
    hdStResourceRegistry.findOrCreateSubResourceRegistry(id, factory) as My_ResourceRegistry

  expect(myResourceRegistry instanceof My_ResourceRegistry).toBe(true)
  expect(myResourceRegistry.getCommitCount()).toBe(0)
  expect(myResourceRegistry.getGarbageCollectCount()).toBe(0)
  expect(perfLog.getCounter(HdPerfTokens.committed)).toBe(0)
  expect(perfLog.getCounter(HdPerfTokens.garbageCollected)).toBe(0)

  const again = hdStResourceRegistry.findOrCreateSubResourceRegistry(id, factory)
  expect(again).toBe(myResourceRegistry)
  return myResourceRegistry
}

describe('testHdStSubResourceRegistry', () => {
  it('creation, commit and garbage collection (testHdStSubResourceRegistry.cpp:79-216)', () => {
    const mark = new TfErrorMark()
    mark.setMark()
    const perfLog = HdPerfLog.GetInstance()
    perfLog.enable()

    const hdStResourceRegistry = new HdStResourceRegistry(new BufferTestHgi())
    const myResourceRegistry = _GetSubResourceRegistry(hdStResourceRegistry)

    // _CommitTest (testHdStSubResourceRegistry.cpp:127-160)
    perfLog.resetCounters()
    myResourceRegistry.resetCounters()
    hdStResourceRegistry.commit()
    expect(myResourceRegistry.getCommitCount()).toBe(1)
    expect(myResourceRegistry.getGarbageCollectCount()).toBe(0)
    expect(perfLog.getCounter(HdPerfTokens.committed)).toBe(1)
    expect(perfLog.getCounter(HdPerfTokens.garbageCollected)).toBe(0)
    myResourceRegistry.commit()
    expect(myResourceRegistry.getCommitCount()).toBe(2)
    expect(myResourceRegistry.getGarbageCollectCount()).toBe(0)
    expect(perfLog.getCounter(HdPerfTokens.committed)).toBe(1)
    expect(perfLog.getCounter(HdPerfTokens.garbageCollected)).toBe(0)

    // _GarbageCollectTest (testHdStSubResourceRegistry.cpp:162-193)
    perfLog.resetCounters()
    myResourceRegistry.resetCounters()
    hdStResourceRegistry.garbageCollect()
    expect(myResourceRegistry.getCommitCount()).toBe(0)
    expect(myResourceRegistry.getGarbageCollectCount()).toBe(1)
    expect(perfLog.getCounter(HdPerfTokens.committed)).toBe(0)
    expect(perfLog.getCounter(HdPerfTokens.garbageCollected)).toBe(2)
    myResourceRegistry.garbageCollect()
    expect(myResourceRegistry.getCommitCount()).toBe(0)
    expect(myResourceRegistry.getGarbageCollectCount()).toBe(2)
    expect(perfLog.getCounter(HdPerfTokens.committed)).toBe(0)
    expect(perfLog.getCounter(HdPerfTokens.garbageCollected)).toBe(3)

    expect(mark.isClean()).toBe(true)
    mark.clear()
  })
})
