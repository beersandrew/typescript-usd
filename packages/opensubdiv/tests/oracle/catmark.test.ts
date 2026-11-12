// Oracle parity tests for the far uniform Catmull-Clark pipeline.
//
// Compares this port's refined topology AND interpolated positions, level by
// level, against fixtures dumped from the pinned C++ OpenSubdiv build
// (tools/oracle/dump.cpp). Ground truth is the C++ build, not hand-derived.
//
// The crease case feeds the TS side the USD-native run form
// (creaseLengths/creaseIndices/creaseSharpnesses) while the oracle used the
// OSD-native edge-pair form for the same crease — proving the §3 conversion.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  TopologyRefinerFactory,
  PrimvarRefiner,
  type TopologyDescriptor,
} from '../../src/far/index.ts'
import { SchemeType, Options, FVarLinearInterpolation } from '../../src/sdc/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'catmark.json'), 'utf-8')) as Record<
  string,
  Record<string, { numVertices: number; numFaces: number; faceVertexCounts: number[]; faceVertexIndices: number[]; points: number[] }>
>

const fvarFixtures = fixtures as unknown as Record<
  string,
  Record<string, { numFVarValues: number; faceFVarValues: number[]; uv: number[] }>
>

// Standard OpenSubdiv tutorial cube — identical to tools/oracle/dump.cpp.
const CUBE_POINTS = [
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
  -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
]
const CUBE_VERTS_PER_FACE = [4, 4, 4, 4, 4, 4]
const CUBE_VERT_INDICES = [0, 1, 3, 2, 2, 3, 5, 4, 4, 5, 7, 6, 6, 7, 1, 0, 1, 7, 5, 3, 6, 0, 2, 4]

const MAX_LEVEL = 2
const POS_TOL = 1e-5

function refineAndInterpolate(desc: TopologyDescriptor): Float32Array[] {
  const refiner = TopologyRefinerFactory.create(desc, {
    schemeType: SchemeType.CATMARK,
    schemeOptions: new Options(),
  })
  refiner.refineUniform({ refinementLevel: MAX_LEVEL })

  const pr = new PrimvarRefiner(refiner)
  const buffers: Float32Array[] = [Float32Array.from(CUBE_POINTS)]
  for (let l = 1; l <= MAX_LEVEL; ++l) {
    const dst = new Float32Array(refiner.GetLevel(l).getNumVertices() * 3)
    pr.interpolate(l, 3, buffers[l - 1]!, dst)
    buffers.push(dst)
  }
  return buffers
}

function checkAgainstOracle(caseName: string, desc: TopologyDescriptor): void {
  const oracle = fixtures[caseName]!
  const refiner = TopologyRefinerFactory.create(desc, {
    schemeType: SchemeType.CATMARK,
    schemeOptions: new Options(),
  })
  refiner.refineUniform({ refinementLevel: MAX_LEVEL })
  const buffers = refineAndInterpolate(desc)

  for (let level = 0; level <= MAX_LEVEL; ++level) {
    const exp = oracle[`level${level}`]!
    const lvl = refiner.GetLevel(level)

    expect(lvl.getNumVertices(), `${caseName} L${level} numVertices`).toBe(exp.numVertices)
    expect(lvl.getNumFaces(), `${caseName} L${level} numFaces`).toBe(exp.numFaces)
    expect(Array.from(lvl.getFaceVertexCounts()), `${caseName} L${level} counts`).toEqual(exp.faceVertexCounts)
    expect(Array.from(lvl.getFaceVertexIndices()), `${caseName} L${level} indices`).toEqual(exp.faceVertexIndices)

    const pts = buffers[level]!
    expect(pts.length, `${caseName} L${level} points length`).toBe(exp.points.length)
    let maxDiff = 0
    for (let i = 0; i < pts.length; ++i) maxDiff = Math.max(maxDiff, Math.abs(pts[i]! - exp.points[i]!))
    expect(maxDiff, `${caseName} L${level} max position diff (${maxDiff})`).toBeLessThan(POS_TOL)
  }
}

// Validate a case using the oracle's OWN level-0 mesh (topology + base points)
// as input, so the TS and C++ pipelines start from byte-identical data. Used
// for the torus, whose base points come from cos/sin in the dumper.
function checkFromFixtureBase(caseName: string): void {
  const oracle = fixtures[caseName]!
  const l0 = oracle.level0!
  const desc: TopologyDescriptor = {
    numVertices: l0.numVertices,
    vertsPerFace: l0.faceVertexCounts,
    vertIndicesPerFace: l0.faceVertexIndices,
  }
  const refiner = TopologyRefinerFactory.create(desc, {
    schemeType: SchemeType.CATMARK,
    schemeOptions: new Options(),
  })
  refiner.refineUniform({ refinementLevel: MAX_LEVEL })

  const pr = new PrimvarRefiner(refiner)
  const buffers: Float32Array[] = [Float32Array.from(l0.points)]
  for (let l = 1; l <= MAX_LEVEL; ++l) {
    const dst = new Float32Array(refiner.GetLevel(l).getNumVertices() * 3)
    pr.interpolate(l, 3, buffers[l - 1]!, dst)
    buffers.push(dst)
  }

  for (let level = 0; level <= MAX_LEVEL; ++level) {
    const exp = oracle[`level${level}`]!
    const lvl = refiner.GetLevel(level)
    expect(lvl.getNumVertices(), `${caseName} L${level} numVertices`).toBe(exp.numVertices)
    expect(lvl.getNumFaces(), `${caseName} L${level} numFaces`).toBe(exp.numFaces)
    expect(Array.from(lvl.getFaceVertexCounts()), `${caseName} L${level} counts`).toEqual(exp.faceVertexCounts)
    expect(Array.from(lvl.getFaceVertexIndices()), `${caseName} L${level} indices`).toEqual(exp.faceVertexIndices)
    const pts = buffers[level]!
    let maxDiff = 0
    for (let i = 0; i < pts.length; ++i) maxDiff = Math.max(maxDiff, Math.abs(pts[i]! - exp.points[i]!))
    expect(maxDiff, `${caseName} L${level} max position diff (${maxDiff})`).toBeLessThan(POS_TOL)
  }
}

