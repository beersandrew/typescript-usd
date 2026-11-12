// Ported from OpenSubdiv 3.6.1: regression/common/shape_utils.cpp,
//  regression/common/far_utils.h
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Test utility: port of OpenSubdiv 3.6.1 regression/common/shape_utils.cpp
// (Shape::parseObj, Shape::tag::parseTag, lines 64-196) and
// regression/common/far_utils.h (GetSdcType/GetSdcOptions, lines 49-142, and
// the TopologyRefinerFactory<Shape> specialization, lines 199-347) -- the
// way OpenSubdiv's far_regression builds a refiner from a regression shape.
//
// The refiner is built through this port's TopologyRefinerFactory from a
// TopologyDescriptor carrying the same topology and tags.

import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import {
  Options,
  SchemeType,
  VtxBoundaryInterpolation,
  FVarLinearInterpolation,
  CreasingMethod,
  TriangleSubdivision,
} from '../../src/sdc/index.ts'
import { TopologyRefinerFactory, type TopologyRefiner, type TopologyDescriptor } from '../../src/far/index.ts'

export interface ShapeTag {
  name: string
  intargs: number[]
  floatargs: number[]
  stringargs: string[]
}

export interface Shape {
  verts: number[]
  uvs: number[]
  nvertsPerFace: number[]
  faceverts: number[]
  faceuvs: number[]
  tags: ShapeTag[]
  scheme: SchemeType
  isLeftHanded: boolean
}

// C sscanf("%f") parses to float.
const f32 = Math.fround

// shape_utils.cpp:147-196
function parseTag(line: string): ShapeTag | null {
  const tokens = line.slice(2).trim().split(/ +/)
  const name = tokens.shift()
  if (!name) return null
  const counts = tokens.shift()?.split('/').map((x) => parseInt(x, 10))
  if (!counts || counts.length !== 3 || counts.some((x) => Number.isNaN(x))) return null
  const [nints, nfloats, nstrings] = counts as [number, number, number]
  const intargs: number[] = []
  for (let i = 0; i < nints; ++i) {
    const v = parseInt(tokens.shift() ?? '', 10)
    if (Number.isNaN(v)) return null
    intargs.push(v)
  }
  const floatargs: number[] = []
  for (let i = 0; i < nfloats; ++i) {
    const v = parseFloat(tokens.shift() ?? '')
    if (Number.isNaN(v)) return null
    floatargs.push(f32(v))
  }
  const stringargs: string[] = []
  for (let i = 0; i < nstrings; ++i) {
    const v = tokens.shift()
    if (v === undefined) return null
    stringargs.push(v)
  }
  return { name, intargs, floatargs, stringargs }
}

// shape_utils.cpp:64-138 (materials are not parsed)
export function parseObj(text: string, scheme: SchemeType, isLeftHanded = false): Shape {
  const s: Shape = {
    verts: [],
    uvs: [],
    nvertsPerFace: [],
    faceverts: [],
    faceuvs: [],
    tags: [],
    scheme,
    isLeftHanded,
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.slice(2).trim().split(/ +/).map(parseFloat)
      if (p.length >= 3) s.verts.push(f32(p[0]!), f32(p[1]!), f32(p[2]!))
    } else if (line.startsWith('vt')) {
      const p = line.slice(3).trim().split(/ +/).map(parseFloat)
      if (p.length >= 2) s.uvs.push(f32(p[0]!), f32(p[1]!))
    } else if (line.startsWith('f ')) {
      let nverts = 0
      for (const item of line.slice(2).trim().split(/ +/)) {
        // sscanf("%d/%d/%d") -- the number of leading integers parsed
        const fields = item.split('/')
        const vi = parseInt(fields[0] ?? '', 10)
        if (Number.isNaN(vi)) break
        nverts++
        s.faceverts.push(vi - 1)
        const ti = fields.length > 1 ? parseInt(fields[1]!, 10) : NaN
        if (!Number.isNaN(ti)) s.faceuvs.push(ti - 1)
      }
      s.nvertsPerFace.push(nverts)
    } else if (line.startsWith('t ')) {
      const t = parseTag(line)
      if (t) s.tags.push(t)
    }
  }
  return s
}

// far_utils.h:69-142
export function getSdcOptions(shape: Shape): Options {
  const result = new Options()
  result.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_ONLY)
  result.setCreasingMethod(CreasingMethod.UNIFORM)
  result.setTriangleSubdivision(TriangleSubdivision.CATMARK)

  for (const t of shape.tags) {
    if (t.name === 'interpolateboundary') {
      if (t.intargs.length !== 1) continue
      switch (t.intargs[0]) {
        case 0:
          result.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.NONE)
          break
        case 1:
          result.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
          break
        case 2:
          result.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_ONLY)
          break
      }
    } else if (t.name === 'facevaryinginterpolateboundary') {
      if (t.intargs.length !== 1) continue
      const map = [
        FVarLinearInterpolation.NONE,
        FVarLinearInterpolation.CORNERS_ONLY,
        FVarLinearInterpolation.CORNERS_PLUS1,
        FVarLinearInterpolation.CORNERS_PLUS2,
        FVarLinearInterpolation.BOUNDARIES,
        FVarLinearInterpolation.ALL,
      ]
      const v = map[t.intargs[0]!]
      if (v !== undefined) result.setFVarLinearInterpolation(v)
    } else if (t.name === 'creasemethod') {
      if (t.stringargs.length === 0) continue
      if (t.stringargs[0] === 'normal') result.setCreasingMethod(CreasingMethod.UNIFORM)
      else if (t.stringargs[0] === 'chaikin') result.setCreasingMethod(CreasingMethod.CHAIKIN)
    } else if (t.name === 'smoothtriangles') {
      if (shape.scheme !== SchemeType.CATMARK) continue
      if (t.stringargs[0] === 'catmark') result.setTriangleSubdivision(TriangleSubdivision.CATMARK)
      else if (t.stringargs[0] === 'smooth') result.setTriangleSubdivision(TriangleSubdivision.SMOOTH)
    }
  }
  return result
}

