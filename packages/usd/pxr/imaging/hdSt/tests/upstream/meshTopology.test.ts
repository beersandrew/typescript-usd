// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp (OpenUSD 26.11.1).
//
// Each upstream comparison runs twice:
// - "(registry)": the upstream flow, committed through an HdStResourceRegistry
//   and read back with HdBufferArrayRange::ReadData. Upstream uses the render
//   index's registry over the platform Hgi (testHdStMeshTopology.cpp:1000-1032); here the
//   registry runs over the recording test Hgi (tests/bufferTestHgi.ts), which
//   keeps buffer bytes on the CPU but has no compute pipelines, so the cases
//   that run a GPU computation (smooth/flat normals "_gpu") are skipped in
//   Node (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute)); they run in Safari
//   over HgiWebGPU with tests/browser/storm-image/hdst-gpu/run.mjs (read-back
//   through ReadDataAsync).
// - "(cpu)": the same computations resolved directly on the CPU, checking
//   the resolved buffer sources against the same expected values.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Array as VtArray } from 'typescript-usd/vt'
import {
  MeshTopology as HdMeshTopology,
  VtBufferSource as HdVtBufferSource,
  Tokens as HdTokens,
  Type as HdType,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  _SmoothNormals as Hd_SmoothNormals,
  _FlatNormals as Hd_FlatNormals,
  type BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import { HdSt_MeshTopology } from '../../src/meshTopology.ts'
import {
  HdSt_VertexAdjacencyBuilder,
  HdSt_VertexAdjacencyBufferSource,
} from '../../src/vertexAdjacency.ts'
import { HdSt_SmoothNormalsComputationGPU } from '../../src/smoothNormals.ts'
import { HdSt_FlatNormalsComputationGPU } from '../../src/flatNormals.ts'
import {
  CreateTestRegistry, ReadDataAsync, Vec3fArray, Vec3dArray, FloatArray,
  SourceComponents, ArrayComponents, ExpectClose3, VtValue, GpuComputeUnavailable,
  type TestRegistry,
} from './meshTopologyTestUtils.ts'

// testHdStMeshTopology.cpp:43-48
const _tokens = { bilinear: 'bilinear', leftHanded: 'leftHanded', rightHanded: 'rightHanded' }

// HdStComputeQueueZero (hdSt/resourceRegistry.h)
const HdStComputeQueueZero = 0

type Vec3 = readonly number[]

interface IndicesCase {
  name: string, orientation: string, numVerts: number[], verts: number[],
  holes: number[], expected: Vec3[]
}

// BasicTest (testHdStMeshTopology.cpp:473-552)
const basicCases: IndicesCase[] = [
  { name: 'empty', orientation: _tokens.rightHanded, numVerts: [], verts: [], holes: [], expected: [] },
  // This mesh intentionally has one degenerate face with no verts.
  { name: 'identity_no_vert_face', orientation: _tokens.rightHanded,
    numVerts: [0, 3], verts: [1, 2, 3], holes: [], expected: [[1, 2, 3]] },
  // This mesh intentionally has a degenerate face with a single vertex.
  { name: 'identity_one_vert_face', orientation: _tokens.rightHanded,
    numVerts: [1, 3], verts: [1, 1, 2, 3], holes: [], expected: [[1, 2, 3]] },
  // This mesh intentionally has a degenerate face with a two verts.
  { name: 'identity_two_vert_face', orientation: _tokens.rightHanded,
    numVerts: [2, 3], verts: [1, 1, 1, 2, 3], holes: [], expected: [[1, 2, 3]] },
  // This mesh intentionally has one degenerate face with no verts.
  { name: 'quad_no_vet_face', orientation: _tokens.rightHanded,
    numVerts: [0, 4], verts: [1, 2, 3, 4], holes: [], expected: [[1, 2, 3], [1, 3, 4]] },
  // This mesh intentionally has one degenerate face with two verts.
  { name: 'quad_two_vert_face', orientation: _tokens.rightHanded,
    numVerts: [2, 4], verts: [1, 1, 1, 2, 3, 4], holes: [], expected: [[1, 2, 3], [1, 3, 4]] },
  { name: '3 4 3', orientation: _tokens.rightHanded,
    numVerts: [3, 4, 3], verts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], holes: [],
    expected: [[1, 2, 3], [4, 5, 6], [4, 6, 7], [8, 9, 10]] },
]

