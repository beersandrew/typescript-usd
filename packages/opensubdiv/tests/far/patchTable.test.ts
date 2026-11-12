// Far uniform patch tables, PtexIndices, PatchMap, patch basis evaluation and
// limit stencils on OpenSubdiv's regression shapes, compared with the native
// OpenSubdiv 3.6.1 build (fixtures/farRegressionShapes.json.gz, captured by
// the capture tooling kept outside this repository; FIXTURES.md).
//
// Patch topology (vertices, PatchParam words, face-varying values) must
// match exactly; evaluated weights are compared in float ulps.

import { describe, it, expect } from 'vitest'
import {
  PatchTableFactory,
  PatchTableFactoryOptions,
  PatchMap,
  PtexIndices,
  LimitStencilTableFactory,
  LimitStencilTableFactoryOptions,
  StencilInterpolationMode,
  type PatchTable,
  type LocationArray,
  type LimitStencilTableReal,
} from '../../src/far/index.ts'
import { SchemeType } from '../../src/sdc/index.ts'
import { decodeF32, compareFloats } from './shapeUtils.ts'
import { fixture, buildShape } from './regressionFixture.ts'

const ULPS = 64
const ABS = 2 ** -20

interface NativePatchTable {
  numPtexFaces: number
  maxValence: number
  isFeatureAdaptive: boolean
  numPatchesTotal: number
  numLocalPoints: number
  varyingDesc: number
  varyingVertices: number[]
  patchArrays: { type: number; numPatches: number; numControlVertices: number }[]
  patchVerts: number[]
  patchParams: number[]
  fvarChannels: {
    interpolation: number
    regType: number
    irregType: number
    stride: number
    values: number[]
    patchParams: number[]
  }[]
}

interface NativeLimitStencils {
  numControlVertices: number
  numStencils: number
  sizes: number[]
  offsets: number[]
  indices: number[]
  weightsF32: string
  duWeightsF32?: string
  dvWeightsF32?: string
  duuWeightsF32?: string
  duvWeightsF32?: string
  dvvWeightsF32?: string
}

function expectPatchTable(t: PatchTable, e: NativePatchTable): void {
  expect(t.getNumPtexFaces()).toBe(e.numPtexFaces)
  expect(t.getMaxValence()).toBe(e.maxValence)
  expect(t.isFeatureAdaptive()).toBe(e.isFeatureAdaptive)
  expect(t.getNumPatchesTotal()).toBe(e.numPatchesTotal)
  expect(t.getNumLocalPoints()).toBe(e.numLocalPoints)
  expect(t.getVaryingPatchDescriptor().getType()).toBe(e.varyingDesc)
  expect(t.getVaryingVertices()).toEqual(e.varyingVertices)
  expect(t.getNumPatchArrays()).toBe(e.patchArrays.length)
  e.patchArrays.forEach((pa, a) => {
    expect(t.getPatchArrayDescriptor(a).getType()).toBe(pa.type)
    expect(t.getNumPatches(a)).toBe(pa.numPatches)
    expect(t.getNumControlVertices(a)).toBe(pa.numControlVertices)
  })
  expect(t.getPatchControlVerticesTable()).toEqual(e.patchVerts)
  expect(t.getPatchParamTable().flatMap((p) => [p.field0, p.field1])).toEqual(e.patchParams)
  expect(t.getNumFVarChannels()).toBe(e.fvarChannels.length)
  e.fvarChannels.forEach((c, i) => {
    expect(t.getFVarChannelLinearInterpolation(i)).toBe(c.interpolation)
    expect(t.getFVarPatchDescriptorRegular(i).getType()).toBe(c.regType)
    expect(t.getFVarPatchDescriptorIrregular(i).getType()).toBe(c.irregType)
    expect(t.getFVarValueStride(i)).toBe(c.stride)
    expect(t.getFVarValues(i)).toEqual(c.values)
    expect(t.getFVarPatchParams(i).flatMap((p) => [p.field0, p.field1])).toEqual(c.patchParams)
  })
}

