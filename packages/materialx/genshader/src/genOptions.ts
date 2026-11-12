// Ported from MaterialX 1.39.5: source/MaterialXGenShader/GenOptions.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/GenOptions.h

import { FilePath } from '@mtlx/format'

// Type of shader interface to be generated.
export enum ShaderInterfaceType {
  // Create a complete interface with uniforms for all editable inputs on
  // all nodes used by the shader, making it fully editable by value
  // without rebuilds. This is the default.
  SHADER_INTERFACE_COMPLETE,

  // Create a reduced interface with uniforms only for inputs declared in
  // the shader's nodedef interface.
  SHADER_INTERFACE_REDUCED,
}

// Method to use for specular environment lighting.
export enum HwSpecularEnvironmentMethod {
  SPECULAR_ENVIRONMENT_NONE,
  SPECULAR_ENVIRONMENT_FIS,
  SPECULAR_ENVIRONMENT_PREFILTER,
}

// Method to use for directional albedo evaluation.
export enum HwDirectionalAlbedoMethod {
  DIRECTIONAL_ALBEDO_ANALYTIC,
  DIRECTIONAL_ALBEDO_TABLE,
  DIRECTIONAL_ALBEDO_MONTE_CARLO,
}

// Method to use for transmission rendering.
export enum HwTransmissionRenderMethod {
  TRANSMISSION_REFRACTION,
  TRANSMISSION_OPACITY,
}

// Class holding options to configure shader generation.
export class GenOptions {
  // The type of shader interface to be generated.
  shaderInterfaceType: ShaderInterfaceType = ShaderInterfaceType.SHADER_INTERFACE_COMPLETE

  // If true the y-component of texture coordinates used for sampling file
  // textures is flipped before sampling.
  fileTextureVerticalFlip = false

  // An optional override for the target color space.
  targetColorSpaceOverride = ''

  // The target distance unit; shader fragments are generated to transform
  // input distance values to this unit.
  targetDistanceUnit = ''

  // Whether to include upstream dependencies for the element to generate
  // a shader for.
  addUpstreamDependencies = true

  // The standard library prefix applied to emitLibraryInclude calls.
  libraryPrefix = new FilePath('libraries')

  // Enable emitting colorspace transform code if a color management system
  // is defined.
  emitColorTransforms = true

  // Enable eliding constant nodes.
  elideConstantNodes = true

  // Enable replacing BSDF mix nodes with premultiplied add nodes.
  premultipliedBsdfAdd = false

  // Enable distributing layer operations over mix nodes.
  distributeLayerOverBsdfMix = false

  // Sets if transparency is needed or not for HW shaders.
  hwTransparency = false

  // The method to use for specular environment lighting for HW targets.
  hwSpecularEnvironmentMethod: HwSpecularEnvironmentMethod = HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_FIS

  // The method to use for directional albedo evaluation for HW targets.
  hwDirectionalAlbedoMethod: HwDirectionalAlbedoMethod = HwDirectionalAlbedoMethod.DIRECTIONAL_ALBEDO_ANALYTIC

  // The method to use for transmission rendering for HW targets.
  hwTransmissionRenderMethod: HwTransmissionRenderMethod = HwTransmissionRenderMethod.TRANSMISSION_REFRACTION

  // The number of iterations for Airy Fresnel reflection calculations.
  hwAiryFresnelIterations = 2

  // Enables an sRGB encoding for the color output on HW targets.
  hwSrgbEncodeOutput = false

  // Enables the writing of depth moments for HW targets.
  hwWriteDepthMoments = false

  // Enables shadow mapping for HW targets.
  hwShadowMap = false

  // Enables ambient occlusion rendering for HW targets.
  hwAmbientOcclusion = false

  // The maximum number of light sources that can be active at once.
  hwMaxActiveLightSources = 3

  // Whether to transform texture coordinates to normalize uv space when
  // UDIM images are bound.
  hwNormalizeUdimTexCoords = false

  // Enables the writing of a directional albedo table.
  hwWriteAlbedoTable = false

  // Enables the generation of a prefiltered environment map.
  hwWriteEnvPrefilter = false

  // Calculate fallback bitangents from existing normals and tangents
  // inside the bitangent node.
  hwImplicitBitangents = true

  // Enables OSL conversion of the surfaceshader struct to closure color.
  oslImplicitSurfaceShaderConversion = true

  // Enables an OSL node that adds the root's output to the Ci variable.
  oslConnectCiWrapper = false

  copy(): GenOptions {
    const res = new GenOptions()
    Object.assign(res, this)
    res.libraryPrefix = this.libraryPrefix.copy()
    return res
  }
}
