// Ported from OpenUSD 26.11.1: pxr/imaging/hd/meshUtil.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native HdMeshUtil triangulation (fixtures/orientedTriangulation and
// fixtures/holeTriangulation, captured from OpenUSD 26.11.1; FIXTURES.md):
// HdMeshUtil::ComputeTriangleIndices and
// ComputeTriangulatedFaceVaryingPrimvar (meshUtil.cpp:99-244,317-374), with
// the orientation rule of meshUtil.cpp:194-221,289-303.
import {it,expect} from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import { MeshTopology as HdMeshTopology, MeshUtil as HdMeshUtil, Type as HdType } from 'typescript-usd/hd'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
const expected=readOracleFixture(new URL('./fixtures/orientedTriangulation/expected.json',import.meta.url))
const holeOracle=readOracleFixture(new URL('./fixtures/holeTriangulation/expected.json',import.meta.url))

type Tuple = { get(i: number): number }
const flatten = (values: Iterable<Tuple>, n: number) => [...values].flatMap(v => Array.from({ length: n }, (_, c) => v.get(c)))

function triangulate(counts: number[], orientation: string, holes: number[] = []) {
  const corners = counts.reduce((a, b) => a + b, 0), indices = Array.from({ length: corners }, (_, i) => i)
  const topology = new HdMeshTopology('none', orientation, counts, indices, holes)
  const util = new HdMeshUtil(topology, SdfPath.fromString('/Mesh'))
  const tris = { value: undefined as unknown as VtArray<Tuple> }, params = { value: undefined as unknown as VtArray<number> }
  util.computeTriangleIndices(tris as never, params)
  const uv = new Float32Array(indices.flatMap(i => [i, i + 0.25]))
  const result = { value: undefined as unknown as VtValue }
  util.computeTriangulatedFaceVaryingPrimvar(uv, corners, HdType.HdTypeFloatVec2, result)
  const values = result.value?.UncheckedGet<Iterable<Tuple>>() ?? []
  return {
    indices: flatten(tris.value, 3),
    faces: [...params.value].map(p => HdMeshUtil.decodeFaceIndexFromCoarseFaceParam(p)),
    uv: flatten(values, 2),
  }
}

for(const orientation of ['rightHanded','leftHanded']) {
  it(`matches native vertex and face-varying corner order for ${orientation} triangle, quad and pentagon`,()=>{
    const result = triangulate([3,4,5], orientation)
    expect(result.indices).toEqual(expected[orientation].indices)
    expect(result.uv).toEqual(expected[orientation].uv)
  })
}

for(const sample of holeOracle.cases) it(`matches native hole triangulation: ${sample.orientation} holes ${sample.holes}`,()=>{
  const result = triangulate(sample.counts, sample.orientation, sample.holes)
  expect(result.indices).toEqual(sample.indices)
  expect(result.faces).toEqual(sample.faces)
  expect(result.uv).toEqual(sample.uv)
})
