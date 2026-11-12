// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/drawBatch.cpp,
//  pxr/imaging/hdSt/glslProgram.cpp,
//  pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Builds the two programs testHdStDepthBias compiles
// (pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp) and returns the GLSL text
// Storm's code generator hands to Hgi for each shader stage, i.e. what
// HdStGLSLProgram's _DumpShaderSource prints
// (pxr/imaging/hdSt/glslProgram.cpp:149-170): shaderCodeDeclarations followed
// by shaderCode.
//
// The draw item is assembled from the buffer specs and shader keys upstream's
// HdStMesh / primUtils / HdStRenderPassState / HdSt_PipelineDrawBatch produce
// for this test; every input below cites the upstream code that produces it.
// The two cubes (/white/cube, /black/cube) share one program per kind, so one
// draw item suffices.
//
// Programs are compiled through HdSt_DrawBatchDrawingProgram::CompileShader
// (drawBatch.cpp:424-510), the code path upstream takes.

import { Token as TfToken } from 'typescript-usd/tf'
import {
  CullStyle as HdCullStyle,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDescTokens as HdMeshReprDescTokens,
  RprimSharedData as HdRprimSharedData,
  ShaderTokens as HdShaderTokens,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import {
  HgiDeviceCapabilitiesBits,
  HgiShaderStageBits,
  type Hgi,
  type HgiShaderFunctionDesc,
} from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdStBinding, HdStBindingRequest } from '../src/binding.ts'
import { HdSt_CullingComputeShaderKey } from '../src/cullingShaderKey.ts'
import { HdStDrawItem } from '../src/drawItem.ts'
import { HdSt_DrawBatchDrawingProgram } from '../src/drawBatch.ts'
import { HdSt_FallbackLightingShader } from '../src/fallbackLightingShader.ts'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderFvarPatchType,
  HdSt_GeometricShaderPrimitiveType,
} from '../src/geometricShader.ts'
import { HdStGLSLFXShader } from '../src/glslfxShader.ts'
import { HdSt_MeshShaderKey, HdSt_MeshShaderKeyNormalSource } from '../src/meshShaderKey.ts'
import { HdStPackageFallbackMaterialNetworkShader } from '../src/package.ts'
import {
  HdSt_PipelineDrawBatchCullingProgram,
  _GetDrawCommandTraits,
  _tokens as _pipelineDrawBatchTokens,
} from '../src/pipelineDrawBatch.ts'
import { HdStRenderPassShader } from '../src/renderPassShader.ts'
import { HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding } from '../src/resourceBinder.ts'
import type { HdStResourceRegistry } from '../src/resourceRegistry.ts'
import { HdStMaterialTagTokens } from '../src/tokens.ts'
import { HdSt_RegisterShaderResources } from '../src/shaderResources.ts'
import { Hdx_RegisterShaderResources } from '../../hdx/src/shaderResources.ts'

/** One stage's text, as _DumpShaderSource prints it. */
export interface CodegenStageText {
  stage: string
  text: string
}

/** The programs of testHdStDepthBias, in compile order. */
export interface DepthBiasCodegenPrograms {
  /** program0: the GPU frustum-cull compute program. */
  cull: CodegenStageText[]
  /** program1: the mesh drawing program. */
  draw: CodegenStageText[]
}

/** glslProgram.cpp:111-138 (_GetShaderType). */
function _GetShaderType(stage: number): string {
  switch (stage) {
    case HgiShaderStageBits.HgiShaderStageCompute: return 'COMPUTE_SHADER'
    case HgiShaderStageBits.HgiShaderStageVertex: return 'VERTEX_SHADER'
    case HgiShaderStageBits.HgiShaderStageTessellationControl: return 'TESS_CONTROL_SHADER'
    case HgiShaderStageBits.HgiShaderStageTessellationEval: return 'TESS_EVALUATION_SHADER'
    case HgiShaderStageBits.HgiShaderStageGeometry: return 'GEOMETRY_SHADER'
    case HgiShaderStageBits.HgiShaderStageFragment: return 'FRAGMENT_SHADER'
    case HgiShaderStageBits.HgiShaderStagePostTessellationControl: return 'POST_TESS_CONTROL_SHADER'
    case HgiShaderStageBits.HgiShaderStagePostTessellationVertex: return 'POST_TESS_VERTEX_SHADER'
    default: return 'UNKNOWN_SHADER'
  }
}

