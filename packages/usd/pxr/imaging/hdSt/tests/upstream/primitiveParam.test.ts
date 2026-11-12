// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStPrimitiveParam.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStPrimitiveParam.cpp (OpenUSD 26.11.1).
//
// Each upstream comparison runs twice:
// - "(registry)": the upstream flow, committed through an HdStResourceRegistry
//   and read back with HdBufferArrayRange::ReadData. Upstream uses the render
//   index's registry over the platform Hgi (testHdStPrimitiveParam.cpp:356-385); here the
//   registry runs over the recording test Hgi (tests/bufferTestHgi.ts), which
//   keeps buffer bytes on the CPU.
// - "(cpu)": the index builders resolved directly; the primitive params are
//   the first chained buffer of the resolved index builder.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Array as VtArray } from 'typescript-usd/vt'
import {
  MeshTopology as HdMeshTopology,
  MeshUtil as HdMeshUtil,
  Tokens as HdTokens,
  Type as HdType,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import { HdSt_MeshTopology } from '../../src/meshTopology.ts'
import {
  CreateTestRegistry, ReadData, SourceComponents, ArrayComponents, type TestRegistry,
} from './meshTopologyTestUtils.ts'

// testHdStPrimitiveParam.cpp:39-44
const _tokens = { bilinear: 'bilinear', leftHanded: 'leftHanded', rightHanded: 'rightHanded' }

interface PrimitiveIDCase {
  name: string, numVerts: number[], verts: number[], expectedTri: number[], expectedQuad: number[]
}

// PrimitiveIDMapTest (testHdStPrimitiveParam.cpp:217-316)
const primitiveIDCases: PrimitiveIDCase[] = [
  // testHdStPrimitiveParam.cpp:227-254
  { name: 'triangle', numVerts: [3], verts: [0, 1, 2], expectedTri: [0], expectedQuad: [0, 0, 0] },
  // testHdStPrimitiveParam.cpp:255-282
  { name: 'quad', numVerts: [4], verts: [0, 1, 2, 3], expectedTri: [0, 0], expectedQuad: [0] },
  // testHdStPrimitiveParam.cpp:283-314
  { name: 'polygons', numVerts: [3, 4, 5], verts: [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7],
    expectedTri: [0, 1, 1, 2, 2, 2], expectedQuad: [0, 0, 0, 1, 2, 2, 2, 2, 2] },
]

// PtexFaceIndexTest (testHdStPrimitiveParam.cpp:318-354)
const ptexCase = {
  name: 'polygons', numVerts: [3, 4, 5], verts: [0, 1, 2, 0, 2, 3, 4, 4, 3, 5, 6, 7],
  expectedQuad: [0, 1, 2, 3, 4, 5, 6, 7, 8],
}

function _BuildIndexSource(
  m: HdSt_MeshTopology, id: SdfPath, quadrangulate: boolean,
  addSource: (quadInfo: HdBufferSource) => void,
): HdBufferSource {
  if (quadrangulate) {
    const quadInfo = m.getQuadInfoBuilderComputation(/*gpu=*/false, id)
    addSource(quadInfo)
    return m.getQuadIndexBuilderComputation(id)
  }
  return m.getTriangleIndexBuilderComputation(id)
}

/** _ComparePrimitiveIDMap (testHdStPrimitiveParam.cpp:73-137) */
function _ComparePrimitiveIDMap(registry: TestRegistry, name: string, orientation: string,
  numVerts: number[], verts: number[], expectedMapping: number[], quadrangulate: boolean): void {
  const topology = new HdMeshTopology(_tokens.bilinear, orientation, numVerts, verts)
  const m = HdSt_MeshTopology.new(topology, 0)
  const id = SdfPath.fromString(name)

  const source = _BuildIndexSource(m, id, quadrangulate, q => registry.addSource(q))

  const range = registry.allocateNonUniformBufferArrayRange(
    HdTokens.topology, source.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)
  registry.addSource(range, source)

  // execute
  registry.commit()

  // resultValue is VtIntArray (tri or quad)
  const result = ReadData(range, HdTokens.primitiveParam).Get<VtArray<number>>()
  expect(result.getElementType().getTypeName()).toBe('int')
  const faceIndices = ArrayComponents(result).map(p =>
    HdMeshUtil.decodeFaceIndexFromCoarseFaceParam(p))
  expect(faceIndices).toEqual(expectedMapping)
}

/** The primitive params of a directly resolved index builder: its first
 *  chained buffer (triangulate.cpp:80-84, quadrangulate.cpp:208-212). */
function _ResolvedPrimitiveParams(name: string, orientation: string,
  numVerts: number[], verts: number[], quadrangulate: boolean): number[] {
  const topology = new HdMeshTopology(_tokens.bilinear, orientation, numVerts, verts)
  const m = HdSt_MeshTopology.new(topology, 0)
  const id = SdfPath.fromString(name)
  const source = _BuildIndexSource(m, id, quadrangulate, q => expect(q.resolve()).toBe(true))
  expect(source.resolve()).toBe(true)
  expect(source.hasChainedBuffer()).toBe(true)
  const primitiveParam = source.getChainedBuffers()[0]!
  expect(primitiveParam.getName()).toBe(HdTokens.primitiveParam)
  expect(primitiveParam.getTupleType()).toEqual({ type: HdType.HdTypeInt32, count: 1 })
  return SourceComponents(primitiveParam, Int32Array)
}

/** _ComparePtexFaceIndex (testHdStPrimitiveParam.cpp:139-196) */
function _ComparePtexFaceIndex(registry: TestRegistry, name: string, orientation: string,
  numVerts: number[], verts: number[], expectedMapping: number[]): void {
  const topology = new HdMeshTopology(_tokens.bilinear, orientation, numVerts, verts)
  const m = HdSt_MeshTopology.new(topology, 0)

  const source = _BuildIndexSource(m, SdfPath.fromString(name), true, q => registry.addSource(q))

  const range = registry.allocateNonUniformBufferArrayRange(
    HdTokens.topology, source.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)
  registry.addSource(range, source)

  // execute
  registry.commit()

  const result = ReadData(range, HdTokens.primitiveParam).Get<VtArray<number>>()
  expect(result.getElementType().getTypeName()).toBe('int')
  const ptexIndices = ArrayComponents(result).map((_, i) => i)
  expect(ptexIndices).toEqual(expectedMapping)
}

function _Clean(fn: () => void): void {
  const mark = new TfErrorMark()
  fn()
  expect(mark.isClean()).toBe(true)
}

describe('testHdStPrimitiveParam (cpu)', () => {
  for (const c of primitiveIDCases) {
    it(`PrimitiveIDMapTest ${c.name} tri`, () => _Clean(() => {
      const params = _ResolvedPrimitiveParams(c.name, _tokens.rightHanded, c.numVerts, c.verts, false)
      expect(params.map(p => HdMeshUtil.decodeFaceIndexFromCoarseFaceParam(p))).toEqual(c.expectedTri)
    }))
    it(`PrimitiveIDMapTest ${c.name} quad`, () => _Clean(() => {
      const params = _ResolvedPrimitiveParams(c.name, _tokens.rightHanded, c.numVerts, c.verts, true)
      expect(params.map(p => HdMeshUtil.decodeFaceIndexFromCoarseFaceParam(p))).toEqual(c.expectedQuad)
    }))
  }
  it('PtexFaceIndexTest', () => _Clean(() => {
    const params = _ResolvedPrimitiveParams(ptexCase.name, _tokens.rightHanded,
      ptexCase.numVerts, ptexCase.verts, true)
    expect(params.map((_, i) => i)).toEqual(ptexCase.expectedQuad)
  }))
})

describe('testHdStPrimitiveParam (registry)', () => {
  // PrimitiveIDMapTest (testHdStPrimitiveParam.cpp:217-316)
  for (const c of primitiveIDCases) {
    it(`PrimitiveIDMapTest ${c.name} tri`, () => _Clean(() =>
      _ComparePrimitiveIDMap(CreateTestRegistry(), c.name, _tokens.rightHanded,
        c.numVerts, c.verts, c.expectedTri, false)))
    it(`PrimitiveIDMapTest ${c.name} quad`, () => _Clean(() =>
      _ComparePrimitiveIDMap(CreateTestRegistry(), c.name, _tokens.rightHanded,
        c.numVerts, c.verts, c.expectedQuad, true)))
  }
  // PtexFaceIndexTest (testHdStPrimitiveParam.cpp:318-354)
  it('PtexFaceIndexTest', () => _Clean(() =>
    _ComparePtexFaceIndex(CreateTestRegistry(), ptexCase.name, _tokens.rightHanded,
      ptexCase.numVerts, ptexCase.verts, ptexCase.expectedQuad)))
})
