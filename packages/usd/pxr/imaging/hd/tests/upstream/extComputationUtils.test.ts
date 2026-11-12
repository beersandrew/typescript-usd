// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdExtComputationUtils.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/testenv/testHdExtComputationUtils.cpp
//
// Exercises HdExtComputationUtils.SampleComputedPrimvarValues over a small
// computation graph that adds together two aggregate inputs sampled at
// different times:
//
//   computationA -> computationB -> input1
//               \-> computationC -> input2
//
// computationA reads input1 (from B) and input2 (from C) and writes their sum
// to compOutput. The union of contributing sample times ({0,1,2,3} ∪ {0,2,4,6})
// is capped at maxSampleCount=5 to {0,1,2,3,4}; each scene input is resampled to
// those times and summed. The expected output samples are the .cpp's
// CHECK_SAMPLE assertions, produced by faithful resampling (not hardcoded).

import { describe, it, expect } from 'vitest'
import {
  HdExtComputationUtils,
  HdExtComputationContext,
  type HdExtComputationSceneDelegate,
  type HdExtComputationPrimvarDescriptor,
  type HdExtComputationInputSamples,
  type SampledValueStore,
} from '../../src/extComputationUtils.ts'
import {
  type HdExtComputationInputDescriptor,
  type HdExtComputationOutputDescriptor,
} from '../../src/extComputation.ts'

const pathA = '/path/to/A'
const compA = '/path/to/A/computationA'
const compB = '/path/to/A/computationB'
const compC = '/path/to/A/computationC'
const input1 = 'input1'
const input2 = 'input2'
const primvarName = 'outputPV'
const compOutputName = 'compOutput'

const floatType: HdExtComputationOutputDescriptor['valueType'] = {
  type: 'float',
  count: 1,
}

// Delegate that implements a simple computation, which adds together inputs
// from two aggregate computations. Mirrors ExtComputationTestDelegate.
class ExtComputationTestDelegate implements HdExtComputationSceneDelegate {
  getExtComputationPrimvarDescriptors(
    id: string,
    interpolationMode: string,
  ): HdExtComputationPrimvarDescriptor[] {
    if (id === pathA && interpolationMode === 'constant') {
      return [
        {
          name: primvarName,
          interpolation: 'constant',
          role: 'none',
          sourceComputationId: compA,
          sourceComputationOutputName: compOutputName,
          valueType: floatType,
        },
      ]
    }
    return []
  }

  getExtComputationSceneInputNames(computationId: string): string[] {
    if (computationId === compB) {
      return [input1]
    } else if (computationId === compC) {
      return [input2]
    }
    return []
  }

  getExtComputationInputDescriptors(
    computationId: string,
  ): HdExtComputationInputDescriptor[] {
    if (computationId === compA) {
      return [
        {
          name: input1,
          sourceComputationId: compB,
          sourceComputationOutputName: input1,
        },
        {
          name: input2,
          sourceComputationId: compC,
          sourceComputationOutputName: input2,
        },
      ]
    }
    return []
  }

  getExtComputationOutputDescriptors(
    computationId: string,
  ): HdExtComputationOutputDescriptor[] {
    if (computationId === compA) {
      return [{ name: compOutputName, valueType: floatType }]
    }
    return []
  }

  sampleExtComputationInput(
    computationId: string,
    input: string,
    maxSampleCount: number,
  ): HdExtComputationInputSamples {
    const numSamples = Math.min(4, maxSampleCount)
    const times: number[] = []
    const values: number[] = []

    // The two inputs have different sample times (0,1,2,3 and 0,2,4,6).
    if (computationId === compB && input === input1) {
      for (let i = 0; i < numSamples; ++i) {
        times.push(i)
        values.push(i)
      }
    } else if (computationId === compC && input === input2) {
      for (let i = 0; i < numSamples; ++i) {
        times.push(i * 2)
        values.push(i)
      }
    }

    return { times, values }
  }

  invokeExtComputation(
    computationId: string,
    context: HdExtComputationContext,
  ): void {
    if (computationId !== compA) {
      return
    }
    const val1 = context.getInputValue(input1)
    const val2 = context.getInputValue(input2)
    context.setOutputValue(compOutputName, val1 + val2)
  }
}

describe('HdExtComputationUtils.SampleComputedPrimvarValues', () => {
  it('evaluates a computation chain over the union of input sample times', () => {
    const delegate = new ExtComputationTestDelegate()

    const compPrimvars = delegate.getExtComputationPrimvarDescriptors(
      pathA,
      'constant',
    )

    // Evaluate the computation, and verify the output sample times and values.
    const valueStore: SampledValueStore = new Map()
    const maxSamples = 5
    const capacity = 4 // C++ SampledValueStore<4> template parameter
    HdExtComputationUtils.sampleComputedPrimvarValues(
      compPrimvars,
      delegate,
      maxSamples,
      valueStore,
      capacity,
    )

    expect(valueStore.size).toBe(1)

    const pvSamples = valueStore.get(primvarName)!
    expect(pvSamples.count).toBe(maxSamples)

    expect(pvSamples.times.slice(0, maxSamples)).toEqual([0, 1, 2, 3, 4])
    expect(pvSamples.values.slice(0, maxSamples)).toEqual([0, 1.5, 3.0, 4.5, 5.0])
  })
})
