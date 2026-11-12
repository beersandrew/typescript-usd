// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/pxOsd/refinerFactory.cpp, pxr/imaging/hdSt/subdivision.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdSt's uniform refinement sequence (pxr/imaging/hdSt/subdivision.cpp:
// 1016-1131 in OpenUSD 26.11.1) run on this port, against the same sequence
// run natively through PxOsdRefinerFactory (fixtures/hdStSequence.json,
// capture/hdStSequence.cpp).
//
// This is the consumption check for Storm: the refiner is built from a
// PxOsdMeshTopology-shaped description with the token mapping of
// pxr/imaging/pxOsd/refinerFactory.cpp (Converter::GetOptions, :68-178, and
// the TopologyRefinerFactory<Converter> specialization, :182-420), then the
// stencil and patch tables are built with exactly HdSt's options and checked
// against what HdSt reads from them: GetSizes/GetOffsets/GetControlIndices/
// GetWeights (subdivision.cpp:274-299, 852-884), the PatchParam words
// (:1325-1356, 1367-1416, 1597-1609), patch vertices (:1173-1199) and the
// face-varying values and patch params (:1441-1521).

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  Options,
  SchemeType,
  VtxBoundaryInterpolation,
  FVarLinearInterpolation,
} from '../../src/sdc/index.ts'
import {
  TopologyRefinerFactory,
  StencilTableFactory,
  StencilTableFactoryOptions,
  StencilInterpolationMode,
  PatchTableFactory,
  PatchTableFactoryOptions,
  type TopologyDescriptor,
  type StencilTableReal,
} from '../../src/far/index.ts'
import { readFixture, compareFloats } from './shapeUtils.ts'

const here = dirname(fileURLToPath(import.meta.url))

interface NativeStencils {
  numControlVertices: number
  numStencils: number
  sizes: number[]
  offsets: number[]
  indices: number[]
  weights: number[]
}

interface Mesh {
  scheme: 'catmullClark' | 'loop' | 'bilinear'
  orientation: string
  level: number
  faceVertexCounts: number[]
  faceVertexIndices: number[]
  creaseLengths: number[]
  creaseIndices: number[]
  creaseWeights: number[]
  cornerIndices: number[]
  cornerWeights: number[]
  holeIndices: number[]
  fvarIndices: number[]
  native: {
    level: number
    numFVarChannels: number
    vertexAppended: boolean
    vertexStencils: NativeStencils
    varyingStencils: NativeStencils
    faceVaryingStencils: NativeStencils[]
    numPtexFaces: number
    patchArrayType: number
    patchVerts: number[]
    patchParams: number[]
    fvarPatchType?: number
    fvarValues?: number[]
    fvarPatchParams?: number[]
  }
}

const { meshes } = readFixture<{ meshes: Record<string, Mesh> }>(join(here, 'fixtures', 'hdStSequence.json'))

// pxOsd/refinerFactory.cpp:50-66 (scheme) and :68-178 (options) with the
// empty subdivision-tag tokens these meshes author.
function converterOptions(mesh: Mesh): { schemeType: SchemeType; schemeOptions: Options } {
  const schemeType =
    mesh.scheme === 'catmullClark' ? SchemeType.CATMARK : mesh.scheme === 'loop' ? SchemeType.LOOP : SchemeType.BILINEAR
  const options = new Options()
  // an empty vertex interpolation rule (and bilinear always) is edgeAndCorner
  options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
  // an empty face-varying rule is FVAR_LINEAR_NONE
  options.setFVarLinearInterpolation(FVarLinearInterpolation.NONE)
  return { schemeType, schemeOptions: options }
}

// pxOsd/refinerFactory.cpp:182-420 as a TopologyDescriptor.
function converterDescriptor(mesh: Mesh): TopologyDescriptor {
  const desc: TopologyDescriptor = {
    numVertices: Math.max(...mesh.faceVertexIndices) + 1,
    vertsPerFace: mesh.faceVertexCounts,
    vertIndicesPerFace: mesh.faceVertexIndices,
    creaseLengths: mesh.creaseLengths,
    creaseIndices: mesh.creaseIndices,
    creaseSharpnesses: mesh.creaseWeights.map((w) => Math.max(0, w)),
    cornerIndices: mesh.cornerIndices,
    cornerWeights: mesh.cornerWeights.map((w) => Math.max(0, w)),
    holeIndices: mesh.holeIndices,
    isLeftHanded: mesh.orientation !== 'rightHanded',
  }
  if (mesh.fvarIndices.length > 0) {
    desc.fvarChannels = [{ numValues: Math.max(...mesh.fvarIndices) + 1, valueIndices: mesh.fvarIndices }]
  }
  return desc
}