function _StageTexts(descs: readonly HgiShaderFunctionDesc[]): CodegenStageText[] {
  return descs.map((d) => ({
    stage: _GetShaderType(d.shaderStage),
    text: (d.shaderCodeDeclarations ?? '(shaderCodeDeclarations empty)\n') +
      (d.shaderCode ?? '(shaderCode empty)\n'),
  }))
}

/** Exactly the inputs fed to the code generator (reported by the test). */
export const DepthBiasCodegenInputs = {
  /** primUtils.cpp:847-938 (HdStPopulateConstantPrimvars): transform and
   *  transformInverse as HdVtBufferSource(GfMatrix4d, allowDoubles =
   *  ShaderDoublePrecision), bboxLocalMin/Max GfVec4f, primID int, then the
   *  delegate's constant primvars in descriptor order
   *  (hd/unitTestDelegate.cpp AddCube: displayColor GfVec3f, displayOpacity
   *  float). Allocated with UpdateShaderStorageBufferArrayRange(primvar,
   *  ..., HdBufferArrayUsageHintBitsStorage) (primUtils.cpp:1072-1075). */
  constantPrimvarSpecs(doublesSupported: boolean): HdBufferSpec[] {
    const mat = doublesSupported ? HdType.HdTypeDoubleMat4 : HdType.HdTypeFloatMat4
    return [
      { name: HdTokens.transform, tupleType: { type: mat, count: 1 } },
      { name: HdTokens.transformInverse, tupleType: { type: mat, count: 1 } },
      { name: HdTokens.bboxLocalMin, tupleType: { type: HdType.HdTypeFloatVec4, count: 1 } },
      { name: HdTokens.bboxLocalMax, tupleType: { type: HdType.HdTypeFloatVec4, count: 1 } },
      { name: HdTokens.primID, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: HdTokens.displayColor, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
      { name: HdTokens.displayOpacity, tupleType: { type: HdType.HdTypeFloat, count: 1 } },
    ]
  },
  /** mesh.cpp:1806-1958 (_PopulateVertexPrimvars): the cube's only vertex
   *  primvar is points (GfVec3f); scheme "none" generates no smooth normals
   *  (mesh.cpp:2494-2502) and smoothHull is not flat-shaded, so no flat
   *  normals (mesh.cpp:3181-3192). Usage Vertex|Storage (mesh.cpp:1951-1957). */
  vertexPrimvarSpecs(): HdBufferSpec[] {
    return [
      { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
    ]
  },
  /** mesh.cpp:851-869: not refined, no ptex (_UseQuadIndices false), so
   *  HdSt_TriangleIndexBuilderComputation::GetBufferSpecs
   *  (triangulate.cpp:29-39). Usage Index|Storage (mesh.cpp:802-805). */
  topologySpecs(): HdBufferSpec[] {
    return [
      { name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } },
      { name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
    ]
  },
}

/** renderPassState.cpp:247-356: the renderPassState uniform buffer specs
 *  and the binding request added to the render pass shader. */
function _AddRenderPassStateBinding(
  registry: HdStResourceRegistry,
  renderPassShader: HdStRenderPassShader,
): void {
  const hgi = registry.getHgi()
  const maxClipPlanes = hgi.getCapabilities()!.getMaxClipDistances()
  const clipPlanesSize = 0 // HdStRenderPassState default: no clip planes
  const bufferSpecs: HdBufferSpec[] = []
  const matType = HdVtBufferSource.getDefaultMatrixType()
  const add = (name: TfToken, type: HdType, count = 1) =>
    bufferSpecs.push({ name, tupleType: { type, count } })
  add(HdShaderTokens.worldToViewMatrix, matType)
  add(HdShaderTokens.worldToViewInverseMatrix, matType)
  add(HdShaderTokens.projectionMatrix, matType)
  add(HdShaderTokens.projectionInverseMatrix, matType)
  add(HdShaderTokens.imageToWorldMatrix, matType)
  add(HdShaderTokens.imageToHorizontallyNormalizedFilmback, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.overrideColor, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.wireframeColor, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.maskColor, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.indicatorColor, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.pointColor, HdType.HdTypeFloatVec4)
  add(HdShaderTokens.pointSize, HdType.HdTypeFloat)
  add(HdShaderTokens.pointSelectedSize, HdType.HdTypeFloat)
  add(HdShaderTokens.lightingBlendAmount, HdType.HdTypeFloat)
  add(HdShaderTokens.linearExposure, HdType.HdTypeFloat)
  add(HdShaderTokens.stepSize, HdType.HdTypeFloat)
  add(HdShaderTokens.stepSizeLighting, HdType.HdTypeFloat)
  add(HdShaderTokens.multisampleCount, HdType.HdTypeUInt32)
  add(HdShaderTokens.alphaThreshold, HdType.HdTypeFloat)
  add(HdShaderTokens.tessLevel, HdType.HdTypeFloat)
  add(HdShaderTokens.viewport, HdType.HdTypeFloatVec4)
  if (maxClipPlanes > 0) {
    const minNumClipPlanes = Math.min(maxClipPlanes, 4)
    const clipPlanesBufferSize = Math.max(clipPlanesSize, minNumClipPlanes)
    add(HdShaderTokens.numClipPlanes, HdType.HdTypeUInt32)
    add(HdShaderTokens.clipPlanes, HdType.HdTypeFloatVec4, clipPlanesBufferSize)
  }
  const bar = registry.allocateUniformBufferArrayRange(
    HdTokens.drawingShader, bufferSpecs, _HdBufferArrayUsageHintBitsUniform)
  renderPassShader.addBufferBinding(
    new HdStBindingRequest(HdStBinding.UBO, TfToken('renderPassState'), bar!,
      /*interleaved=*/true))
}

// hd/bufferArray.h:51-59 (HdBufferArrayUsageHintBits)
const _HdBufferArrayUsageHintBitsUniform = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform
const _HdBufferArrayUsageHintBitsStorage = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
const _HdBufferArrayUsageHintBitsVertex = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex
const _HdBufferArrayUsageHintBitsIndex = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex

/** Compiles testHdStDepthBias's two programs on `hgi`, with the resource
 *  registry `makeRegistry(hgi)` (upstream: the render delegate's
 *  HdStResourceRegistry), and returns their stage texts. */
export function DepthBiasCodegenPrograms(
  hgi: Hgi,
  makeRegistry: (hgi: Hgi) => HdStResourceRegistry,
): DepthBiasCodegenPrograms {
  // Upstream finds the hdSt and hdx shader resources through their plugins
  // (mesh.glslfx imports $TOOLS/hdx/shaders/selection.glslfx).
  HdSt_RegisterShaderResources()
  Hdx_RegisterShaderResources()

  const recorded: HgiShaderFunctionDesc[] = []
  const createShaderFunction = hgi.CreateShaderFunction.bind(hgi)
  hgi.CreateShaderFunction = (desc) => {
    recorded.push(desc.clone())
    return createShaderFunction(desc)
  }

  const registry = makeRegistry(hgi)
  const caps = hgi.getCapabilities()!

  // ---- draw item (HdStMesh::_UpdateDrawItem, mesh.cpp) ----
  const sharedData = new HdRprimSharedData(8)
  sharedData.rprimID = '/white/cube'
  const drawItem = new HdStDrawItem(sharedData)
  const dc = drawItem.getDrawingCoord()

  const doublesSupported = caps.isSet(
    HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)
  sharedData.barContainer.Set(dc.getConstantPrimvarIndex(),
    registry.allocateShaderStorageBufferArrayRange(HdTokens.primvar,
      DepthBiasCodegenInputs.constantPrimvarSpecs(doublesSupported),
      _HdBufferArrayUsageHintBitsStorage))
  sharedData.barContainer.Set(dc.getVertexPrimvarIndex(),
    registry.allocateNonUniformBufferArrayRange(HdTokens.primvar,
      DepthBiasCodegenInputs.vertexPrimvarSpecs(),
      _HdBufferArrayUsageHintBitsVertex | _HdBufferArrayUsageHintBitsStorage))
  sharedData.barContainer.Set(dc.getTopologyIndex(),
    registry.allocateNonUniformBufferArrayRange(HdTokens.topology,
      DepthBiasCodegenInputs.topologySpecs(),
      _HdBufferArrayUsageHintBitsIndex | _HdBufferArrayUsageHintBitsStorage))

  // primUtils.cpp:292-347: displayOpacity is authored and there is no
  // material, so the tag is the screenDoor default transparency mode's
  // "masked".
  drawItem.setMaterialTag(HdStMaterialTagTokens.masked)

  // The cubes have no material, so HdStGetMaterialNetworkShader returns the
  // fallback material sprim's shader (primUtils.cpp:373-401). The render
  // delegate creates that sprim with an HdStGLSLFXShader over
  // fallbackMaterialNetwork.glslfx (renderDelegate.cpp:561-573); fallback
  // sprims are never synced, so HdStMaterial::Sync does not replace it.
  const materialNetworkShader = new HdStGLSLFXShader(
    new HioGlslfx(HdStPackageFallbackMaterialNetworkShader()))
  drawItem.setMaterialNetworkShader(materialNetworkShader)

  // mesh.cpp:2781-2989 (_UpdateDrawItemGeometricShader) for the smoothHull
  // repr (hd/renderIndex.cpp:1017-1022: geomStyle Hull, cullStyle DontCare,
  // surfaceShader, not flat shaded, no wireframe blending; other
  // HdMeshReprDesc defaults hd/mesh.h:39-61) of a unit-test cube
  // (scheme none, not double sided, cullStyle DontCare, no instancer).
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
  drawItem.setGeometricShader(HdSt_GeometricShader.create(meshKey, registry))

  // ---- render pass state (renderPassState.cpp:60-80, 247-356, 536-543) ----
  const renderPassShader = new HdStRenderPassShader()
  const lightingShader = new HdSt_FallbackLightingShader()
  _AddRenderPassStateBinding(registry, renderPassShader)
  const stateShaders = [lightingShader, renderPassShader]

  // ---- program0: frustum culling (pipelineDrawBatch.cpp:1971-2000) ----
  const useMetalTessellation = drawItem.getGeometricShader()!.getUseMetalTessellation()
  const traits = _GetDrawCommandTraits(
    drawItem.getInstancePrimvarNumLevels(),
    /*useDrawIndexed=*/true,
    /*useInstanceCulling=*/false,
    useMetalTessellation ? 8 : 0)      // pipelineDrawBatch.cpp:617-618
  const cullingProgram = new HdSt_PipelineDrawBatchCullingProgram()
  cullingProgram.initialize(true, false, 0n)
  const cullShaderKey = new HdSt_CullingComputeShaderKey(
    /*instancing=*/false,
    /*tinyCull=*/false,   // HdStRenderPassState default
    /*counting=*/false)   // IsEnabledGPUCountVisibleInstances() default
  cullingProgram.setDrawingCoordBufferBinding(
    new HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding(
      _pipelineDrawBatchTokens.drawCullInput,
      traits.drawingCoord0_offset / 4,   // pipelineDrawBatch.cpp:837
      traits.numUInt32))                 // dispatchBuffer->GetCommandNumUints()
  cullingProgram.setGeometricShader(HdSt_GeometricShader.create(cullShaderKey, registry))
  const start0 = recorded.length
  cullingProgram.compileShader(drawItem, registry)
  const cull = _StageTexts(recorded.slice(start0))

  // ---- program1: drawing (drawBatch.cpp:336-414) ----
  const program = new HdSt_DrawBatchDrawingProgram()
  program.setShaders(stateShaders)
  program.setGeometricShader(drawItem.getGeometricShader())
  program.setMaterialNetworkShader(drawItem.getMaterialNetworkShader())
  const start1 = recorded.length
  program.compileShader(drawItem, registry)
  const draw = _StageTexts(recorded.slice(start1))

  hgi.CreateShaderFunction = createShaderFunction
  return { cull, draw }
}