describe('far uniform Catmull-Clark vs C++ oracle', () => {
  it('cube: topology + positions match the oracle at every level', () => {
    checkAgainstOracle('cube', {
      numVertices: 8,
      vertsPerFace: CUBE_VERTS_PER_FACE,
      vertIndicesPerFace: CUBE_VERT_INDICES,
    })
  })

  it('creased cube (USD run form) matches the oracle (edge-pair form) — §3', () => {
    // One length-3 crease over verts 0-1-2 at sharpness 2.0, in USD run form.
    checkAgainstOracle('cube_crease', {
      numVertices: 8,
      vertsPerFace: CUBE_VERTS_PER_FACE,
      vertIndicesPerFace: CUBE_VERT_INDICES,
      creaseLengths: [3],
      creaseIndices: [0, 1, 3],
      creaseSharpnesses: [2.0],
    })
  })

  it('torus (8×4 regular quad grid, genus 1): topology + positions match the oracle', () => {
    // All valence-4 interior vertices, no boundaries — the canonical regular
    // Catmull-Clark case. 32→128→512 verts/faces across levels 0-2.
    checkFromFixtureBase('torus')
  })

  it('face-varying UVs (seamed cube) match the oracle, topology + values, every level', () => {
    // Partial UV seam: face 3 uses extra values 8,9 — edges (0,1),(1,7),(0,6)
    // are UV-discontinuous. FVAR_LINEAR_NONE => smooth fvar boundaries (creases).
    const fx = fvarFixtures['cube_uv']!
    const opts = new Options()
    opts.setFVarLinearInterpolation(FVarLinearInterpolation.NONE)
    const desc: TopologyDescriptor = {
      numVertices: 8,
      vertsPerFace: CUBE_VERTS_PER_FACE,
      vertIndicesPerFace: CUBE_VERT_INDICES,
      fvarChannels: [{ numValues: 10, valueIndices: [0, 1, 3, 2, 2, 3, 5, 4, 4, 5, 7, 6, 6, 7, 8, 9, 1, 7, 5, 3, 6, 0, 2, 4] }],
    }
    const refiner = TopologyRefinerFactory.create(desc, { schemeType: SchemeType.CATMARK, schemeOptions: opts })
    refiner.refineUniform({ refinementLevel: MAX_LEVEL })

    const pr = new PrimvarRefiner(refiner)
    const uv: Float32Array[] = [Float32Array.from(fx.level0!.uv)]
    for (let l = 1; l <= MAX_LEVEL; ++l) {
      const dst = new Float32Array(refiner.GetLevel(l).getNumFVarValues(0) * 2)
      pr.interpolateFaceVarying(l, 0, 2, uv[l - 1]!, dst)
      uv.push(dst)
    }

    for (let level = 0; level <= MAX_LEVEL; ++level) {
      const exp = fx[`level${level}`]!
      const lvl = refiner.GetLevel(level)
      expect(lvl.getNumFVarValues(0), `cube_uv L${level} numFVarValues`).toBe(exp.numFVarValues)
      expect(Array.from(lvl.getFaceFVarValues(0)), `cube_uv L${level} faceFVarValues`).toEqual(exp.faceFVarValues)
      const vals = uv[level]!
      let maxDiff = 0
      for (let i = 0; i < vals.length; ++i) maxDiff = Math.max(maxDiff, Math.abs(vals[i]! - exp.uv[i]!))
      expect(maxDiff, `cube_uv L${level} max uv diff (${maxDiff})`).toBeLessThan(POS_TOL)
    }
  })

  it('cube corner point converges inward toward the Catmull-Clark limit', () => {
    const buffers = refineAndInterpolate({
      numVertices: 8,
      vertsPerFace: CUBE_VERTS_PER_FACE,
      vertIndicesPerFace: CUBE_VERT_INDICES,
    })
    // Original corner 0 magnitude is sqrt(0.75) ~ 0.866; the child vertex-point
    // (index 0, verts-from-verts first) must pull inward (cube -> rounder).
    const v0 = buffers[1]!
    const mag0 = Math.hypot(v0[0]!, v0[1]!, v0[2]!)
    expect(mag0).toBeLessThan(Math.hypot(0.5, 0.5, 0.5))
    const v0b = buffers[2]!
    const mag0b = Math.hypot(v0b[0]!, v0b[1]!, v0b[2]!)
    expect(mag0b).toBeLessThan(mag0) // keeps converging inward
  })
})
