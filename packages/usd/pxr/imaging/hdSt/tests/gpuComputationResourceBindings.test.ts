// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompGpuComputation.cpp,
//  pxr/imaging/hdSt/flatNormals.cpp, pxr/imaging/hdSt/quadrangulate.cpp,
//  pxr/imaging/hdSt/smoothNormals.cpp, pxr/imaging/hdSt/subdivision.cpp,
//  pxr/imaging/hgi/handle.h
// Copyright 2016, 2017, 2018, 2020 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Storm's GPU computations cache their HgiResourceBindings in the resource
// registry under TfHash::Combine of the bound buffers' handle ids
// (hdSt/subdivision.cpp:1906-1914 for EvalStencils; smoothNormals.cpp,
// flatNormals.cpp, quadrangulate.cpp and extCompGpuComputation.cpp alike).
// Handle ids are uint64_t (hgi/handle.h:43-45), hashed as integrals, so two
// different sets of buffers never share a key. Hashing them as doubles
// (TfHashCombine of JS numbers) made distinct sets collide: on
// testHdStTransition0 (frame 3) a displayColor refinement reused the
// bindings of a points refinement and wrote its colors into the points
// buffer. Controller (Node) test on the recording Hgi of bufferTestHgi.ts;
// the Safari check is the hdst-programs testHdStTransition0 row.
import { describe, expect, it } from 'vitest'
import {
  HgiHandle,
  type HgiBufferHandle,
  type HgiResourceBindingsDesc,
} from 'typescript-usd/hgi'
import { HdType } from '../../hd/src/types.ts'
import { HdStResourceRegistry } from '../src/resourceRegistry.ts'
import { HdSt_GpuStencilTable, HdSt_Subdivision } from '../src/subdivision.ts'
import { BufferTestHgi } from './bufferTestHgi.ts'

/** The recording Hgi with stand-in shader, pipeline and resource-binding
 *  objects; `bindings` lists every HgiResourceBindingsDesc created. */
function computeTestHgi() {
  const hgi = new BufferTestHgi()
  const bindings: HgiResourceBindingsDesc[] = []
  const object = (desc: unknown) => new HgiHandle({
    getDescriptor: () => desc, isValid: () => true, getCompileErrors: () => '',
    getShaderFunctions: () => (desc as { shaderFunctions?: unknown[] }).shaderFunctions ?? [],
    getByteSizeOfResource: () => 0, getRawResource: () => null,
  }, hgi.getUniqueId())
  Object.assign(hgi, {
    CreateShaderFunction: object,
    createShaderProgram: object,
    CreateComputePipeline: object,
    _createResourceBindings: (desc: HgiResourceBindingsDesc) => { bindings.push(desc); return object(desc) },
  })
  return { hgi, bindings }
}

/** A buffer array range holding one resource per name, each a buffer with
 *  the given handle id. */
function range(resources: Record<string, number>, elementOffset = 0) {
  const handles = Object.fromEntries(Object.entries(resources).map(([name, id]) =>
    [name, new HgiHandle({ name }, id) as unknown as HgiBufferHandle]))
  return {
    getElementOffset: () => elementOffset,
    getResource: (name: string) => handles[name] && {
      getHandle: () => handles[name],
      getTupleType: () => ({ type: HdType.HdTypeFloatVec3, count: 1 }),
      getOffset: () => 0,
    },
  } as never
}

describe('Storm GPU computation resource bindings', () => {
  it('EvalStencils binds each dispatch\'s own buffers', () => {
    const { hgi, bindings } = computeTestHgi()
    const registry = new HdStResourceRegistry(hgi)
    const subdivision = new HdSt_Subdivision(false, 1)
    // The two handle-id sets of testHdStTransition0 frame 3 whose double
    // hashes collided: (sizes, offsets, indices, weights, primvar).
    const dispatches = [[630, 631, 632, 633, 613], [654, 655, 656, 657, 591]]
    for (const [sizes, offsets, indices, weights, primvar] of dispatches) {
      const table = new HdSt_GpuStencilTable(4, 9,
        range({ sizes: sizes!, offsets: offsets! }), range({ indices: indices!, weights: weights! }))
      subdivision.refineGPU(range({ points: primvar! }), 'points', table, registry)
    }
    expect(bindings.map(desc => desc.buffers.map(b => b.buffers[0]!.getId())))
      .toEqual(dispatches)
  })
})
