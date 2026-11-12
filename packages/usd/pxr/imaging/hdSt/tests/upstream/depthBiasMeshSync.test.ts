// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/mesh.cpp,
//  pxr/imaging/hdSt/primUtils.cpp,
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2016, 2019, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Syncs the scene of upstream's testHdStDepthBias
// (pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp:136-155: two
// HdUnitTestDelegate::AddCube meshes with scheme "none", a constant
// displayColor each, drawn with the smoothHull repr) through the real legacy
// path: HdUnitTestDelegate -> HdRenderIndex -> HdStRenderDelegate::CreateRprim
// -> HdStMesh::Sync (mesh.cpp) and primUtils.cpp. It checks that each draw
// item's buffer array ranges carry exactly the buffer specs, and that its
// geometric shader is the one built from exactly the mesh shader key, which
// the code generator test (depthBiasCodegen.test.ts) feeds to the code
// generator and compares byte for byte with the native text. Those inputs
// (DepthBiasCodegenInputs in ../depthBiasCodegenPrograms.ts) cite the
// upstream code paths that produce them.
//
// This is a controller (Node) test: no GPU, no browser. Resources are not
// committed (SyncAll(repr, commitResources = false)), as the code generator
// Hgi creates no buffers.

import { describe, expect, it } from 'vitest'
import { Matrix4f as GfMatrix4f, Vec3f as GfVec3f, makeRotation as GfMakeRotation } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpecEquals as HdBufferSpecEquals,
  CullStyle as HdCullStyle,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDescTokens as HdMeshReprDescTokens,
  RenderIndex as HdRenderIndex,
  ReprTokens as HdReprTokens,
  Tokens as HdTokens,
  UnitTestDelegate as HdUnitTestDelegate,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits, HgiTokens } from 'typescript-usd/hgi'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { Token as TfToken, TfErrorMark } from 'typescript-usd/tf'
import type { HdStDrawItem } from '../../src/drawItem.ts'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderFvarPatchType,
  HdSt_GeometricShaderPrimitiveType,
} from '../../src/geometricShader.ts'
import { HdSt_MeshShaderKey, HdSt_MeshShaderKeyNormalSource } from '../../src/meshShaderKey.ts'
import { HdStMesh } from '../../src/mesh.ts'
import { HdStRenderDelegate } from '../../src/renderDelegate.ts'
import { HdSt_RegisterShaderResources } from '../../src/shaderResources.ts'
import { HdStMaterialTagTokens } from '../../src/tokens.ts'
import { Hdx_RegisterShaderResources } from '../../../hdx/src/shaderResources.ts'
import { HgiCodegenTest } from '../codegenTestHgi.ts'
import { DepthBiasCodegenInputs } from '../depthBiasCodegenPrograms.ts'

function specsText(specs: readonly HdBufferSpec[]): string[] {
  return specs.map((s) => `${s.name} ${s.tupleType.type} ${s.tupleType.count}`)
}

function expectSpecs(actual: readonly HdBufferSpec[], expected: readonly HdBufferSpec[]): void {
  expect(specsText(actual)).toEqual(specsText(expected))
  expect(actual.every((s, i) => HdBufferSpecEquals(s, expected[i]!))).toBe(true)
}

function syncDepthBiasScene() {
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()

  const hgi = HgiCodegenTest.metalM4Pro()
  const renderDelegate = new HdStRenderDelegate()
  renderDelegate.setDrivers([{ name: HgiTokens.renderDriver, driver: hgi }])
  const renderIndex = HdRenderIndex.new(renderDelegate)
  const delegate = new HdUnitTestDelegate(renderIndex, '/')

  // testHdStDepthBias.cpp:139-155
  const cubeTransform = new GfMatrix4f(1.0).setScale(4.0).getMultiply(
    new GfMatrix4f(1.0).setRotate(GfMakeRotation([0, 0, 1], 45)))
  for (const [id, color] of [['/white/cube', 1], ['/black/cube', 0]] as const) {
    delegate.addCube(id, cubeTransform, false, '', PxOsdOpenSubdivTokens.none)
    delegate.updatePrimvarValue(id, HdTokens.displayColor,
      VtValue.create(new GfVec3f(color), VtValueTypes.GfVec3f))
  }

  const mark = new TfErrorMark()
  renderIndex.SyncAll(HdReprTokens.smoothHull, /*commitResources=*/false)
  return { hgi, renderDelegate, renderIndex, syncClean: mark.isClean() }
}

