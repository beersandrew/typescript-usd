// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdRequestExpiration.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdRequestExpiration.cpp
//
// Opening a stage is asynchronous here (testHelpers.ts _OpenStage).
// UsdAttribute() (an invalid attribute) is an Attribute handle with no
// stage, `new UsdAttribute('')`. InvalidationAccumulator is passed by
// std::ref upstream: the callback closes over the accumulator. `|=` on
// EfTimeInterval is OrAssign. Scope-end destructors are Destroy()
// (TfErrorMark: Dispose()).

import { describe, it } from 'vitest'
import { TF_AXIOM, TfErrorMark } from 'typescript-usd/tf'
import { Attribute as UsdAttribute, type Stage as UsdStage } from 'typescript-usd/usd'
import { EfTimeInterval } from 'typescript-usd/ef'
import type { ExecRequestIndexSet } from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage } from '../testHelpers.ts'

// Accumulates indices and intervals sent by request invalidation.
class InvalidationAccumulator {
  private readonly _indices: ExecRequestIndexSet = new Set()
  private readonly _interval = new EfTimeInterval()

  // operator()
  readonly callback = (
    indices: ReadonlySet<number>,
    interval: EfTimeInterval,
  ): void => {
    for (const i of indices) {
      this._indices.add(i)
    }
    this._interval.orAssign(interval)
  }

  getIndices(): ExecRequestIndexSet {
    return this._indices
  }

  getInterval(): EfTimeInterval {
    return this._interval
  }
}

async function CreateTestStage(): Promise<UsdStage> {
  const stage = await _OpenStage(
    `#usda 1.0

        def "A"
        {
            custom double x = 1
        }

        def "B"
        {
            custom double x = 2
        }

        def "C"
        {
            custom double x = 3
        }
        `)
  TF_AXIOM(stage)
  return stage
}

