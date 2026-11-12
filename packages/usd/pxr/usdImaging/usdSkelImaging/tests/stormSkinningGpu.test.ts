// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompGpuComputation.cpp,
//  pxr/imaging/hdSt/extCompGpuComputationResource.cpp,
//  pxr/usdImaging/usdSkelImaging/extComputations.cpp,
//  pxr/usdImaging/usdSkelImaging/shaders/skinning.glslfx
// Copyright 2017, 2019, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test (Node, no GPU): the arm scene through Storm with the
// default settings. The skinning computation carries the skinning.glslfx
// kernel (pxr/usdImaging/usdSkelImaging/extComputations.cpp:539-580), so
// HdSt_GetExtComputationPrimvarsComputations
// (pxr/imaging/hdSt/extCompGpuComputation.cpp:415-449) schedules an
// HdStExtCompGpuComputation: the points are reserve-only and the compute
// program generated from the kernel (extCompGpuComputationResource.cpp:
// 43-148) is dispatched once per element (extCompGpuComputation.cpp:96-276)
// on every sync that dirties the points. The test Hgi records the work
// without executing it; the dispatch count is the reference build's
// elementCount (fixtures/sceneIndex/arm.t7.txt).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiBindResourceType, HgiShaderStageBits, type HgiResourceBindingsDesc } from 'typescript-usd/hgi'
import { TfErrorMark } from 'typescript-usd/tf'
import { UsdSkelImagingExtComputationGlslKernel } from 'typescript-usd/usdSkelImaging'
import { StormArmScene } from './stormSkinningHarness.ts'

const capture = readFileSync(new URL('fixtures/sceneIndex/arm.t7.txt', import.meta.url), 'utf8')
const dispatchCount = Number(/skinningPointsComputation type=extComputation[\s\S]*?dispatchCount=(\d+)/
  .exec(capture)![1])

describe('arm.usda skinned by Storm on the GPU (HdStExtCompGpuComputation)', () => {
  it('dispatches the skinning compute program on each points sync', async () => {
    const arm = await StormArmScene()
    const mark = new TfErrorMark()

    const extCompDispatches = () => {
      const result: number[] = []
      let inExtComp = false
      for (const c of arm.hgi.calls) {
        if (c.call === 'compute.PushDebugGroup') inExtComp = c.args[0] === 'ExtComputation'
        if (inExtComp && c.call === 'compute.Dispatch') result.push(c.args[0] as number)
      }
      return result
    }

    arm.syncAt(7)
    expect(extCompDispatches()).toEqual([dispatchCount])
    arm.syncAt(1)
    arm.syncAt(10)
    expect(extCompDispatches()).toEqual([dispatchCount, dispatchCount, dispatchCount])
    expect(mark.isClean()).toBe(true)

    // The compute program's source is the code generator's output around
    // the kernel of skinning.glslfx.
    const kernel = UsdSkelImagingExtComputationGlslKernel('classicLinear', 'points')!
      .getTypedValue(0)
    const computeDescs = arm.hgi.shaderFunctionDescs.filter(d =>
      d.shaderStage === HgiShaderStageBits.HgiShaderStageCompute &&
      (d.shaderCode ?? '').includes('HdSet_skinnedPoints'))
    expect(computeDescs.length).toBe(1)
    const body = kernel.slice(kernel.indexOf('void compute(int index)'))
    expect(computeDescs[0]!.shaderCode).toContain(body.trim())

    // The resource bindings: the output points buffer is the only writable
    // storage buffer (extCompGpuComputation.cpp:216-250).
    const bindings = arm.hgi.calls.filter(c => c.call === 'hgi.CreateResourceBindings')
      .map(c => c.args[0] as HgiResourceBindingsDesc)
      .filter(d => d.debugName === 'ExtComputation')
    expect(bindings.length).toBeGreaterThan(0)
    for (const { buffers } of bindings) {
      expect(buffers.every(b => b.resourceType === HgiBindResourceType.HgiBindResourceTypeStorageBuffer)).toBe(true)
      expect(buffers.filter(b => b.writable).length).toBe(1)
    }
  })
})