describe('testHdStDepthBias scene synced through HdStMesh (controller test)', () => {
  const { hgi, renderDelegate, renderIndex, syncClean } = syncDepthBiasScene()

  // The upstream test passes when its TfErrorMark stays clean
  // (testHdStDepthBias.cpp:190-203).
  it('syncs without posting errors', () => {
    expect(syncClean).toBe(true)
  })
  const caps = hgi.getCapabilities()!
  const doublesSupported = caps.isSet(
    HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

  for (const id of ['/white/cube', '/black/cube']) {
    describe(id, () => {
      const rprim = renderIndex.getRprim(id)
      const drawItems = () => rprim!.getDrawItems(HdReprTokens.smoothHull) as readonly HdStDrawItem[]

      it('is an HdStMesh with one smoothHull draw item', () => {
        expect(rprim).toBeInstanceOf(HdStMesh)
        expect(drawItems().length).toBe(1)
      })

      it('constant primvar BAR has the specs the code generator test uses', () => {
        const bar = drawItems()[0]!.getConstantPrimvarRange()
        expect(bar?.isValid()).toBe(true)
        expectSpecs(bar!.getBufferSpecs(),
          DepthBiasCodegenInputs.constantPrimvarSpecs(doublesSupported))
        expect(bar!.getUsageHint() & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
          .toBeTruthy()
      })

      it('vertex primvar BAR has the specs the code generator test uses', () => {
        const bar = drawItems()[0]!.getVertexPrimvarRange()
        expect(bar?.isValid()).toBe(true)
        expectSpecs(bar!.getBufferSpecs(), DepthBiasCodegenInputs.vertexPrimvarSpecs())
        const vertexStorage = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
        expect(bar!.getUsageHint() & vertexStorage).toBe(vertexStorage)
      })

      it('topology BAR (hull indices slot) has the specs the code generator test uses', () => {
        const item = drawItems()[0]!
        // smoothHull is HdMeshGeomStyleHull: the topology lives in the
        // HullTopology slot (mesh.cpp:3083-3095).
        expect(item.getDrawingCoord().getTopologyIndex()).toBe(HdStMesh.HullTopology)
        const bar = item.getTopologyRange()
        expect(bar?.isValid()).toBe(true)
        expectSpecs(bar!.getBufferSpecs(), DepthBiasCodegenInputs.topologySpecs())
        const indexStorage = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
        expect(bar!.getUsageHint() & indexStorage).toBe(indexStorage)
      })

      it('has no element, face-varying, topology-visibility or instance BARs', () => {
        const item = drawItems()[0]!
        expect(item.getElementPrimvarRange()).toBeNull()
        expect(item.getFaceVaryingPrimvarRange()).toBeNull()
        expect(item.getTopologyVisibilityRange()).toBeNull()
        expect(item.getInstanceIndexRange()).toBeNull()
        expect(item.getInstancePrimvarNumLevels()).toBe(0)
      })

      it('geometric shader is the one built from the code generator test mesh shader key', () => {
        const meshKey = new HdSt_MeshShaderKey(
          HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIANGLES,
          TfToken(HdMeshReprDescTokens.surfaceShader),
          HdSt_MeshShaderKeyNormalSource.NormalSourceFlatGeometric,
          HdInterpolation.HdInterpolationVertex,
          HdCullStyle.HdCullStyleDontCare,
          HdMeshGeomStyle.HdMeshGeomStyleHull,
          HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_TRIANGLES,
          /*lineWidth=*/0,
          /*doubleSided=*/false,
          caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics),
          caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation),
          /*hasCustomDisplacement=*/false,
          /*hasPerFaceInterpolation=*/false,
          /*hasTopologicalVisibility=*/false,
          /*blendWireframeColor=*/false,
          /*hasMirroredTransform=*/false,
          /*hasInstancer=*/false,
          /*enableScalarOverride=*/true,
          /*pointsShadingEnabled=*/false,
          /*forceOpaqueEdges=*/true,
          /*surfaceEdgeIds=*/false,
          caps.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints))
        // HdSt_GeometricShader::Create deduplicates by key hash in the
        // resource registry (geometricShader.cpp:342-374).
        const expected = HdSt_GeometricShader.create(meshKey,
          renderDelegate.getResourceRegistry())
        expect(drawItems()[0]!.getGeometricShader()).toBe(expected)
      })

      it('uses the fallback material network shader and the masked material tag', () => {
        const item = drawItems()[0]!
        const fallback = renderIndex.getFallbackSprim('material') as unknown as
          { getMaterialNetworkShader(): unknown }
        expect(item.getMaterialNetworkShader()).toBe(fallback.getMaterialNetworkShader())
        // primUtils.cpp:292-346: displayOpacity is authored, no material, the
        // default transparency mode is screenDoor -> masked.
        expect(item.getMaterialTag()).toBe(HdStMaterialTagTokens.masked)
      })
    })
  }

  it('both cubes share one topology range and one vertex primvar range', () => {
    const items = ['/white/cube', '/black/cube'].map((id) =>
      renderIndex.getRprim(id)!.getDrawItems(HdReprTokens.smoothHull)[0] as HdStDrawItem)
    // Identical topology registers once (mesh.cpp:714-745, 811-875); identical
    // points share an immutable vertex BAR (mesh.cpp:1850-1879).
    expect(items[0]!.getTopologyRange()).toBe(items[1]!.getTopologyRange())
    expect(items[0]!.getVertexPrimvarRange()).toBe(items[1]!.getVertexPrimvarRange())
    expect(items[0]!.getConstantPrimvarRange()).not.toBe(items[1]!.getConstantPrimvarRange())
  })
})
