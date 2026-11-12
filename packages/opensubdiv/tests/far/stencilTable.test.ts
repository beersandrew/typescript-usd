// Portions ported from OpenSubdiv 3.6.1, including:
//  regression/far_regression/far_regression.cpp,
//  regression/far_regression/init_shapes.h, regression/common/far_utils.h
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Far stencil tables on OpenSubdiv's regression shapes, compared with the
// native OpenSubdiv 3.6.1 build (fixtures/farRegressionShapes.json.gz,
// captured by the capture tooling kept outside this repository; FIXTURES.md).
//
// Adapted from OpenSubdiv 3.6.1 regression/far_regression/far_regression.cpp
// (the shape list of init_shapes.h, refined by far_utils.h:144-182) with the
// expected values taken from the native build instead of Hbr: stencil tables
// with HdSt's options (hdSt/subdivision.cpp:1071-1092), the default and
// unfactorized option variants, positions from applying the stencils, the
// PrimvarRefiner limit and refined UVs.
//
// Indices and sizes must match exactly. Native weights are float; this port
// evaluates the masks in double and rounds where the C++ stores a float
// (far/types.ts), so weights are compared in float ulps.

import { describe, it, expect } from 'vitest'
import {
  StencilTableFactory,
  StencilTableFactoryOptions,
  StencilInterpolationMode,
  PrimvarRefinerReal,
  FlatPrimvarBuffer,
  PatchTableFactory,
  PatchTableFactoryOptions,
} from '../../src/far/index.ts'
import { SchemeType } from '../../src/sdc/index.ts'
import { decodeF32, compareFloats } from './shapeUtils.ts'
import { fixture, buildShape, expectStencilTable, WEIGHT_ULPS } from './regressionFixture.ts'


function stormOptions(mode: StencilInterpolationMode, fvarChannel = 0): StencilTableFactoryOptions {
  const o = new StencilTableFactoryOptions()
  o.generateOffsets = true
  o.generateIntermediateLevels = false
  o.interpolationMode = mode
  o.fvarChannel = fvarChannel
  return o
}