// HoleTest (testHdStMeshTopology.cpp:554-590)
const holeCase: IndicesCase = {
  name: 'hole', orientation: _tokens.rightHanded,
  numVerts: [4, 4, 4, 4, 4],
  verts: [0, 1, 2, 3, 3, 2, 5, 4, 4, 5, 6, 7, 2, 8, 9, 5, 5, 9, 10, 6],
  holes: [1],
  expected: [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [2, 8, 9], [2, 9, 5], [5, 9, 10], [5, 10, 6]],
}

// InvalidTopologyTest (testHdStMeshTopology.cpp:946-998)
const invalidCase: IndicesCase = {
  name: 'Invalid', orientation: _tokens.rightHanded,
  numVerts: [4, 4, 4, 4, 4],
  verts: [0, 1, 2, 3, 3, 2, 5, 4, 4, 5, 6, 7],
  holes: [1],
  expected: [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
}

interface FaceVaryingCase {
  name: string, orientation: string, numVerts: number[], verts: number[], holes: number[],
  fvarValues: number[], expected: number[]
}

// FaceVaryingTest (testHdStMeshTopology.cpp:901-944)
const faceVaryingCase: FaceVaryingCase = {
  name: 'FaceVarying', orientation: _tokens.rightHanded,
  numVerts: [4, 4, 4, 4, 4],
  verts: [0, 1, 2, 3, 3, 2, 5, 4, 4, 5, 6, 7, 2, 8, 9, 5, 5, 9, 10, 6],
  holes: [1],
  fvarValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  expected: [1, 2, 3, 1, 3, 4,
    // 5, 6, 7, 5, 7, 8, // hole
    9, 10, 11, 9, 11, 12,
    13, 14, 15, 13, 15, 16,
    17, 18, 19, 17, 19, 20],
}

// InvalidTopologyTest (testHdStMeshTopology.cpp:967-978, 987-994)
const invalidFaceVaryingCase: FaceVaryingCase = {
  name: 'InvalidFaceVarying', orientation: _tokens.rightHanded,
  numVerts: invalidCase.numVerts, verts: invalidCase.verts, holes: [1],
  fvarValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  expected: [1, 2, 3, 1, 3, 4,
    //5, 6, 7, 5, 7, 8,  // hole, skipepd
    9, 10, 11, 9, 11, 12,
    13, 14, 15, 13, 15, 16,
    0, 0, 0, 0, 0, 0],
}

interface NormalsCase {
  name: string, orientation: string, numVerts: number[], verts: number[],
  points: Vec3[], double: boolean, expectedSmoothNormals: Vec3[], expectedFlatNormals: Vec3[] | null
}

// ComputeNormalsTest (testHdStMeshTopology.cpp:592-899)
const cubeVerts = [0, 1, 2, 3, 4, 5, 6, 7, 0, 6, 5, 1, 4, 7, 3, 2, 0, 3, 7, 6, 4, 2, 1, 5]
const cubePoints: Vec3[] = [
  [1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1],
  [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1],
]
const cubeSmooth: Vec3[] = [
  [0.57735, 0.57735, 0.57735], [-0.57735, 0.57735, 0.57735],
  [-0.57735, -0.57735, 0.57735], [0.57735, -0.57735, 0.57735],
  [-0.57735, -0.57735, -0.57735], [-0.57735, 0.57735, -0.57735],
  [0.57735, 0.57735, -0.57735], [0.57735, -0.57735, -0.57735],
]
const cubeFlat: Vec3[] = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]
const normalsCases: NormalsCase[] = [
  // testHdStMeshTopology.cpp:595-604
  { name: 'empty', orientation: _tokens.rightHanded, numVerts: [], verts: [], points: [],
    double: false, expectedSmoothNormals: [], expectedFlatNormals: null },
  // testHdStMeshTopology.cpp:605-619
  { name: 'missing_faceVertexIndices', orientation: _tokens.rightHanded, numVerts: [3], verts: [],
    points: [[-1, 0, 0], [0, 0, 2], [1, 0, 0]],
    double: false, expectedSmoothNormals: [], expectedFlatNormals: null },
  // testHdStMeshTopology.cpp:620-665. This mesh intentionally has two
  // degenerate faces, one with no verts and one with a single vertex.
  { name: 'triangle', orientation: _tokens.rightHanded, numVerts: [0, 1, 3], verts: [1, 0, 1, 2],
    points: [[0, 1, 0], [-1, 0, 0], [1, 0, 0]], double: false,
    expectedSmoothNormals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
    expectedFlatNormals: [[0, 0, 0], [0, 0, 0], [0, 0, 1]] },
  // testHdStMeshTopology.cpp:666-707
  { name: 'quad', orientation: _tokens.rightHanded, numVerts: [4], verts: [0, 1, 2, 3],
    points: [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]], double: false,
    expectedSmoothNormals: [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]],
    expectedFlatNormals: [[0, 0, 1]] },
  // testHdStMeshTopology.cpp:708-771
  { name: 'cube float ccw', orientation: _tokens.rightHanded, numVerts: [4, 4, 4, 4, 4, 4],
    verts: cubeVerts, points: cubePoints, double: false,
    expectedSmoothNormals: cubeSmooth, expectedFlatNormals: cubeFlat },
  // testHdStMeshTopology.cpp:772-834
  { name: 'cube float cw', orientation: _tokens.leftHanded, numVerts: [4, 4, 4, 4, 4, 4],
    verts: [3, 2, 1, 0, 7, 6, 5, 4, 1, 5, 6, 0, 2, 3, 7, 4, 6, 7, 3, 0, 5, 1, 2, 4],
    points: cubePoints, double: false,
    expectedSmoothNormals: cubeSmooth, expectedFlatNormals: cubeFlat },
  // testHdStMeshTopology.cpp:835-897
  { name: 'cube double', orientation: _tokens.rightHanded, numVerts: [4, 4, 4, 4, 4, 4],
    verts: cubeVerts, points: cubePoints, double: true,
    expectedSmoothNormals: cubeSmooth, expectedFlatNormals: cubeFlat },
]