describe('testExecUsdRequestExpiration', () => {
  // Tests that requests built with invalid keys are expired from the start.
  it('TestBuildRequestExpiration', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
      new ExecUsdValueKey(new UsdAttribute(''))],
    accumulator.callback)
    TF_AXIOM(!request.isValid())
    // Note that we don't expect to receive any invalidation in this case
    // because the request has not been computed.
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    request.destroy()
    system.destroy()
  })

  // Tests that unprepared requests expire when scene objects become invalid.
  it('TestUnpreparedRequestExpiration', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
      new ExecUsdValueKey(stage.getAttributeAtPath('/B.x')!)],
    accumulator.callback)
    TF_AXIOM(request.isValid())

    stage.removePrim('/B')
    TF_AXIOM(!request.isValid())
    // Note that we don't expect to receive any invalidation in this case
    // because the request has not been computed.
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    {
      const m = new TfErrorMark()
      system.prepareRequest(request)
      TF_AXIOM(!m.isClean())
      m.clear()
      m.dispose()
    }

    {
      const m = new TfErrorMark()
      system.compute(request)
      TF_AXIOM(!m.isClean())
      m.clear()
      m.dispose()
    }

    request.destroy()
    system.destroy()
  })

  // Tests that prepared (but not computed) requests expire when scene
  // objects become invalid.
  //
  it('TestPreparedRequestExpiration', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
      new ExecUsdValueKey(stage.getAttributeAtPath('/B.x')!)],
    accumulator.callback)
    TF_AXIOM(request.isValid())
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    {
      const m = new TfErrorMark()
      system.prepareRequest(request)
      TF_AXIOM(m.isClean())
      m.dispose()
    }

    stage.removePrim('/B')
    TF_AXIOM(!request.isValid())
    // Note that we don't expect to receive any invalidation in this case
    // because the request has not been computed.
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    {
      const m = new TfErrorMark()
      system.compute(request)
      TF_AXIOM(!m.isClean())
      m.clear()
      m.dispose()
    }

    request.destroy()
    system.destroy()
  })

  // Tests that computed requests expire and value invalidation callbacks
  // are notified when scene objects become invalid.
  //
  it('TestComputedRequestExpiration', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
      new ExecUsdValueKey(stage.getAttributeAtPath('/B.x')!)],
    accumulator.callback)
    TF_AXIOM(request.isValid())
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    {
      const m = new TfErrorMark()
      system.prepareRequest(request)
      TF_AXIOM(m.isClean())
      TF_AXIOM(accumulator.getIndices().size === 0)
      TF_AXIOM(accumulator.getInterval().IsEmpty())
      m.dispose()
    }

    {
      const m = new TfErrorMark()
      system.compute(request)
      TF_AXIOM(m.isClean())
      TF_AXIOM(accumulator.getIndices().size === 0)
      TF_AXIOM(accumulator.getInterval().IsEmpty())
      m.dispose()
    }

    stage.removePrim('/B')
    TF_AXIOM(!request.isValid())

    TF_AXIOM(accumulator.getIndices().size === 1)
    TF_AXIOM(accumulator.getIndices().has(1))
    TF_AXIOM(accumulator.getInterval().isFullInterval())

    request.destroy()
    system.destroy()
  })

  // Tests that a request is not expired when unrelated scene objects become
  // invalid.
  //
  it('TestUnrelatedSceneObject', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
      new ExecUsdValueKey(stage.getAttributeAtPath('/B.x')!)],
    accumulator.callback)
    TF_AXIOM(request.isValid())
    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    system.compute(request)

    stage.removePrim('/C')
    TF_AXIOM(request.isValid())

    TF_AXIOM(accumulator.getIndices().size === 0)
    TF_AXIOM(accumulator.getInterval().IsEmpty())

    request.destroy()
    system.destroy()
  })

  // Tests that unexpired indices continue to receive invalidation even after
  // another index has been expired.
  //
  it('TestInvalidateUnexpiredIndex', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)
    const accumulator = new InvalidationAccumulator()

    const ax = stage.getAttributeAtPath('/A.x')!
    const bx = stage.getAttributeAtPath('/B.x')!
    const cx = stage.getAttributeAtPath('/C.x')!

    const request = system.buildRequest([
      new ExecUsdValueKey(ax), new ExecUsdValueKey(bx), new ExecUsdValueKey(cx)],
    accumulator.callback)

    system.compute(request)

    bx.set(3.0)
    TF_AXIOM(accumulator.getIndices().size === 1)
    TF_AXIOM(accumulator.getIndices().has(1))

    stage.removePrim('/C')
    TF_AXIOM(accumulator.getIndices().size === 2)
    TF_AXIOM(accumulator.getIndices().has(2))

    ax.set(2.0)
    TF_AXIOM(accumulator.getIndices().size === 3)
    TF_AXIOM(accumulator.getIndices().has(0))

    request.destroy()
    system.destroy()
  })

  // Tests the behavior of a request that contains no value keys. Empty
  // requests are always valid, and they remain valid across any scene change
  // because they have no value keys that can expire the request.
  //
  // When a scene change leaves a request with 0 valid value keys, the
  // request is discarded. An empty request remains valid after being
  // discarded, as opposed to a non-empty request, which remains invalid
  // after all value keys have expired.
  //
  it('TestEmptyRequest', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)

    const request = system.buildRequest([])

    // Empty request is valid after construction.
    TF_AXIOM(request.isValid())

    // Empty request remains valid for all scene changes.
    stage.removePrim('/A')
    stage.removePrim('/B')
    stage.removePrim('/C')
    TF_AXIOM(request.isValid())

    request.destroy()
    system.destroy()
  })

  // Tests that expiring the provider of the last value key in the request
  // causes the request to become invalid.
  //
  it('TestExpireLastValueKey', async () => {
    const stage = await CreateTestStage()
    const system = new ExecUsdSystem(stage)

    const request = system.buildRequest([
      new ExecUsdValueKey(stage.getAttributeAtPath('/A.x')!),
    ])

    TF_AXIOM(request.isValid())

    stage.removePrim('/A')
    TF_AXIOM(!request.isValid())

    request.destroy()
    system.destroy()
  })
})
