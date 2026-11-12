import './plugin/registerPlugin.ts'
// UsdShade schema domain — materials, shaders, connections, binding.
// Depends only on typescript-usd/usd.

export {
  ConnectableAPI,
  ShadeInput,
  ShadeOutput,
  ConnectionSourceInfo,
  getConnectedSourcePath,
  parseSourcePath,
  computeEffectiveSource,
  getValueProducingAttributes,
  getInputNames,
  getOutputNames,
  isContainer,
  requiresEncapsulation,
  getConnectability,
  canConnect,
  canConnectInputToSource,
  canConnectOutputToSource,
  isSourceConnectionFromBaseMaterial,
} from './connectableAPI.ts'
export type { ConnectionSource, SourceType, CanConnectResult } from './connectableAPI.ts'
export {
  ConnectableAPIBehavior,
  ConnectableNodeTypes,
  registerConnectableAPIBehavior,
} from './connectableAPIBehavior.ts'
export type { BehaviorConnectionSource, BehaviorCanConnectResult } from './connectableAPIBehavior.ts'
export { Shader } from './shader.ts'
export { NodeDefAPI } from './nodeDefAPI.ts'
export { NodeGraph } from './nodeGraph.ts'
export type { InterfaceInputConsumer, InterfaceInputConsumersMap } from './nodeGraph.ts'
export { Material } from './material.ts'
export {
  MaterialBindingAPI,
  BINDING_REL_NAME,
  MATERIAL_BINDING_API_SCHEMA_NAME,
  ALL_PURPOSE,
  PREVIEW_PURPOSE,
  FULL_PURPOSE,
  MATERIAL_BIND_FAMILY,
} from './materialBindingAPI.ts'
export type { BindingStrength, ResolvedBinding } from './materialBindingAPI.ts'
export { CoordSysAPI } from './coordSysAPI.ts'
export type { Binding } from './coordSysAPI.ts'
export { CollectionMembershipQuery } from 'typescript-usd/usd'
export type { ExpansionRule } from 'typescript-usd/usd'
export {
  PREVIEW_SURFACE_ID,
  UV_TEXTURE_ID,
  PRIMVAR_READER_FLOAT2_ID,
  TRANSFORM_2D_ID,
  PREVIEW_SURFACE_DEFAULTS,
  PREVIEW_SURFACE_INPUT_TYPES,
} from './previewSurface.ts'
export type { PreviewSurfaceParams } from './previewSurface.ts'
export { ShaderDefUtils } from './shaderDefUtils.ts'
export { ShaderDefParserPlugin } from './shaderDefParser.ts'
export { UdimUtils } from './udimUtils.ts'
export type { ResolvedPathAndTile } from './udimUtils.ts'
export { UsdShadeTokens as Tokens } from './tokens.ts'