function _MakeTopology(c: { orientation: string, numVerts: number[], verts: number[] }, holes: number[] = []): HdMeshTopology {
  const m = new HdMeshTopology(_tokens.bilinear, c.orientation, c.numVerts, c.verts)
  m.setHoleIndices(holes)
  return m
}

function _PointsSource(c: NormalsCase): HdBufferSource {
  return new HdVtBufferSource(HdTokens.points,
    VtValue.createArray(c.double ? Vec3dArray(c.points) : Vec3fArray(c.points)))
}

/** _CompareIndices (testHdStMeshTopology.cpp:71-108) */
async function _CompareIndices(registry: TestRegistry, c: IndicesCase): Promise<void> {
  // Convert topology to render delegate version
  const rdTopology = HdSt_MeshTopology.new(_MakeTopology(c, c.holes), 0)

  // compute triangle indices
  const source = rdTopology.getTriangleIndexBuilderComputation(SdfPath.fromString(c.name))
  const range = registry.allocateNonUniformBufferArrayRange(
    HdTokens.topology, source.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)
  registry.addSource(range, source)

  // execute computation
  registry.commit()

  const result = (await ReadDataAsync(range, HdTokens.indices)).Get<VtArray<unknown>>()
  expect(ArrayComponents(result)).toEqual(c.expected.flat())
}

/** _CompareIndices without the registry: the resolved index builder. */
function _CompareIndicesCPU(c: IndicesCase): void {
  const rdTopology = HdSt_MeshTopology.new(_MakeTopology(c, c.holes), 0)
  const source = rdTopology.getTriangleIndexBuilderComputation(SdfPath.fromString(c.name))
  expect(source.resolve()).toBe(true)
  expect(source.getTupleType()).toEqual({ type: HdType.HdTypeInt32Vec3, count: 1 })
  expect(SourceComponents(source, Int32Array)).toEqual(c.expected.flat())
}

