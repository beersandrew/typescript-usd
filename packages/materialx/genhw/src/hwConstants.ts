// Ported from MaterialX 1.39.5: source/MaterialXGenHw/HwConstants.h,
//  source/MaterialXGenHw/HwConstants.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/HwConstants.h and HwConstants.cpp
//
// The HW shader generators use a set of predefined variables (inputs and
// uniforms) with binding rules. Generators emit token names (T_*) into the
// source, which are replaced with the default identifier names below via
// token substitution; see the table in the upstream header for the full
// binding documentation.

import { Value, Vector2, Vector3 } from '@mtlx/core'
import { BaseType, Semantic, TypeDesc } from '@mtlx/genshader'

export const HW = {
  // Token identifiers.
  T_IN_POSITION: '$inPosition',
  T_IN_NORMAL: '$inNormal',
  T_IN_TANGENT: '$inTangent',
  T_IN_BITANGENT: '$inBitangent',
  T_IN_TEXCOORD: '$inTexcoord',
  T_IN_GEOMPROP: '$inGeomprop',
  T_IN_COLOR: '$inColor',
  T_POSITION_WORLD: '$positionWorld',
  T_NORMAL_WORLD: '$normalWorld',
  T_TANGENT_WORLD: '$tangentWorld',
  T_BITANGENT_WORLD: '$bitangentWorld',
  T_POSITION_OBJECT: '$positionObject',
  T_NORMAL_OBJECT: '$normalObject',
  T_TANGENT_OBJECT: '$tangentObject',
  T_BITANGENT_OBJECT: '$bitangentObject',
  T_TEXCOORD: '$texcoord',
  T_COLOR: '$color',
  T_WORLD_MATRIX: '$worldMatrix',
  T_WORLD_INVERSE_MATRIX: '$worldInverseMatrix',
  T_WORLD_TRANSPOSE_MATRIX: '$worldTransposeMatrix',
  T_WORLD_INVERSE_TRANSPOSE_MATRIX: '$worldInverseTransposeMatrix',
  T_VIEW_MATRIX: '$viewMatrix',
  T_VIEW_INVERSE_MATRIX: '$viewInverseMatrix',
  T_VIEW_TRANSPOSE_MATRIX: '$viewTransposeMatrix',
  T_VIEW_INVERSE_TRANSPOSE_MATRIX: '$viewInverseTransposeMatrix',
  T_PROJ_MATRIX: '$projectionMatrix',
  T_PROJ_INVERSE_MATRIX: '$projectionInverseMatrix',
  T_PROJ_TRANSPOSE_MATRIX: '$projectionTransposeMatrix',
  T_PROJ_INVERSE_TRANSPOSE_MATRIX: '$projectionInverseTransposeMatrix',
  T_WORLD_VIEW_MATRIX: '$worldViewMatrix',
  T_VIEW_PROJECTION_MATRIX: '$viewProjectionMatrix',
  T_WORLD_VIEW_PROJECTION_MATRIX: '$worldViewProjectionMatrix',
  T_VIEW_POSITION: '$viewPosition',
  T_VIEW_DIRECTION: '$viewDirection',
  T_FRAME: '$frame',
  T_TIME: '$time',
  T_GEOMPROP: '$geomprop',
  T_ALPHA_THRESHOLD: '$alphaThreshold',
  T_NUM_ACTIVE_LIGHT_SOURCES: '$numActiveLightSources',
  T_ENV_MATRIX: '$envMatrix',
  T_ENV_RADIANCE: '$envRadiance',
  T_ENV_RADIANCE_SAMPLER2D: '$envRadianceSampler2D',
  T_ENV_RADIANCE_MIPS: '$envRadianceMips',
  T_ENV_RADIANCE_SAMPLES: '$envRadianceSamples',
  T_ENV_IRRADIANCE: '$envIrradiance',
  T_ENV_IRRADIANCE_SAMPLER2D: '$envIrradianceSampler2D',
  T_TEX_SAMPLER_SAMPLER2D: '$texSamplerSampler2D',
  T_TEX_SAMPLER_SIGNATURE: '$texSamplerSignature',
  T_CLOSURE_DATA_CONSTRUCTOR: '$closureDataConstructor',
  T_ENV_LIGHT_INTENSITY: '$envLightIntensity',
  T_ENV_PREFILTER_MIP: '$envPrefilterMip',
  T_REFRACTION_TWO_SIDED: '$refractionTwoSided',
  T_ALBEDO_TABLE: '$albedoTable',
  T_ALBEDO_TABLE_SIZE: '$albedoTableSize',
  T_AMB_OCC_MAP: '$ambOccMap',
  T_AMB_OCC_GAIN: '$ambOccGain',
  T_SHADOW_MAP: '$shadowMap',
  T_SHADOW_MATRIX: '$shadowMatrix',
  T_VERTEX_DATA_INSTANCE: '$vd',
  T_LIGHT_DATA_INSTANCE: '$lightData',

  // Default names for identifiers, replacing the above tokens.
  IN_POSITION: 'i_position',
  IN_NORMAL: 'i_normal',
  IN_TANGENT: 'i_tangent',
  IN_BITANGENT: 'i_bitangent',
  IN_TEXCOORD: 'i_texcoord',
  IN_GEOMPROP: 'i_geomprop',
  IN_COLOR: 'i_color',
  POSITION_WORLD: 'positionWorld',
  NORMAL_WORLD: 'normalWorld',
  TANGENT_WORLD: 'tangentWorld',
  BITANGENT_WORLD: 'bitangentWorld',
  POSITION_OBJECT: 'positionObject',
  NORMAL_OBJECT: 'normalObject',
  TANGENT_OBJECT: 'tangentObject',
  BITANGENT_OBJECT: 'bitangentObject',
  TEXCOORD: 'texcoord',
  COLOR: 'color',
  WORLD_MATRIX: 'u_worldMatrix',
  WORLD_INVERSE_MATRIX: 'u_worldInverseMatrix',
  WORLD_TRANSPOSE_MATRIX: 'u_worldTransposeMatrix',
  WORLD_INVERSE_TRANSPOSE_MATRIX: 'u_worldInverseTransposeMatrix',
  VIEW_MATRIX: 'u_viewMatrix',
  VIEW_INVERSE_MATRIX: 'u_viewInverseMatrix',
  VIEW_TRANSPOSE_MATRIX: 'u_viewTransposeMatrix',
  VIEW_INVERSE_TRANSPOSE_MATRIX: 'u_viewInverseTransposeMatrix',
  PROJ_MATRIX: 'u_projectionMatrix',
  PROJ_INVERSE_MATRIX: 'u_projectionInverseMatrix',
  PROJ_TRANSPOSE_MATRIX: 'u_projectionTransposeMatrix',
  PROJ_INVERSE_TRANSPOSE_MATRIX: 'u_projectionInverseTransposeMatrix',
  WORLD_VIEW_MATRIX: 'u_worldViewMatrix',
  VIEW_PROJECTION_MATRIX: 'u_viewProjectionMatrix',
  WORLD_VIEW_PROJECTION_MATRIX: 'u_worldViewProjectionMatrix',
  VIEW_POSITION: 'u_viewPosition',
  VIEW_DIRECTION: 'u_viewDirection',
  FRAME: 'u_frame',
  TIME: 'u_time',
  GEOMPROP: 'u_geomprop',
  ALPHA_THRESHOLD: 'u_alphaThreshold',
  NUM_ACTIVE_LIGHT_SOURCES: 'u_numActiveLightSources',
  ENV_MATRIX: 'u_envMatrix',
  ENV_RADIANCE: 'u_envRadiance',
  ENV_RADIANCE_SPLIT: 'u_envRadiance_texture, u_envRadiance_sampler',
  ENV_RADIANCE_SAMPLER2D: 'u_envRadiance',
  ENV_RADIANCE_SAMPLER2D_SPLIT: 'sampler2D(u_envRadiance_texture, u_envRadiance_sampler)',
  ENV_RADIANCE_MIPS: 'u_envRadianceMips',
  ENV_RADIANCE_SAMPLES: 'u_envRadianceSamples',
  ENV_IRRADIANCE: 'u_envIrradiance',
  ENV_IRRADIANCE_SPLIT: 'u_envIrradiance_texture, u_envIrradiance_sampler',
  ENV_IRRADIANCE_SAMPLER2D: 'u_envIrradiance',
  ENV_IRRADIANCE_SAMPLER2D_SPLIT: 'sampler2D(u_envIradiance_texture, u_envIrradiance_sampler)',
  TEX_SAMPLER_SAMPLER2D: 'tex_sampler',
  TEX_SAMPLER_SAMPLER2D_SPLIT: 'sampler2D(tex_texture, tex_sampler)',
  TEX_SAMPLER_SAMPLER2D_MSL: 'tex_sampler',
  TEX_SAMPLER_SIGNATURE: 'sampler2D tex_sampler',
  TEX_SAMPLER_SIGNATURE_SPLIT: 'texture2D tex_texture, sampler tex_sampler',
  TEX_SAMPLER_SIGNATURE_MSL: 'MetalTexture tex_sampler',
  ENV_LIGHT_INTENSITY: 'u_envLightIntensity',
  ENV_PREFILTER_MIP: 'u_envPrefilterMip',
  REFRACTION_TWO_SIDED: 'u_refractionTwoSided',
  ALBEDO_TABLE: 'u_albedoTable',
  ALBEDO_TABLE_SIZE: 'u_albedoTableSize',
  AMB_OCC_MAP: 'u_ambOccMap',
  AMB_OCC_GAIN: 'u_ambOccGain',
  SHADOW_MAP: 'u_shadowMap',
  SHADOW_MATRIX: 'u_shadowMatrix',
  VERTEX_DATA_INSTANCE: 'vd',
  LIGHT_DATA_INSTANCE: 'u_lightData',
  LIGHT_DATA_MAX_LIGHT_SOURCES: 'MAX_LIGHT_SOURCES',

  // Variable block names.
  VERTEX_INPUTS: 'VertexInputs', // Geometric inputs for the vertex stage.
  VERTEX_DATA: 'VertexData', // Connector block from vertex to pixel stage.
  PRIVATE_UNIFORMS: 'PrivateUniforms', // Uniforms set privately by the application.
  PUBLIC_UNIFORMS: 'PublicUniforms', // Uniforms visible in the UI and set by the user.
  LIGHT_DATA: 'LightData', // Uniform inputs for light sources.
  PIXEL_OUTPUTS: 'PixelOutputs', // Outputs from the main/pixel stage.

  // Variable names for lighting parameters.
  CLOSURE_DATA_TYPE: 'ClosureData',
  CLOSURE_DATA_ARG: 'closureData',
  DIR_N: 'N',
  DIR_L: 'L',
  DIR_V: 'V',
  WORLD_POSITION: 'P',
  OCCLUSION: 'occlusion',

  // Syntax for constructing ClosureData.
  CLOSURE_DATA_CONSTRUCTOR: 'ClosureData(closureType, L, V, N, P, occlusion)',

  // Attribute names.
  ATTR_TRANSPARENT: 'transparent',

  // User data names.
  USER_DATA_LIGHT_SHADERS: 'udls',
  USER_DATA_BINDING_CONTEXT: 'udbinding',
} as const

// Type descriptor for closure context data.
export const ClosureDataType = new TypeDesc('ClosureData', BaseType.NONE, Semantic.NONE, 1)

// Constant values.
export const VEC2_ZERO = Value.createValue(new Vector2(0, 0))
export const VEC2_ONE = Value.createValue(new Vector2(1, 1))
export const VEC3_ZERO = Value.createValue(new Vector3(0, 0, 0))
export const VEC3_ONE = Value.createValue(new Vector3(1, 1, 1))