for (const name of Object.keys(fixture.shapes)) {
  describe(`far stencil tables: ${name}`, () => {
    const { shape, refiner } = buildShape(name)
    const native = shape.native

    it('refines to the native level sizes', () => {
      const levels = native.levelVertices.length
      for (let l = 0; l < levels; ++l) {
        expect(refiner.getLevel(l).getNumVertices()).toBe(native.levelVertices[l])
        expect(refiner.getLevel(l).getNumFaces()).toBe(native.levelFaces[l])
        if (native.levelFVarValues) expect(refiner.getLevel(l).getNumFVarValues(0)).toBe(native.levelFVarValues[l])
      }
      expect(refiner.getNumVerticesTotal()).toBe(native.numVerticesTotal)
      expect(refiner.getMaxValence()).toBe(native.maxValence)
      expect(refiner.getNumFVarChannels()).toBe(native.numFVarChannels)
    })

    it('vertex stencils with HdSt options match native', () => {
      const t = StencilTableFactory.create(refiner, stormOptions(StencilInterpolationMode.INTERPOLATE_VERTEX))
      expectStencilTable(t, native.stormVertexStencils)
    })

    it('varying stencils with HdSt options match native', () => {
      const t = StencilTableFactory.create(refiner, stormOptions(StencilInterpolationMode.INTERPOLATE_VARYING))
      expectStencilTable(t, native.stormVaryingStencils)
    })

    if (native.stormFVarStencils) {
      it('face-varying stencils with HdSt options match native', () => {
        const t = StencilTableFactory.create(refiner, stormOptions(StencilInterpolationMode.INTERPOLATE_FACE_VARYING))
        expectStencilTable(t, native.stormFVarStencils!)
      })
    }

    if (native.defaultVertexStencils) {
      it('default-option vertex stencils match native', () => {
        expectStencilTable(StencilTableFactory.create(refiner), native.defaultVertexStencils!)
      })
      it('unfactorized vertex stencils with control vertices match native', () => {
        const o = new StencilTableFactoryOptions()
        o.factorizeIntermediateLevels = false
        o.generateControlVerts = true
        expectStencilTable(StencilTableFactory.create(refiner, o), native.unfactorizedVertexStencils!)
      })
    }

    it('applying the stencils reproduces the native refined positions', () => {
      // far_regression compares refined positions (far_regression.cpp:46);
      // the native PrimvarRefiner positions are the reference here.
      const coarse = decodeF32(native.refinedPositionsF32)
      const nCoarse = native.levelVertices[0]!
      const nLast = native.levelVertices[native.levelVertices.length - 1]!
      const t = StencilTableFactory.create(refiner, stormOptions(StencilInterpolationMode.INTERPOLATE_VERTEX))
      const out = new Float32Array(nLast * 3)
      t.updateValues(new FlatPrimvarBuffer(coarse.subarray(0, nCoarse * 3), 3), new FlatPrimvarBuffer(out, 3))
      const expected = coarse.subarray(coarse.length - nLast * 3)
      // Stencils and level-by-level refinement sum in different orders, so
      // the comparison is in float ulps (as the others) rather than exact.
      const cmp = compareFloats(out, expected, 2 ** -18)
      expect(cmp.maxUlps).toBeLessThanOrEqual(WEIGHT_ULPS)
    })

    it('PrimvarRefinerReal reproduces the native positions at every level', () => {
      const expected = decodeF32(native.refinedPositionsF32)
      const data = new Float32Array(expected.length)
      const nCoarse = native.levelVertices[0]!
      data.set(expected.subarray(0, nCoarse * 3))
      const refinerReal = new PrimvarRefinerReal(refiner)
      let src = new FlatPrimvarBuffer(data, 3, 0)
      for (let l = 1; l < native.levelVertices.length; ++l) {
        const dst = src.offsetBy(native.levelVertices[l - 1]!)
        refinerReal.interpolate(l, src, dst)
        src = dst
      }
      const cmp = compareFloats(data, expected, 2 ** -18)
      expect(cmp.maxUlps).toBeLessThanOrEqual(WEIGHT_ULPS)
    })

    it('PrimvarRefinerReal.Limit reproduces the native limit positions', () => {
      const refined = decodeF32(native.refinedPositionsF32)
      const nLast = native.levelVertices[native.levelVertices.length - 1]!
      const last = refined.subarray(refined.length - nLast * 3)
      const out = new Float32Array(nLast * 3)
      new PrimvarRefinerReal(refiner).Limit(new FlatPrimvarBuffer(last, 3), new FlatPrimvarBuffer(out, 3))
      const cmp = compareFloats(out, decodeF32(native.limitPositionsF32), 2 ** -18)
      expect(cmp.maxUlps).toBeLessThanOrEqual(WEIGHT_ULPS)
    })

    if (native.refinedUVsF32) {
      it('PrimvarRefinerReal.InterpolateFaceVarying reproduces the native UVs', () => {
        const expected = decodeF32(native.refinedUVsF32!)
        const data = new Float32Array(expected.length)
        const n0 = native.levelFVarValues![0]!
        data.set(expected.subarray(0, n0 * 2))
        const refinerReal = new PrimvarRefinerReal(refiner)
        let src = new FlatPrimvarBuffer(data, 2, 0)
        for (let l = 1; l < native.levelFVarValues!.length; ++l) {
          const dst = src.offsetBy(native.levelFVarValues![l - 1]!)
          refinerReal.interpolateFaceVarying(l, src, dst, 0)
          src = dst
        }
        const cmp = compareFloats(data, expected, 2 ** -18)
        expect(cmp.maxUlps).toBeLessThanOrEqual(WEIGHT_ULPS)
      })
    }

    it('AppendLocalPointStencilTable returns null for a uniform patch table', () => {
      // A uniform patch table has no local points (patchTableFactory.cpp:744-912).
      const vertex = StencilTableFactory.create(refiner, stormOptions(StencilInterpolationMode.INTERPOLATE_VERTEX))
      const options = new PatchTableFactoryOptions(shape.level)
      const patchTable = PatchTableFactory.create(refiner, options)
      const appended = StencilTableFactory.AppendLocalPointStencilTable(refiner, vertex, patchTable.getLocalPointStencilTable())
      expect(appended === null).toBe(native['appendLocalPointsIsNull'])
    })
  })
}

void SchemeType
