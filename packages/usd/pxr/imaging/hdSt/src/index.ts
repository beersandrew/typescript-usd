// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/hdSt — Storm, ported file by file from pxr/imaging/hdSt
// (OpenUSD 26.11.1) over the Hgi interface. Shaders are upstream's glslfx;
// the WebGPU backend (typescript-usd/hgiWebGPU) translates them to WGSL.
//
// Upstream registers hdSt's plugInfo.json (its shader resources and the
// Types of its scene index plugins) at startup; importing this module plays
// that part.

import { HdSt_RegisterShaderResources } from './shaderResources.ts'
HdSt_RegisterShaderResources()

// The TF_REGISTRY_FUNCTION blocks of hdSt's *SceneIndexPlugin.cpp run when
// upstream loads hdSt; importing this module plays that part.
import './sceneIndexPlugins.ts'
export { HdSt_MaterialBindingResolvingSceneIndexPlugin as _MaterialBindingResolvingSceneIndexPlugin } from './materialBindingResolvingSceneIndexPlugin.ts'
export { HdSt_NodeIdentifierResolvingSceneIndexPlugin as _NodeIdentifierResolvingSceneIndexPlugin } from './nodeIdentifierResolvingSceneIndexPlugin.ts'
export { HdSt_MaterialPrimvarTransferSceneIndexPlugin as _MaterialPrimvarTransferSceneIndexPlugin } from './materialPrimvarTransferSceneIndexPlugin.ts'
export { HdSt_UnboundMaterialPruningSceneIndexPlugin as _UnboundMaterialPruningSceneIndexPlugin } from './unboundMaterialPruningSceneIndexPlugin.ts'