// far_utils.h:199-347 as a TopologyDescriptor: face topology, the single UV
// channel, crease/corner/hole tags.
export function shapeDescriptor(shape: Shape): TopologyDescriptor {
  const creaseIndexPairs: number[] = []
  const creaseWeights: number[] = []
  const cornerIndices: number[] = []
  const cornerWeights: number[] = []
  const holeIndices: number[] = []
  for (const t of shape.tags) {
    if (t.name === 'crease') {
      for (let j = 0; j < t.intargs.length - 1; j += 2) {
        creaseIndexPairs.push(t.intargs[j]!, t.intargs[j + 1]!)
        // far_utils.h:300-301 indexes floatargs by the pair's first int index
        creaseWeights.push(Math.max(0.0, t.floatargs.length > 1 ? t.floatargs[j]! : t.floatargs[0]!))
      }
    } else if (t.name === 'corner') {
      for (let j = 0; j < t.intargs.length; ++j) {
        cornerIndices.push(t.intargs[j]!)
        cornerWeights.push(Math.max(0.0, t.floatargs.length > 1 ? t.floatargs[j]! : t.floatargs[0]!))
      }
    } else if (t.name === 'hole') {
      holeIndices.push(...t.intargs)
    }
  }
  const desc: TopologyDescriptor = {
    numVertices: shape.verts.length / 3,
    vertsPerFace: shape.nvertsPerFace,
    vertIndicesPerFace: shape.faceverts,
    creaseIndexPairs,
    creaseWeights,
    cornerIndices,
    cornerWeights,
    holeIndices,
    isLeftHanded: shape.isLeftHanded,
  }
  if (shape.faceuvs.length > 0) {
    desc.fvarChannels = [{ numValues: shape.uvs.length / 2, valueIndices: shape.faceuvs }]
  }
  return desc
}

/** far_utils.h:144-182 -- create and uniformly refine a shape's refiner. */
export function refineShape(shape: Shape, level: number): TopologyRefiner {
  const refiner = TopologyRefinerFactory.create(shapeDescriptor(shape), {
    schemeType: shape.scheme,
    schemeOptions: getSdcOptions(shape),
  })
  refiner.refineUniform({ refinementLevel: level })
  return refiner
}

// ---- fixture decoding ------------------------------------------------------

/** Reads an enveloped capture fixture (FIXTURES.md), gunzipping a .gz file. */
export function readFixture<T>(path: string): T {
  const raw = readFileSync(path)
  const text = new TextDecoder('utf-8').decode(path.endsWith('.gz') ? gunzipSync(raw) : raw)
  return (JSON.parse(text) as { payload: T }).payload
}

/** Decodes a base64 little-endian float32 array (fixture keys ending F32). */
export function decodeF32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; ++i) bytes[i] = bin.charCodeAt(i)
  // little-endian float32 (the capture runs on arm64, as does this host)
  const view = new DataView(bytes.buffer)
  const out = new Float32Array(bytes.length / 4)
  for (let i = 0; i < out.length; ++i) out[i] = view.getFloat32(i * 4, true)
  return out
}

/** Units in the last place of a float32 value's magnitude. */
export function ulp32(x: number): number {
  const a = Math.abs(Math.fround(x))
  if (a === 0) return 2 ** -149
  const e = Math.floor(Math.log2(a))
  return 2 ** (Math.max(e, -126) - 23)
}

/**
 * Comparison statistics of two float arrays: the number of exactly equal
 * entries and the largest difference measured in float32 ulps of the
 * larger magnitude (with an absolute floor of `absFloor`, for entries that
 * are cancellations of much larger terms).
 */
export function compareFloats(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  absFloor = 0,
): { length: number; exact: number; maxUlps: number; maxAbs: number } {
  let exact = 0
  let maxUlps = 0
  let maxAbs = 0
  const n = Math.min(actual.length, expected.length)
  for (let i = 0; i < n; ++i) {
    const a = Math.fround(actual[i]!)
    const b = expected[i]!
    if (a === b) {
      exact++
      continue
    }
    const d = Math.abs(a - b)
    maxAbs = Math.max(maxAbs, d)
    if (d <= absFloor) continue
    maxUlps = Math.max(maxUlps, d / ulp32(Math.max(Math.abs(a), Math.abs(b))))
  }
  return { length: actual.length === expected.length ? n : -1, exact, maxUlps, maxAbs }
}