function expectStencils(t: StencilTableReal, e: NativeStencils): void {
  expect(t.getNumControlVertices()).toBe(e.numControlVertices)
  expect(t.getNumStencils()).toBe(e.numStencils)
  expect(t.getSizes()).toEqual(e.sizes)
  expect(t.getOffsets()).toEqual(e.offsets)
  expect(t.getControlIndices()).toEqual(e.indices)
  // HdSt uploads GetControlIndices().size() weights (subdivision.cpp:296-299)
  const n = t.getControlIndices().length
  const cmp = compareFloats(t.getWeights().slice(0, n), e.weights.map(Math.fround), 2 ** -20)
  expect(cmp.length).toBe(n)
  expect(cmp.maxUlps).toBeLessThanOrEqual(64)
}

for (const [name, mesh] of Object.entries(meshes)) {
  describe(`HdSt uniform refinement sequence: ${name}`, () => {
    // Built inside the tests so a refiner failure is reported per test
    // rather than aborting collection.
    let built: ReturnType<typeof runSequence> | null = null
    const run = (): ReturnType<typeof runSequence> => (built ??= runSequence(mesh))

    it('builds the refiner HdSt builds', () => {
      const { numFvarChannels, vertexAppended } = run()
      expect(numFvarChannels).toBe(mesh.native.numFVarChannels)
      expect(vertexAppended).toBe(mesh.native.vertexAppended)
    })
    it('vertex stencil buffers match native', () => expectStencils(run().vertexStencils, mesh.native.vertexStencils))
    it('varying stencil buffers match native', () => expectStencils(run().varyingStencils, mesh.native.varyingStencils))
    if (mesh.native.numFVarChannels > 0) {
      it('face-varying stencil buffers match native', () =>
        expectStencils(run().faceVaryingStencils[0]!, mesh.native.faceVaryingStencils[0]!))
    }
    it('patch vertices and PatchParam words match native', () => {
      const { patchTable } = run()
      expect(patchTable.getNumPtexFaces()).toBe(mesh.native.numPtexFaces)
      expect(patchTable.getPatchArrayDescriptor(0).getType()).toBe(mesh.native.patchArrayType)
      expect(patchTable.getPatchControlVerticesTable()).toEqual(mesh.native.patchVerts)
      expect(patchTable.getPatchParamTable().flatMap((p) => [p.field0, p.field1])).toEqual(mesh.native.patchParams)
    })
    if (mesh.native.numFVarChannels > 0) {
      it('face-varying patch values and params match native', () => {
        const { patchTable } = run()
        expect(patchTable.getFVarPatchDescriptor(0).getType()).toBe(mesh.native.fvarPatchType)
        expect(patchTable.getFVarValues(0)).toEqual(mesh.native.fvarValues)
        expect(patchTable.getFVarPatchParams(0).flatMap((p) => [p.field0, p.field1])).toEqual(mesh.native.fvarPatchParams)
      })
    }
  })
}

function runSequence(mesh: Mesh) {
    // hdSt/subdivision.cpp:1019-1026
    const refiner = TopologyRefinerFactory.create(converterDescriptor(mesh), converterOptions(mesh))
    const numFvarChannels = refiner.getNumFVarChannels()
    const level = mesh.level
    const adaptive = false

    // hdSt/subdivision.cpp:1040-1045
    const patchOptions = new PatchTableFactoryOptions(level)
    if (numFvarChannels > 0) {
      patchOptions.generateFVarTables = true
      patchOptions.includeFVarBaseLevelIndices = true
      patchOptions.generateFVarLegacyLinearPatches = !adaptive
    }
    // hdSt/subdivision.cpp:1067
    refiner.refineUniform({ refinementLevel: level })

    // hdSt/subdivision.cpp:1070-1092
    const options = new StencilTableFactoryOptions()
    options.generateOffsets = true
    options.generateIntermediateLevels = adaptive
    options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VERTEX
    let vertexStencils = StencilTableFactory.create(refiner, options)
    options.interpolationMode = StencilInterpolationMode.INTERPOLATE_VARYING
    const varyingStencils = StencilTableFactory.create(refiner, options)
    options.interpolationMode = StencilInterpolationMode.INTERPOLATE_FACE_VARYING
    const faceVaryingStencils: StencilTableReal[] = []
    for (let i = 0; i < numFvarChannels; ++i) {
      options.fvarChannel = i
      faceVaryingStencils.push(StencilTableFactory.create(refiner, options))
    }
    // hdSt/subdivision.cpp:1093-1097
    const patchTable = PatchTableFactory.create(refiner, patchOptions)

    // hdSt/subdivision.cpp:1100-1109
    let vertexAppended = false
    if (patchTable.getLocalPointStencilTable()) {
      const s = StencilTableFactory.AppendLocalPointStencilTable(refiner, vertexStencils, patchTable.getLocalPointStencilTable())
      if (s) {
        vertexStencils = s
        vertexAppended = true
      }
    }

    return { numFvarChannels, vertexAppended, vertexStencils, varyingStencils, faceVaryingStencils, patchTable }
}