export { HdSt_RegisterShaderResources as _RegisterShaderResources } from './shaderResources.ts'
export { HdStRenderDelegate as RenderDelegate } from './renderDelegate.ts'
export type { HdDriver as Driver, HdRenderDelegateInfo as RenderDelegateInfo } from './renderDelegate.ts'
export { HdStRenderParam as RenderParam } from './renderParam.ts'
export { HdSt_RenderPass as _RenderPass } from './renderPass.ts'
export { HdStRenderPassState as RenderPassState } from './renderPassState.ts'
export { HdStRenderBuffer as RenderBuffer } from './renderBuffer.ts'
export { HdStResourceRegistry as ResourceRegistry } from './resourceRegistry.ts'
export { HdStCommandBuffer as CommandBuffer } from './commandBuffer.ts'
export { HdStDrawItem as DrawItem } from './drawItem.ts'
export { HdStDrawItemInstance as DrawItemInstance } from './drawItemInstance.ts'
export { HdSt_DrawBatch as _DrawBatch } from './drawBatch.ts'
export { HdSt_PipelineDrawBatch as _PipelineDrawBatch } from './pipelineDrawBatch.ts'
export { HdSt_DrawItemsCache as _DrawItemsCache } from './drawItemsCache.ts'
export { HdSt_CodeGen as _CodeGen } from './codeGen.ts'
export { HdSt_ResourceBinder as _ResourceBinder } from './resourceBinder.ts'
export { HdStGLSLProgram as GLSLProgram } from './glslProgram.ts'
export { HdStHgiConversions as HgiConversions } from './hgiConversions.ts'
export { HdStHioConversions as HioConversions } from './hioConversions.ts'
export { HdStMesh as Mesh } from './mesh.ts'
export { HdStBasisCurves as BasisCurves } from './basisCurves.ts'
export { HdStPoints as Points } from './points.ts'
export { HdSt_BasisCurvesTopology as _BasisCurvesTopology } from './basisCurvesTopology.ts'
export { HdSt_BasisCurvesIndexBuilderComputation as _BasisCurvesIndexBuilderComputation, HdSt_BasisCurvesPrimvarInterpolaterComputation as _BasisCurvesPrimvarInterpolaterComputation, HdSt_ExpandVarying as _ExpandVarying } from './basisCurvesComputations.ts'
export { HdSt_BasisCurvesShaderKey as _BasisCurvesShaderKey, HdSt_BasisCurvesShaderKeyDrawStyle as _BasisCurvesShaderKeyDrawStyle, HdSt_BasisCurvesShaderKeyNormalStyle as _BasisCurvesShaderKeyNormalStyle } from './basisCurvesShaderKey.ts'
export { HdSt_PointsShaderKey as _PointsShaderKey } from './pointsShaderKey.ts'
export { HdStMaterial as Material } from './material.ts'
export { HdStLight as Light } from './light.ts'
export { HdStBinding as Binding, HdStBindingRequest as BindingRequest } from './binding.ts'
export { HdStLightingShader as LightingShader } from './lightingShader.ts'
export { HdSt_FallbackLightingShader as _FallbackLightingShader } from './fallbackLightingShader.ts'
export { HdStSimpleLightingShader as SimpleLightingShader } from './simpleLightingShader.ts'
export {
  HdSt_DomeLightComputationGPU as _DomeLightComputationGPU,
  HdSt_DomeLightMipmapComputationGPU as _DomeLightMipmapComputationGPU,
  HdSt_ComputeDomeLightCubemapWidth as _ComputeDomeLightCubemapWidth,
} from './domeLightComputations.ts'
export {
  HdStPackageComputeShader as PackageComputeShader,
  HdStPackageRenderPassShader as PackageRenderPassShader,
  HdStPackageFallbackLightingShader as PackageFallbackLightingShader,
  HdStPackageFallbackMaterialNetworkShader as PackageFallbackMaterialNetworkShader,
  HdStPackageInvalidMaterialNetworkShader as PackageInvalidMaterialNetworkShader,
} from './package.ts'
export {
  HdStTokens as Tokens,
  HdStPerfTokens as PerfTokens,
  HdStRenderSettingsTokens as RenderSettingsTokens,
  HdStMaterialTagTokens as MaterialTagTokens,
} from './tokens.ts'
export { HdStDebugCodes as DebugCodes } from './debugCodes.ts'
export { HdSt_TestDriverBase as _TestDriverBase, HdSt_DrawTask as _DrawTask, HdSt_TestDriver as _TestDriver, HdSt_TestLightingShader as _TestLightingShader } from './unitTestHelper.ts'
export type { HdStTestAovReadback as _TestAovReadback } from './unitTestHelper.ts'
export { HdSt_MeshTopology as _MeshTopology, HdSt_MeshTopologyRefineMode as _MeshTopologyRefineMode, HdSt_MeshTopologyQuadsMode as _MeshTopologyQuadsMode, HdSt_MeshTopologyInterpolation as _MeshTopologyInterpolation, HdSt_IndexSubsetComputation as _IndexSubsetComputation, HdSt_GeomSubsetFaceIndexBuilderComputation as _GeomSubsetFaceIndexBuilderComputation, HdSt_GeomSubsetFaceIndexHelperComputation as _GeomSubsetFaceIndexHelperComputation } from './meshTopology.ts'
export { HdSt_TriangleIndexBuilderComputation as _TriangleIndexBuilderComputation, HdSt_TriangulateFaceVaryingComputation as _TriangulateFaceVaryingComputation } from './triangulate.ts'
export { HdSt_QuadInfoBuilderComputation as _QuadInfoBuilderComputation, HdSt_QuadIndexBuilderComputation as _QuadIndexBuilderComputation, HdSt_QuadrangulateTableComputation as _QuadrangulateTableComputation, HdSt_QuadrangulateComputation as _QuadrangulateComputation, HdSt_QuadrangulateFaceVaryingComputation as _QuadrangulateFaceVaryingComputation, HdSt_QuadrangulateComputationGPU as _QuadrangulateComputationGPU } from './quadrangulate.ts'
export { HdSt_VertexAdjacencyBuilder as _VertexAdjacencyBuilder, HdSt_VertexAdjacencyBuilderComputation as _VertexAdjacencyBuilderComputation, HdSt_VertexAdjacencyBufferSource as _VertexAdjacencyBufferSource } from './vertexAdjacency.ts'
export { HdSt_SmoothNormalsComputationCPU as _SmoothNormalsComputationCPU, HdSt_SmoothNormalsComputationGPU as _SmoothNormalsComputationGPU } from './smoothNormals.ts'
export { HdSt_FlatNormalsComputationCPU as _FlatNormalsComputationCPU, HdSt_FlatNormalsComputationGPU as _FlatNormalsComputationGPU } from './flatNormals.ts'
// The Storm members the hdx tasks use (pxr/imaging/hdx includes
// hdSt/renderPassShader.h, textureIdentifier.h, dynamicUvTextureObject.h, ...).
export { HdStRenderPassShader as RenderPassShader } from './renderPassShader.ts'
export { HdStShaderCode as ShaderCode } from './shaderCode.ts'
export { HdStTextureIdentifier as TextureIdentifier } from './textureIdentifier.ts'
export { HdStDynamicUvSubtextureIdentifier as DynamicUvSubtextureIdentifier } from './subtextureIdentifier.ts'
export { HdStDynamicUvTextureObject as DynamicUvTextureObject } from './dynamicUvTextureObject.ts'
export { HdStTextureType as TextureType } from './enums.ts'
export { HdStBufferResource as BufferResource } from './bufferResource.ts'
export { HdStBindingType as BindingType } from './binding.ts'
export { HdSt_ImageShaderRenderPass as _ImageShaderRenderPass } from './imageShaderRenderPass.ts'
export { HdStRenderBufferTokens as RenderBufferTokens } from './tokens.ts'
export { HdStUvTextureObject as UvTextureObject } from './textureObject.ts'
export { HdStUvSamplerObject as UvSamplerObject } from './samplerObject.ts'
export { HdStTextureUtils as TextureUtils } from './textureUtils.ts'