function expectWeights(actual: number[], expected: string, n: number): void {
  const cmp = compareFloats(actual.slice(0, n), decodeF32(expected), ABS)
  expect(cmp.length).toBe(n)
  expect(cmp.maxUlps).toBeLessThanOrEqual(ULPS)
}

function expectLimitStencils(t: LimitStencilTableReal | null, e: NativeLimitStencils | null): void {
  if (!e) {
    expect(t).toBeNull()
    return
  }
  expect(t).not.toBeNull()
  expect(t!.getNumControlVertices()).toBe(e.numControlVertices)
  expect(t!.getNumStencils()).toBe(e.numStencils)
  expect(t!.getSizes()).toEqual(e.sizes)
  expect(t!.getOffsets()).toEqual(e.offsets)
  expect(t!.getControlIndices()).toEqual(e.indices)
  const n = e.indices.length
  expectWeights(t!.getWeights(), e.weightsF32, n)
  if (e.duWeightsF32) {
    expectWeights(t!.getDuWeights(), e.duWeightsF32, n)
    expectWeights(t!.getDvWeights(), e.dvWeightsF32!, n)
  } else {
    expect(t!.getDuWeights()).toEqual([])
  }
  if (e.duuWeightsF32) {
    expectWeights(t!.getDuuWeights(), e.duuWeightsF32, n)
    expectWeights(t!.getDuvWeights(), e.duvWeightsF32!, n)
    expectWeights(t!.getDvvWeights(), e.dvvWeightsF32!, n)
  }
}