/** _CompareFaceVarying (testHdStMeshTopology.cpp:110-152) */
async function _CompareFaceVarying(registry: TestRegistry, c: FaceVaryingCase): Promise<void> {
  const rdTopology = HdSt_MeshTopology.new(_MakeTopology(c, c.holes), 0)

  // compute triangulated fvar values
  const fvarSource = new HdVtBufferSource(HdTokens.primvar, VtValue.createArray(FloatArray(c.fvarValues)))
  registry.addSource(fvarSource)
  const source = rdTopology.getTriangulateFaceVaryingComputation(fvarSource, SdfPath.fromString(c.name))
  const range = registry.allocateNonUniformBufferArrayRange(
    HdTokens.primvar, source.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
  registry.addSource(range, source)

  // execute computation
  registry.commit()

  const result = (await ReadDataAsync(range, HdTokens.primvar)).Get<VtArray<number>>()
  expect(ArrayComponents(result)).toEqual(c.expected)
}

function _CompareFaceVaryingCPU(c: FaceVaryingCase): void {
  const rdTopology = HdSt_MeshTopology.new(_MakeTopology(c, c.holes), 0)
  const fvarSource = new HdVtBufferSource(HdTokens.primvar, VtValue.createArray(FloatArray(c.fvarValues)))
  // HdVtBufferSource is an HdResolvedBufferSource (hd/vtBufferSource.h:32).
  expect(fvarSource.isResolved()).toBe(true)
  const source = rdTopology.getTriangulateFaceVaryingComputation(fvarSource, SdfPath.fromString(c.name))
  expect(source.resolve()).toBe(true)
  expect(source.getTupleType()).toEqual({ type: HdType.HdTypeFloat, count: 1 })
  expect(SourceComponents(source, Float32Array)).toEqual(c.expected)
}

/** _CompareSmoothNormals (testHdStMeshTopology.cpp:186-227); `commit`
 *  resolves the adjacency computation (registry->AddSource + Commit). */
function _CompareSmoothNormals(c: NormalsCase, commit: (adj: HdBufferSource | null) => void): void {
  const topology = _MakeTopology(c)
  const adjacencyBuilder = new HdSt_VertexAdjacencyBuilder()
  const pointsSource = _PointsSource(c)

  // Adjacency computation
  {
    const adjComputation =
      adjacencyBuilder.getSharedVertexAdjacencyBuilderComputation(topology)
    commit(adjComputation)
  }

  const numPoints = pointsSource.getNumElements()
  const result = c.double
    ? Hd_SmoothNormals.computeSmoothNormals(adjacencyBuilder.getVertexAdjacency(), numPoints,
      new Float64Array(SourceComponents(pointsSource, Float64Array)))
    : Hd_SmoothNormals.computeSmoothNormals(adjacencyBuilder.getVertexAdjacency(), numPoints,
      new Float32Array(SourceComponents(pointsSource, Float32Array)))

  // resultValue.IsHolding< VtArray<Vec3Type> >()
  expect(result.getElementType().getTypeName()).toBe(c.double ? 'GfVec3d' : 'GfVec3f')
  ExpectClose3(ArrayComponents(result), c.expectedSmoothNormals)
}

/** _CompareFlatNormals (testHdStMeshTopology.cpp:236-264) */
function _CompareFlatNormals(c: NormalsCase): void {
  const topology = _MakeTopology(c)
  const pointsSource = _PointsSource(c)

  const result = c.double
    ? Hd_FlatNormals.computeFlatNormals(topology, new Float64Array(SourceComponents(pointsSource, Float64Array)))
    : Hd_FlatNormals.computeFlatNormals(topology, new Float32Array(SourceComponents(pointsSource, Float32Array)))

  expect(result.getElementType().getTypeName()).toBe(c.double ? 'GfVec3d' : 'GfVec3f')
  ExpectClose3(ArrayComponents(result), c.expectedFlatNormals!)
}

/** _CompareGpuSmoothNormals (testHdStMeshTopology.cpp:273-352) */
async function _CompareGpuSmoothNormals(registry: TestRegistry, c: NormalsCase): Promise<void> {
  const topology = _MakeTopology(c)
  const adjacencyBuilder = new HdSt_VertexAdjacencyBuilder()

  const pointsSource = _PointsSource(c)

  // Adjacency computation
  {
    const adjComputation =
      adjacencyBuilder.getSharedVertexAdjacencyBuilderComputation(topology)!
    registry.addSource(adjComputation)

    const adjGpuComputation = new HdSt_VertexAdjacencyBufferSource(
      adjacencyBuilder.getVertexAdjacency(), adjComputation)
    const adjRange = registry.allocateNonUniformBufferArrayRange(
      HdTokens.topology, adjGpuComputation.getBufferSpecs(),
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
    adjacencyBuilder.setVertexAdjacencyRange(adjRange)
    registry.addSource(adjRange, adjGpuComputation)
  }

  // GPU smooth computation
  const normalComputation = new HdSt_SmoothNormalsComputationGPU(
    adjacencyBuilder,
    HdTokens.points, HdTokens.normals,
    /*srcDataType=*/pointsSource.getTupleType().type,
    /*packed=*/false)

  // build bufferspec
  const bufferSpecs = [...pointsSource.getBufferSpecs(), ...normalComputation.getBufferSpecs()]

  // allocate GPU buffer range
  const range = registry.allocateNonUniformBufferArrayRange(
    HdTokens.primvar, bufferSpecs,
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

  // commit points
  registry.addSources(range, [pointsSource])
  registry.addComputation(range, normalComputation, HdStComputeQueueZero)

  // commit & execute
  registry.commit()

  // retrieve result
  const resultValue = await ReadDataAsync(range, HdTokens.normals)
  const result = resultValue.Get<VtArray<unknown>>()
  expect(result.getElementType().getTypeName()).toBe(c.double ? 'GfVec3d' : 'GfVec3f')
  ExpectClose3(ArrayComponents(result), c.expectedSmoothNormals)
}

/** _CompareGpuFlatNormals (testHdStMeshTopology.cpp:361-457) */
async function _CompareGpuFlatNormals(registry: TestRegistry, c: NormalsCase, quad: boolean): Promise<void> {
  const topology = _MakeTopology(c)
  const stTopo = HdSt_MeshTopology.new(topology, 0)
  const id = SdfPath.fromString('/Test')

  let pointsSource: HdBufferSource = _PointsSource(c)

  // build the points range
  const vertexRange = registry.allocateNonUniformBufferArrayRange(HdTokens.primvar,
    pointsSource.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

  // index builder
  let indexComputation: HdBufferSource
  let quadInfoComputation: HdBufferSource | null = null
  if (quad) {
    quadInfoComputation = stTopo.getQuadInfoBuilderComputation(false, id, registry)
    indexComputation = stTopo.getQuadIndexBuilderComputation(id)
    pointsSource = stTopo.getQuadrangulateComputation(pointsSource, id)!
  } else {
    indexComputation = stTopo.getTriangleIndexBuilderComputation(id)
  }

  // build the topology range
  const topoRange = registry.allocateNonUniformBufferArrayRange(HdTokens.topology,
    indexComputation.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

  // GPU flat normals computation
  const numFaces = topology.getFaceVertexCounts().length
  const normalComputation = new HdSt_FlatNormalsComputationGPU(
    topoRange, vertexRange, numFaces,
    HdTokens.points, HdTokens.normals,
    /*srcDataType=*/pointsSource.getTupleType().type,
    /*packed=*/false)

  // build the normals range
  const elementRange = registry.allocateNonUniformBufferArrayRange(
    HdTokens.primvar, normalComputation.getBufferSpecs(),
    HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

  // Add sources
  if (quadInfoComputation) {
    registry.addSource(quadInfoComputation)
  }
  registry.addSource(topoRange, indexComputation)
  registry.addSource(vertexRange, pointsSource)
  registry.addComputation(elementRange, normalComputation, HdStComputeQueueZero)

  // commit & execute
  registry.commit()

  // retrieve result
  const result = (await ReadDataAsync(elementRange, HdTokens.normals)).Get<VtArray<unknown>>()
  expect(result.getElementType().getTypeName()).toBe(c.double ? 'GfVec3d' : 'GfVec3f')
  ExpectClose3(ArrayComponents(result), c.expectedFlatNormals!)
}

/** Every upstream case runs under a TfErrorMark that must stay clean
 *  (testHdStMeshTopology.cpp:1005, 1023). */
async function _Clean(fn: () => unknown): Promise<void> {
  const mark = new TfErrorMark()
  await fn()
  expect(mark.isClean()).toBe(true)
}

describe('testHdStMeshTopology (cpu)', () => {
  for (const c of basicCases) {
    it(`BasicTest ${c.name}`, () => _Clean(() => _CompareIndicesCPU(c)))
  }
  it('HoleTest', () => _Clean(() => _CompareIndicesCPU(holeCase)))
  for (const c of normalsCases) {
    it(`ComputeNormalsTest ${c.name} smooth`, () => _Clean(() =>
      _CompareSmoothNormals(c, adj => { if (adj) expect(adj.resolve()).toBe(true) })))
    if (c.expectedFlatNormals) {
      it(`ComputeNormalsTest ${c.name} flat`, () => _Clean(() => _CompareFlatNormals(c)))
    }
  }
  it('FaceVaryingTest', () => _Clean(() => _CompareFaceVaryingCPU(faceVaryingCase)))
  it('InvalidTopologyTest', () => _Clean(() => {
    _CompareIndicesCPU(invalidCase)
    _CompareFaceVaryingCPU(invalidFaceVaryingCase)
  }))
})

describe('testHdStMeshTopology (registry)', () => {
  // BasicTest (testHdStMeshTopology.cpp:473-552)
  for (const c of basicCases) {
    it(`BasicTest ${c.name}`, () => _Clean(() => _CompareIndices(CreateTestRegistry(), c)))
  }
  // HoleTest (testHdStMeshTopology.cpp:554-590)
  it('HoleTest', () => _Clean(() => _CompareIndices(CreateTestRegistry(), holeCase)))
  // ComputeNormalsTest (testHdStMeshTopology.cpp:592-899)
  for (const c of normalsCases) {
    it(`ComputeNormalsTest ${c.name}_cpu`, () => _Clean(() => {
      const registry = CreateTestRegistry()
      _CompareSmoothNormals(c, adj => { registry.addSource(adj); registry.commit() })
    }))
    // The double cases' GPU programs need double-precision shaders, which
    // WebGPU lacks (PLATFORM-DIVERGENCE(webgpu-no-shader-double)); upstream does
    // not register this test on Apple for the same reason
    // (hdSt/CMakeLists.txt:2821-2828). Their CPU cases still run.
    if (c.expectedFlatNormals) {
      it(`ComputeNormalsTest ${c.name}_flat_cpu`, () => _Clean(() => _CompareFlatNormals(c)))
    }
    // The GPU cases need compute pipelines: skipped in Node, run in Safari
    // (PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute), tests/bufferTestHgi.ts).
    if (c.expectedFlatNormals && !c.double) {
      it.skipIf(GpuComputeUnavailable)(`ComputeNormalsTest ${c.name}_gpu`, () => _Clean(() =>
        _CompareGpuSmoothNormals(CreateTestRegistry(), c)))
      it.skipIf(GpuComputeUnavailable)(`ComputeNormalsTest ${c.name}_flat_gpu_tri`, () => _Clean(() =>
        _CompareGpuFlatNormals(CreateTestRegistry(), c, false)))
      it.skipIf(GpuComputeUnavailable)(`ComputeNormalsTest ${c.name}_flat_gpu_quad`, () => _Clean(() =>
        _CompareGpuFlatNormals(CreateTestRegistry(), c, true)))
    }
  }
  // FaceVaryingTest (testHdStMeshTopology.cpp:901-944)
  it('FaceVaryingTest', () => _Clean(() => _CompareFaceVarying(CreateTestRegistry(), faceVaryingCase)))
  // InvalidTopologyTest (testHdStMeshTopology.cpp:946-998)
  it('InvalidTopologyTest', () => _Clean(async () => {
    const registry = CreateTestRegistry()
    await _CompareIndices(registry, invalidCase)
    await _CompareFaceVarying(registry, invalidFaceVaryingCase)
  }))
})
