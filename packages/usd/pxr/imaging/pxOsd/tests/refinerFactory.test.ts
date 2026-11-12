// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/subdivision.cpp,
//  pxr/imaging/pxOsd/refinerFactory.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PxOsdRefinerFactory (pxr/imaging/pxOsd/refinerFactory.cpp, OpenUSD
// 26.11.1) against the native refinement HdSt performs through it
// (hdSt/subdivision.cpp:1019-1097), captured from the reference build's
// OpenSubdiv 3.6.1 by packages/opensubdiv/tests/far/capture/hdStSequence.cpp
// (fixture packages/opensubdiv/tests/far/fixtures/hdStSequence.json, which
// the capture builds with PxOsdRefinerFactory::Create). The refiner built
// here is refined and tabled with HdSt's uniform options, and the tables are
// compared with the native ones.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  StencilTableFactory,
  StencilTableFactoryOptions,
  StencilInterpolationMode,
  PatchTableFactory,
  PatchTableFactoryOptions,
  type StencilTableReal,
} from '@opensubdiv/core/far'
import { Token as TfToken } from 'typescript-usd/tf'
import { RefinerFactory as PxOsdRefinerFactory, MeshTopology as PxOsdMeshTopology, SubdivTags as PxOsdSubdivTags } from 'typescript-usd/pxOsd'

interface NativeStencils { numControlVertices: number, numStencils: number, sizes: number[], offsets: number[], indices: number[], weights: number[] }
interface Mesh {
  scheme: string, orientation: string, level: number
  faceVertexCounts: number[], faceVertexIndices: number[]
  creaseLengths: number[], creaseIndices: number[], creaseWeights: number[]
  cornerIndices: number[], cornerWeights: number[], holeIndices: number[], fvarIndices: number[]
  native: {
    numFVarChannels: number, vertexStencils: NativeStencils, varyingStencils: NativeStencils,
    faceVaryingStencils: NativeStencils[], numPtexFaces: number, patchVerts: number[], patchParams: number[],
    fvarValues?: number[], fvarPatchParams?: number[]
  }
}

const fixture = JSON.parse(readFileSync(new URL(
  '../../../../../opensubdiv/tests/far/fixtures/hdStSequence.json', import.meta.url), 'utf8')) as { payload: { meshes: Record<string, Mesh> } }

function expectStencils(t: StencilTableReal, e: NativeStencils): void {
  expect(t.getNumControlVertices()).toBe(e.numControlVertices)
  expect(t.getNumStencils()).toBe(e.numStencils)
  expect(t.getSizes()).toEqual(e.sizes)
  expect(t.getOffsets()).toEqual(e.offsets)
  expect(t.getControlIndices()).toEqual(e.indices)
  // HdSt uploads GetControlIndices().size() float weights (subdivision.cpp:295-300)
  const n = t.getControlIndices().length
  const w = t.getWeights().slice(0, n).map(Math.fround)
  w.forEach((x, i) => expect(Math.abs(x - Math.fround(e.weights[i]!))).toBeLessThanOrEqual(2 ** -20))
}

describe('PxOsdRefinerFactory::Create, refined as HdSt refines (native OpenSubdiv 3.6.1)', () => {
  for (const [name, mesh] of Object.entries(fixture.payload.meshes)) {
    it(name, () => {
      const tags = new PxOsdSubdivTags()
      tags.setCreaseLengths(mesh.creaseLengths)
      tags.setCreaseIndices(mesh.creaseIndices)
      tags.setCreaseWeights(mesh.creaseWeights)
      tags.setCornerIndices(mesh.cornerIndices)
      tags.setCornerWeights(mesh.cornerWeights)
      const topology = new PxOsdMeshTopology(mesh.scheme, mesh.orientation,
        mesh.faceVertexCounts, mesh.faceVertexIndices, mesh.holeIndices, tags)
      const fvarTopologies = mesh.fvarIndices.length > 0 ? [mesh.fvarIndices] : []
      const refiner = PxOsdRefinerFactory.create(topology, fvarTopologies, TfToken(name))!
      expect(refiner).not.toBeNull()
      const numFvarChannels = refiner.getNumFVarChannels()
      expect(numFvarChannels).toBe(mesh.native.numFVarChannels)

      // hdSt/subdivision.cpp:1040-1097 (uniform)
      const patchOptions = new PatchTableFactoryOptions(mesh.level)
      if (numFvarChannels > 0) {
        patchOptions.generateFVarTables = true
        patchOptions.includeFVarBaseLevelIndices = true
        patchOptions.generateFVarLegacyLinearPatches = true
      }
      refiner.refineUniform({ refinementLevel: mesh.level })
      const options = new StencilTableFactoryOptions()
      options.generateOffsets = true
      options.generateIntermediateLevels = false
      options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VERTEX
      expectStencils(StencilTableFactory.create(refiner, options), mesh.native.vertexStencils)
      options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VARYING
      expectStencils(StencilTableFactory.create(refiner, options), mesh.native.varyingStencils)
      options.interpolationMode = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
      for (let i = 0; i < numFvarChannels; ++i) {
        options.fvarChannel = i
        expectStencils(StencilTableFactory.create(refiner, options), mesh.native.faceVaryingStencils[i]!)
      }
      const patchTable = PatchTableFactory.create(refiner, patchOptions)
      expect(patchTable.getNumPtexFaces()).toBe(mesh.native.numPtexFaces)
      expect(patchTable.getPatchControlVerticesTable()).toEqual(mesh.native.patchVerts)
      expect(patchTable.getPatchParamTable().flatMap((p) => [p.field0, p.field1])).toEqual(mesh.native.patchParams)
      if (numFvarChannels > 0) {
        expect(patchTable.getFVarValues(0)).toEqual(mesh.native.fvarValues)
        expect(patchTable.getFVarPatchParams(0).flatMap((p) => [p.field0, p.field1])).toEqual(mesh.native.fvarPatchParams)
      }
    })
  }
})