for (const name of Object.keys(fixture.shapes)) {
  describe(`far patch tables: ${name}`, () => {
    const { shape, refiner } = buildShape(name)
    const native = shape.native as unknown as Record<string, unknown>
    const nfvc = refiner.getNumFVarChannels()
    const isLoop = shape.scheme === SchemeType.LOOP

    // hdSt/subdivision.cpp:1040-1045 (uniform)
    const stormOptions = new PatchTableFactoryOptions(shape.level)
    if (nfvc > 0) {
      stormOptions.generateFVarTables = true
      stormOptions.includeFVarBaseLevelIndices = true
      stormOptions.generateFVarLegacyLinearPatches = true
    }
    const patchTable = PatchTableFactory.create(refiner, stormOptions)

    it('uniform patch table with HdSt options matches native', () => {
      expectPatchTable(patchTable, native['stormPatchTable'] as NativePatchTable)
    })

    if (native['allLevelsTriangulatedPatchTable']) {
      it('all-levels triangulated patch table matches native', () => {
        const o = new PatchTableFactoryOptions(shape.level)
        o.generateAllLevels = true
        o.triangulateQuads = true
        o.includeBaseLevelIndices = false
        o.generateFVarTables = nfvc > 0
        expectPatchTable(PatchTableFactory.create(refiner, o), native['allLevelsTriangulatedPatchTable'] as NativePatchTable)
      })
    }

    it('PtexIndices face ids and adjacency match native', () => {
      const ptex = new PtexIndices(refiner)
      expect(ptex.getNumFaces()).toBe(native['ptexNumFaces'])
      const base = refiner.getLevel(0)
      const ids: number[] = []
      const adjacency: number[] = []
      const regSize = isLoop ? 3 : 4
      for (let f = 0; f < base.getNumFaces(); ++f) {
        ids.push(ptex.getFaceId(f))
        const nv = base.getFaceVertices(f).length
        if (nv !== regSize && regSize === 3) continue
        const nq = nv === regSize ? 1 : nv
        for (let q = 0; q < nq; ++q) {
          const adjFaces: number[] = []
          const adjEdges: number[] = []
          ptex.getAdjacency(refiner, f, q, adjFaces, adjEdges)
          adjacency.push(...adjFaces, ...adjEdges)
        }
      }
      expect(ids).toEqual(native['ptexFaceIds'])
      expect(adjacency).toEqual(native['ptexAdjacency'])
    })

    const sampleS = decodeF32(native['sampleS'] as string)
    const sampleT = decodeF32(native['sampleT'] as string)
    const stride = native['sampleFaceStride'] as number
    const numPtex = native['ptexNumFaces'] as number

    it('PatchMap.FindPatch and PatchTable.EvaluateBasis match native', () => {
      const patchMap = new PatchMap(patchTable)
      const handles: number[] = []
      const basis: number[] = []
      const wP = new Float32Array(20),
        wDs = new Float32Array(20),
        wDt = new Float32Array(20),
        wDss = new Float32Array(20),
        wDst = new Float32Array(20),
        wDtt = new Float32Array(20)
      for (let face = 0; face < numPtex; face += stride) {
        for (let k = 0; k < sampleS.length; ++k) {
          const s = sampleS[k]!
          const t = sampleT[k]!
          if (isLoop && Math.fround(s + t) > 1.0) continue
          const h = patchMap.findPatch(face, s, t)
          if (!h) {
            handles.push(face, k, -1, -1, -1)
            continue
          }
          handles.push(face, k, h.arrayIndex, h.patchIndex, h.vertIndex)
          patchTable.evaluateBasis(h, s, t, wP, wDs, wDt, wDss, wDst, wDtt)
          const n = patchTable.getPatchArrayDescriptor(h.arrayIndex).getNumControlVertices()
          for (let i = 0; i < n; ++i) basis.push(wP[i]!, wDs[i]!, wDt[i]!, wDss[i]!, wDst[i]!, wDtt[i]!)
        }
      }
      expect(handles).toEqual(native['patchMapHandles'])
      const cmp = compareFloats(basis, decodeF32(native['evaluateBasisF32'] as string), ABS)
      expect(cmp.length).toBe(basis.length)
      expect(cmp.maxUlps).toBeLessThanOrEqual(ULPS)
    })

    const locations: LocationArray[] = []
    for (let face = 0; face < numPtex; face += stride) {
      const s: number[] = []
      const t: number[] = []
      for (let k = 0; k < sampleS.length; ++k) {
        if (isLoop && Math.fround(sampleS[k]! + sampleT[k]!) > 1.0) continue
        s.push(sampleS[k]!)
        t.push(sampleT[k]!)
      }
      locations.push({ ptexIdx: face, numLocations: s.length, s, t })
    }

    it('limit stencils (1st derivatives) match native', () => {
      expectLimitStencils(LimitStencilTableFactory.create(refiner, locations), native['limitStencils'] as NativeLimitStencils)
    })

    if (native['limitStencils2nd']) {
      it('limit stencils (2nd derivatives) match native', () => {
        const o = new LimitStencilTableFactoryOptions()
        o.generate2ndDerivatives = true
        expectLimitStencils(
          LimitStencilTableFactory.create(refiner, locations, null, null, o),
          native['limitStencils2nd'] as NativeLimitStencils,
        )
      })
    }

    it('varying limit stencils without derivatives match native', () => {
      const o = new LimitStencilTableFactoryOptions()
      o.interpolationMode = StencilInterpolationMode.INTERPOLATE_VARYING
      o.generate1stDerivatives = false
      expectLimitStencils(
        LimitStencilTableFactory.create(refiner, locations, null, null, o),
        native['limitStencilsVaryingNoDerivs'] as NativeLimitStencils,
      )
    })

    if (native['limitStencilsFVar']) {
      it('face-varying limit stencils match native', () => {
        const o = new LimitStencilTableFactoryOptions()
        o.interpolationMode = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
        expectLimitStencils(
          LimitStencilTableFactory.create(refiner, locations, null, null, o),
          native['limitStencilsFVar'] as NativeLimitStencils,
        )
      })
    }
  })
}
