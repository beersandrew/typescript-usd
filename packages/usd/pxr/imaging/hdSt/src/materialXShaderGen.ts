// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialXShaderGen.cpp,
//  pxr/imaging/hdSt/materialXShaderGen.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/materialXShaderGen.{h,cpp} (OpenUSD 26.11.1),
// built against the vendored MaterialX 1.39.5 generators (@mtlx/genglsl,
// packages/materialx/PROVENANCE.md). MTLX_COMBINED_VERSION is 13905: the
// 1.39 branches of the version conditionals are the ones ported.
//
// Divergences (each also noted at its site):
// - The C++ class template HdStMaterialXShaderGen<Base> and
//   HdStMaterialXShaderGenBaseGlsl<Base> are one TypeScript mixin over a
//   GlslShaderGenerator subclass (materialXShaderGen.h:29-129), instantiated
//   for GlslShaderGenerator and VkShaderGenerator as upstream does
//   (materialXShaderGen.cpp:1064, :1106). Members upstream marks protected
//   are public here (TypeScript cannot export protected members of a class
//   expression).
// - HdStMaterialXShaderGenMsl (PXR_METAL_SUPPORT_ENABLED,
//   materialXShaderGen.cpp:1116-1358) is not ported: it generates Metal
//   Shading Language, and this repository's HgiWebGPU consumes GLSL through
//   its GLSL-to-WGSL translator.
// - mx::StringMap is std::unordered_map; its iteration order (the order of
//   the "attributes" entries of the glslfx header) is libc++'s hash order.
//   Here a Map iterates in insertion order. With one primvar the output is
//   the same.

import { EMPTY_STRING, FloatFormat, ScopedFloatFormatting, type Element } from '@mtlx/core'
import {
  BaseType,
  GenContext,
  HwDirectionalAlbedoMethod,
  Shader,
  ShaderGenerator,
  ShaderGraph,
  ShaderNode,
  ShaderNodeClassification,
  ShaderNodeImpl,
  ShaderPort,
  ShaderStage,
  Stage,
  Syntax,
  Type,
  TypeDesc,
  TypeSystem,
  VariableBlock,
  addStageUniform,
} from '@mtlx/genshader'
import { HW, HwSurfaceNode } from '@mtlx/genhw'
import { GlslShaderGenerator, VkShaderGenerator } from '@mtlx/genglsl'
import { TfStringEndsWith, TfStringStartsWith } from 'typescript-usd/tf'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'
import { HdStMaterialTagTokens } from './tokens.ts'

/** HdSt_MxShaderGenInfo (materialXFilter.h:21-36): MaterialX-Hydra
 *  counterparts and other Hydra specific information. */
export class HdSt_MxShaderGenInfo {
  textureNames: string[] = []
  primvarMap: Map<string, string> = new Map()
  primvarDefaultValueMap: Map<string, string> = new Map()
  defaultTexcoordName = 'st'
  materialTag: string = HdStMaterialTagTokens.defaultMaterialTag.toString()
  bindlessTexturesEnabled = false
}

/** materialXShaderGen.cpp:28-48 */
const MxHdWorldSpaceVectors = `
    // Calculate the worldspace position and normal vectors
    vec3 positionWorld = vec3(HdGet_worldToViewInverseMatrix() * Peye);
    vec3 normalWorld = vec3(HdGet_worldToViewInverseMatrix() * vec4(Neye, 0.0));

    // Calculate the worldspace tangent vector 
#ifdef HD_HAS_%s
    mat3 TBN = ComputeTBNMatrix(positionWorld, normalWorld, HdGet_%s());
    vec3 tangentWorld = TBN[0];
    vec3 bitangentWorld = TBN[1];
#else 
    vec3 bitangentWorld = vec3(0, 1, 0);
    vec3 tangentWorld = cross(normalWorld, bitangentWorld);
    if (length(tangentWorld) < M_FLOAT_EPS) {
        bitangentWorld = vec3(1, 0, 0);
        tangentWorld = cross(normalWorld, bitangentWorld);
    }
#endif

`

/** materialXShaderGen.cpp:50-136 */
const MxHdLightString = `#if NUM_LIGHTS > 0
    for (int i = 0; i < GetLightCount(); ++i) {
        LightSource light = GetLightSource(i);
        float intensityAdj = 1.0;

        // Save the indirect light transformation
        if (light.isIndirectLight) {
            hdTransformationMatrix = light.worldToLightTransform;
            // Note: in Storm, diffuse = lightColor * intensity;
            u_envLightIntensity = max( max(light.diffuse.r, light.diffuse.g), 
                                   light.diffuse.b);
        }
        // Save the direct light data
        else {
            // Light Type and Position/Direction
            // Distant lights have Hydra attenuation = vec3(0.0, 0.0, 0.0)
            if (light.attenuation.x == 0.0 && light.attenuation.y == 0.0 && 
                light.attenuation.z == 0.0) {
                $lightData[u_numActiveLightSources].type = 2; // directional

                // Direction (Hydra position in ViewSpace)
                $lightData[u_numActiveLightSources].direction = 
                    (HdGet_worldToViewInverseMatrix() * -light.position).xyz;
            }
            // Spot lights should have an authored spot cutoff < 180 
            else if (light.spotCutoffAndFalloff.x < 180.0) {
                // We pre-apply the spot light attenuation and treat this as 
                // a point light.
                $lightData[u_numActiveLightSources].type = 1; // point

                // Position (Hydra position in ViewSpace)
                $lightData[u_numActiveLightSources].position = 
                    (HdGet_worldToViewInverseMatrix() * light.position).xyz;

                // The only difference between spot and point lights is the 
                // attenuation calculation. They differ a lot between 
                // MaterialX and USD. This is the USD calculation that we 
                // pre-apply to the intensity instead of using MaterialX's 
                // spot light calculation. 
                vec3 l = (light.position.w == 0.0)
                            ? normalize(light.position.xyz)
                            : normalize(light.position - Peye).xyz;
                intensityAdj = lightSpotAttenuation(l, i);
                intensityAdj *= lightDistanceAttenuation(Peye, i);
            }
            // Treat all other lights as Point lights
            else {
                $lightData[u_numActiveLightSources].type = 1; // point

                // Position (Hydra position in ViewSpace)
                $lightData[u_numActiveLightSources].position = 
                    (HdGet_worldToViewInverseMatrix() * light.position).xyz;
                
                // Pre-apply Attenuation to the intensity instead of using 
                // MaterialX's attenuation calculation. 
                intensityAdj = lightDistanceAttenuation(Peye, i);
            }

            // Color and Intensity 
            // Note: in Storm, diffuse = lightColor * intensity;
            float intensity = max( max(light.diffuse.r, light.diffuse.g), 
                                   light.diffuse.b);
            vec3 lightColor = (intensity == 0.0) 
                ? light.diffuse.rgb : light.diffuse.rgb/intensity;
            $lightData[u_numActiveLightSources].color = lightColor;
            $lightData[u_numActiveLightSources].intensity = intensity * intensityAdj;

            // Attenuation 
            // We use MaterialX's constant attenuation (decay_rate of 0.0) 
            // because we are pre-applying the USD calculation for light 
            // distance Attenuation when applicable.
            $lightData[u_numActiveLightSources].decay_rate = 0.0;

            // ShadowOcclusion value
            #if USE_SHADOWS
                u_lightData[u_numActiveLightSources].shadowOcclusion = 
                    light.hasShadow ? shadowing(i, Peye) : 1.0;
            #else 
                u_lightData[u_numActiveLightSources].shadowOcclusion = 1.0;
            #endif

            u_numActiveLightSources++;
        }
    }
#endif
`

/** materialXShaderGen.cpp:138-145 */
const MxHdLatLongLookupCubemapGlsl = `
vec3 mx_latlong_map_lookup(vec3 dir, mat4 transform, float lod, samplerCube envSampler)
{
    vec3 envDir = normalize((transform * vec4(dir,0.0)).xyz);
    return textureLod(envSampler, envDir, lod).rgb;
}
`

/** TfStringPrintf for the %s-only formats this file uses. */
function _Printf(format: string, ...args: string[]): string {
  let i = 0
  return format.replace(/%s/g, () => args[i++] ?? '')
}

/** materialXShaderGen.cpp:147-164 */
function _IsHardcodedPublicUniform(varType: TypeDesc): boolean {
  // Most major types of public uniforms are set through
  // HdSt_MaterialParamVector in HdStMaterialXFilter's
  // _AddMaterialXParams function, the rest are hardcoded
  // in the shader
  if (varType.getBaseType() !== BaseType.FLOAT &&
      varType.getBaseType() !== BaseType.INTEGER &&
      varType.getBaseType() !== BaseType.BOOLEAN) {
    return true
  }
  if (varType.getSize() < 1 || varType.getSize() > 4) {
    return true
  }
  return false
}

/** materialXShaderGen.cpp:166-175 */
function _GetSamplerName(textureName: string): string {
  // Make sure we don't have double '_' in the HdGet call.
  let samplerName = textureName
  if (TfStringStartsWith(samplerName, '_')) {
    samplerName = samplerName.slice(1)
  }
  return samplerName
}

/** materialXShaderGen.cpp:197-216. Map a MaterialX type name to a type name
 *  understood by HioGlslfxConfig. Returns an empty string for unsupported
 *  types. */
const _glslfxPrimvarTypeMap = new Map<string, string>([
  ['float', 'float'],
  ['integer', 'int'],
  ['boolean', 'int'],
  ['vector2', 'vec2'],
  ['vector3', 'vec3'],
  ['color3', 'vec3'],
  ['vector4', 'vec4'],
  ['color4', 'vec4'],
])
function _GetGlslfxPrimvarTypeName(mxTypeName: string): string {
  return _glslfxPrimvarTypeMap.get(mxTypeName) ?? ''
}

/** materialXShaderGen.cpp:429-457 */
function _GetTexcoordName(vertexDataBlock: VariableBlock, defaultTexcoordName: string): string {
  // Texcoords could come from either a texcoord or a geomprop value node.
  // We prioritize using the texcoord name over the geomprop.

  // Cycle through the vertexDataBlock to find the texcoord name.
  let texcoordName = defaultTexcoordName
  for (let i = 0; i < vertexDataBlock.size(); ++i) {
    const variable = vertexDataBlock.getItem(i)
    const mxVariableName = variable.getVariable()

    // If we have a texcoord node, use the default texcoord name.
    if (mxVariableName.startsWith(HW.T_TEXCOORD)) {
      return defaultTexcoordName
    }
    // Use the geomprop name if this is a vec2 geomprop value node
    if (mxVariableName.startsWith(HW.T_IN_GEOMPROP) &&
        variable.getType().equals(Type.VECTOR2)) {
      texcoordName = mxVariableName.substring(HW.T_IN_GEOMPROP.length + 1)
    }
  }
  return texcoordName
}

/** Mx variables that need to be initialized with Hd Values
 *  (materialXShaderGen.cpp:701-709). */
const MxHdVariables = new Set<string>([
  HW.T_VIEW_POSITION,
  HW.T_ENV_IRRADIANCE,   // Irradiance texture
  HW.T_ENV_RADIANCE,     // Environment map OR prefilter texture
  HW.T_ENV_RADIANCE_MIPS,
  HW.T_ENV_RADIANCE_SAMPLES,
  HW.T_ALBEDO_TABLE,     // BRDF texture
])

/** The members HdStMaterialXSurfaceNodeGen* reach on the generator. */
interface _SurfaceNodeNotified {
  setEmittingSurfaceNode(emittingSurfaceNode: boolean): void
}

/** HdStMaterialXShaderGen<Base> (materialXShaderGen.h:29-111,
 *  materialXShaderGen.cpp:177-923) together with
 *  HdStMaterialXShaderGenBaseGlsl<Base> (materialXShaderGen.h:114-129,
 *  materialXShaderGen.cpp:925-1037). */
/** The members of the mixin the concrete generators and the surface node
 *  reach; the mixin's type is declared through it so the exported classes
 *  do not expose an anonymous base class. */
interface HdStMaterialXShaderGenMembers extends _SurfaceNodeNotified {
  _initMxHdInfo(mxHdInfo: HdSt_MxShaderGenInfo): void
}
type HdStMaterialXShaderGenConstructor =
  (abstract new (typeSystem: TypeSystem) => GlslShaderGenerator & HdStMaterialXShaderGenMembers) &
  Omit<typeof GlslShaderGenerator, 'prototype'>

function HdStMaterialXShaderGenBaseGlsl(Base: typeof GlslShaderGenerator): HdStMaterialXShaderGenConstructor {
  // Base is GlslShaderGenerator or VkShaderGenerator (which derives from it
  // and has the same constructor signature).
  abstract class HdStMaterialXShaderGen extends Base implements _SurfaceNodeNotified {
    // Store MaterialX and Hydra counterparts and other Hydra specific info
    // to generate an appropriate glslfx header and properly initialize
    // MaterialX values.
    _mxHdTextureNames: string[] = []
    _mxHdPrimvarMap: Map<string, string> = new Map()
    _mxHdPrimvarDefaultValueMap: Map<string, string> = new Map()
    _defaultTexcoordName = ''
    _materialTag = ''
    _bindlessTexturesEnabled = false

    // Helper to catch code for the SurfaceNode
    _emittingSurfaceNode = false

    /** Upstream's constructor takes the HdSt_MxShaderGenInfo
     *  (materialXShaderGen.cpp:177-195); here the subclasses call this once
     *  Base's constructor has run. */
    _initMxHdInfo(mxHdInfo: HdSt_MxShaderGenInfo): void {
      this._mxHdTextureNames = [...mxHdInfo.textureNames]
      this._mxHdPrimvarMap = new Map(mxHdInfo.primvarMap)
      this._mxHdPrimvarDefaultValueMap = new Map(mxHdInfo.primvarDefaultValueMap)
      this._materialTag = mxHdInfo.materialTag
      this._bindlessTexturesEnabled = mxHdInfo.bindlessTexturesEnabled
      this._emittingSurfaceNode = false
      this._defaultTexcoordName =
        (mxHdInfo.defaultTexcoordName === EMPTY_STRING)
          ? 'st' : mxHdInfo.defaultTexcoordName
    }

    /** Helper to catch when we start/end emitting code for the SurfaceNode */
    setEmittingSurfaceNode(emittingSurfaceNode: boolean): void {
      this._emittingSurfaceNode = emittingSurfaceNode
    }

    /** materialXShaderGen.cpp:217-290 */
    _emitGlslfxHeader(_mxContext: GenContext, mxStage: ShaderStage): void {
      // Glslfx version and configuration
      this.emitLine('-- glslfx version 0.1', mxStage, false)
      super.emitLineBreak(mxStage)
      super.emitComment('File Generated with HdStMaterialXShaderGen.', mxStage)
      super.emitLineBreak(mxStage)
      super.emitString('#import $TOOLS/hdSt/shaders/surfaceHelpers.glslfx\n', mxStage)
      super.emitLineBreak(mxStage)
      super.emitString(
        '-- configuration\n' +
        '{\n', mxStage)

      // insert materialTag metadata
      {
        super.emitString('    "metadata": {\n', mxStage)
        let line = ''
        line += '        "materialTag": "' + this._materialTag + '"\n'
        super.emitString(line, mxStage)
        super.emitString('    }, \n', mxStage)
      }

      // insert primvar information if needed
      if (this._mxHdPrimvarMap.size !== 0) {
        super.emitString('    "attributes": {\n', mxStage)
        let line = ''
        let i = 0
        for (const [primvarName, primvarType] of this._mxHdPrimvarMap) {
          const type = _GetGlslfxPrimvarTypeName(primvarType)
          if (type === '') {
            TF_WARN(`MaterialX geomprop '${primvarName}' has unknown type '${primvarType}'`)
          }

          line += '        "' + primvarName + '": {\n'
          line += '            "type": "' + type + '"\n'
          line += '        }'
          line += (i < this._mxHdPrimvarMap.size - 1) ? ',\n' : '\n'
          i++
        }
        super.emitString(line, mxStage)
        super.emitString('    }, \n', mxStage)
      }
      // insert texture information if needed
      if (this._mxHdTextureNames.length !== 0) {
        super.emitString('    "textures": {\n', mxStage)
        let line = ''
        let i = 0
        for (const textureName of this._mxHdTextureNames) {
          line += '        "' + textureName + '": {\n        }'
          line += (i < this._mxHdTextureNames.length - 1) ? ',\n' : '\n'
          i++
        }
        super.emitString(line, mxStage)
        super.emitString('    }, \n', mxStage)
      }
      super.emitString(
        '    "techniques": {\n' +
        '        "default": {\n' +
        '            "surfaceShader": { \n' +
        '                "source": [ "SurfaceHelpers.TangentSpace",\n' +
        '                            "MaterialX.Surface" ]\n' +
        '            }\n' +
        '        }\n' +
        '    }\n' +
        '}\n\n', mxStage)
      this.emitLine('-- glsl MaterialX.Surface', mxStage, false)
      super.emitLineBreak(mxStage)
      super.emitLineBreak(mxStage)
    }

    /** materialXShaderGen.cpp:292-427. Similar to
     *  GlslShaderGenerator::emitPixelStage() with alterations and additions
     *  to match Pxr's codeGen. */
    _emitMxSurfaceShader(mxGraph: ShaderGraph, mxContext: GenContext, mxStage: ShaderStage): void {
      const C = ShaderNodeClassification
      // Add surfaceShader function
      super.setFunctionName('surfaceShader', mxStage)
      this.emitLine('vec4 surfaceShader(' +
                    'vec4 Peye, vec3 Neye, ' +
                    'vec4 color, vec4 patchCoord)', mxStage, false)
      super.emitScopeBegin(mxStage)

      super.emitComment('Initialize MaterialX Variables', mxStage)
      this.emitLine('mxInit(Peye, Neye)', mxStage)

      const outputSocket = mxGraph.getOutputSocket()!
      if (mxGraph.hasClassification(C.CLOSURE) &&
          !mxGraph.hasClassification(C.SHADER)) {
        // Handle the case where the mxGraph is a direct closure.
        // We don't support rendering closures without attaching
        // to a surface shader, so just output black.
        this.emitLine(outputSocket.getVariable() + ' = vec4(0.0, 0.0, 0.0, 1.0)', mxStage)
      } else if (mxContext.getOptions().hwWriteDepthMoments) {
        this.emitLine(outputSocket.getVariable() +
                      ' = vec4(mx_compute_depth_moments(), 0.0, 1.0)', mxStage)
      } else if (mxContext.getOptions().hwWriteAlbedoTable) {
        this.emitLine(outputSocket.getVariable() +
                      ' = vec4(mx_ggx_directional_albedo_generate_table(), 0.0, 1.0)',
                      mxStage)
      } else {
        // Surface shaders need special handling.
        if (mxGraph.hasClassification(C.SHADER | C.SURFACE)) {
          // Emit all texturing nodes. These are inputs to any
          // closure/shader nodes and need to be emitted first.
          super.emitFunctionCalls(mxGraph, mxContext, mxStage, C.TEXTURE)
          // Emit function calls for "root" closure/shader nodes.
          // These will internally emit function calls for any dependent
          // closure nodes upstream.
          for (const socket of mxGraph.getOutputSockets()) {
            if (socket.getConnection()) {
              const upstream = socket.getConnection()!.getNode()!
              if (upstream.getParent() === mxGraph &&
                  (upstream.hasClassification(C.CLOSURE) ||
                   upstream.hasClassification(C.SHADER))) {
                super.emitFunctionCall(upstream, mxContext, mxStage)
              }
            }
          }
        } else {
          // No surface shader graph so just generate all
          // function calls in order.
          super.emitFunctionCalls(mxGraph, mxContext, mxStage)
        }

        // Emit final output
        const finalOutputReturn = 'vec4 mxOut = '
        const outputConnection = outputSocket.getConnection()
        if (outputConnection) {
          let finalOutput = outputConnection.getVariable()
          // (MTLX_COMBINED_VERSION < 13900 channels handling is not
          // compiled for MaterialX 1.39.)
          if (mxGraph.hasClassification(C.SURFACE)) {
            if (mxContext.getOptions().hwTransparency) {
              this.emitLine('float outAlpha = clamp(1.0 - dot(' + finalOutput +
                            '.transparency, vec3(0.3333)), 0.0, 1.0)', mxStage)
              this.emitLine(finalOutputReturn + 'vec4(' +
                            finalOutput + '.color, outAlpha)', mxStage)
              this.emitLine('if (outAlpha < ' + HW.T_ALPHA_THRESHOLD + ')',
                            mxStage, false)
              super.emitScopeBegin(mxStage)
              this.emitLine('discard', mxStage)
              super.emitScopeEnd(mxStage)
            } else {
              this.emitLine(finalOutputReturn +
                            'vec4(' + finalOutput + '.color, 1.0)', mxStage)
            }
          } else {
            if (!HdStMaterialXHelpers.getMxTypeDesc(outputSocket).isFloat4()) {
              // toVec4 rewrites its string argument in place upstream.
              finalOutput = this.toVec4(outputSocket.getType(), finalOutput)
            }
            this.emitLine(finalOutputReturn +
                          'vec4(' + finalOutput + '.color, 1.0)', mxStage)
          }
        } else {
          const value = outputSocket.getValue()
          const outputValue = value
            ? this._syntax.getValueOfType(outputSocket.getType(), value)
            : this._syntax.getDefaultValue(outputSocket.getType())
          if (!HdStMaterialXHelpers.getMxTypeDesc(outputSocket).isFloat4()) {
            let finalOutput = outputSocket.getVariable() + '_tmp'
            this.emitLine(this._syntax.getTypeName(outputSocket.getType()) +
                          ' ' + finalOutput + ' = ' + outputValue, mxStage)
            finalOutput = this.toVec4(outputSocket.getType(), finalOutput)
            this.emitLine(finalOutputReturn + finalOutput, mxStage)
          } else {
            this.emitLine(finalOutputReturn + outputValue, mxStage)
          }
        }

        // Emit color overrides (mainly for selection highlighting)
        this.emitLine('mxOut = ApplyColorOverrides(mxOut)', mxStage)
      }
      this.emitLine('return mxOut', mxStage)

      // End surfaceShader function
      super.emitScopeEnd(mxStage)
      super.emitLineBreak(mxStage)
    }

    /** materialXShaderGen.cpp:458-556 */
    _emitMxInitFunction(vertexData: VariableBlock, mxStage: ShaderStage): void {
      super.setFunctionName('mxInit', mxStage)
      this.emitLine('void mxInit(vec4 Peye, vec3 Neye)', mxStage, false)
      super.emitScopeBegin(mxStage)

      super.emitComment('Convert HdData to MxData', mxStage)

      // Initialize the position of the view in worldspace
      if (mxStage.getUniformBlock(HW.PRIVATE_UNIFORMS).find(HW.T_VIEW_POSITION)) {
        this.emitLine('u_viewPosition = vec3(HdGet_worldToViewInverseMatrix()' +
                      ' * vec4(0.0, 0.0, 0.0, 1.0))', mxStage)
      }

      // Calculate the worldspace position, normal and tangent vectors
      const texcoordName = _GetTexcoordName(vertexData, this._defaultTexcoordName)
      super.emitString(_Printf(MxHdWorldSpaceVectors, texcoordName, texcoordName), mxStage)

      // Add the vd declaration that translates HdVertexData -> MxVertexData
      if (!vertexData.empty()) {
        const mxVertexDataName = 'mx' + vertexData.getName()
        this._emitMxVertexDataDeclarations(vertexData, mxVertexDataName,
          vertexData.getInstance(), Syntax.COMMA, mxStage)
        super.emitLineBreak(mxStage)
      }

      // Initialize MaterialX parameters with HdGet_ equivalents
      super.emitComment('Initialize Material Parameters', mxStage)
      const paramsBlock = mxStage.getUniformBlock(HW.PUBLIC_UNIFORMS)
      for (let i = 0; i < paramsBlock.size(); ++i) {
        const variable = paramsBlock.getItem(i)
        const variableType = HdStMaterialXHelpers.getMxTypeDesc(variable)
        if (!_IsHardcodedPublicUniform(variableType)) {
          // Make sure we don't have double '_' in the HdGet call.
          let variableName = variable.getVariable()
          if (TfStringStartsWith(variableName, '_')) {
            variableName = variableName.slice(1)
          }
          this.emitLine(variable.getVariable() + ' = HdGet_' +
                        variableName + '()', mxStage)
        }
      }
      super.emitLineBreak(mxStage)

      // Initialize the Indirect Light Textures
      // Note: only need to initialize textures when bindlessTextures are
      // enabled, when bindlessTextures are not enabled, mappings are defined
      // in HdStMaterialXShaderGen*::_EmitMxFunctions
      super.emitComment('Initialize Indirect Light Textures and values', mxStage)
      if (this._bindlessTexturesEnabled) {
        this.emitLine('#ifdef HD_HAS_domeLightIrradiance', mxStage, false)
        this.emitLine('u_envIrradiance = HdGetSampler_domeLightIrradiance()', mxStage)
        this.emitLine('u_envRadiance = HdGetSampler_domeLightPrefilter()', mxStage)
        this.emitLine('#else', mxStage, false)
        this.emitLine('u_envIrradiance = HdGetSampler_domeLightFallback()', mxStage)
        this.emitLine('u_envRadiance = HdGetSampler_domeLightFallback()', mxStage)
        this.emitLine('#endif', mxStage, false)
      }
      this.emitLine('u_envRadianceMips = textureQueryLevels(u_envRadiance)', mxStage)
      super.emitLineBreak(mxStage)

      // Initialize MaterialX Texture samplers with HdGetSampler equivalents
      if (this._bindlessTexturesEnabled && this._mxHdTextureNames.length !== 0) {
        super.emitComment('Initialize Material Textures', mxStage)
        for (const textureName of this._mxHdTextureNames) {
          if (textureName === 'domeLightFallback') {
            continue
          }
          this.emitLine(_Printf('%s = HdGetSampler_%s()',
            textureName, _GetSamplerName(textureName)), mxStage)
        }
        super.emitLineBreak(mxStage)
      }

      // Gather Direct light data from Hydra and assign the Hydra
      // transformation matrix to the environment map matrix (u_envMatrix) to
      // account for the domeLight's transform.
      // Note: We are ignoring default MaterialX initialization of u_envMatrix
      // as a 180 rotation about the Y-axis (Y-up).
      this.emitLine('mat4 hdTransformationMatrix = mat4(1.0)', mxStage)
      super.emitString(MxHdLightString, mxStage)
      this.emitLine('u_envMatrix = hdTransformationMatrix', mxStage)

      super.emitScopeEnd(mxStage)
      super.emitLineBreak(mxStage)
    }

    /** materialXShaderGen.cpp:558-604. Generates the Mx VertexData that is
     *  needed for the Mx Shader. */
    _emitMxVertexDataDeclarations(
      block: VariableBlock,
      mxVertexDataName: string,
      mxVertexDataVariable: string,
      separator: string,
      mxStage: ShaderStage,
    ): void {
      // vd = mxVertexData
      let line = mxVertexDataVariable + ' = ' + mxVertexDataName

      const targetShadingLanguage = this.getTarget()

      // add beginning ( or {
      if (targetShadingLanguage === GlslShaderGenerator.TARGET) {
        line += '('
      } else {
        TF_CODING_ERROR(`MaterialX Shader Generator doesn't support ${targetShadingLanguage}`)
      }

      for (let i = 0; i < block.size(); ++i) {
        const lineSeparator = (i === block.size() - 1) ? EMPTY_STRING : separator
        line += this._emitMxVertexDataLine(block.getItem(i), lineSeparator)
      }

      // add ending ) or }
      if (targetShadingLanguage === GlslShaderGenerator.TARGET) {
        line += ')'
      }

      this.emitLine(line, mxStage)
    }

    /** materialXShaderGen.cpp:606-690 */
    _emitMxVertexDataLine(variable: ShaderPort, separator: string): string {
      // Connect the mxVertexData variable with the appropriate pxr variable
      // making sure to convert the Hd data (viewSpace) to Mx data
      // (worldSpace)
      let hdVariableDef: string
      const mxVariableName = variable.getVariable()

      if (mxVariableName === HW.T_POSITION_WORLD ||
          mxVariableName === HW.T_NORMAL_WORLD ||
          mxVariableName === HW.T_TANGENT_WORLD ||
          mxVariableName === HW.T_BITANGENT_WORLD) {
        // Calculated in MxHdWorldSpaceVectors
        hdVariableDef = mxVariableName.substring(1) + separator
      } else if (mxVariableName === HW.T_POSITION_OBJECT) {
        hdVariableDef = 'HdGet_points()' + separator
      } else if (mxVariableName === HW.T_NORMAL_OBJECT) {
        hdVariableDef = 'HdGet_normals()' + separator
      } else if (mxVariableName.startsWith(HW.T_TEXCOORD)) {
        // Wrap initialization inside #ifdef in case the object does not
        // have the st primvar
        hdVariableDef = _Printf('\n' +
          '    #ifdef HD_HAS_%s\n' +
          '        HdGet_%s()%s\n' +
          '    #else\n' +
          '        %s(0.0)%s\n' +
          '    #endif\n        ',
          this._defaultTexcoordName, this._defaultTexcoordName,
          separator,
          this._syntax.getTypeName(variable.getType()),
          separator)
      } else if (mxVariableName.startsWith(HW.T_IN_GEOMPROP)) {
        // Wrap initialization inside #ifdef in case the object does not
        // have the geomprop primvar
        // Note: variable name format: 'T_IN_GEOMPROP_geomPropName';
        const geompropName = mxVariableName.substring(HW.T_IN_GEOMPROP.length + 1)

        // Get the Default Value for the gromprop
        let defaultValueString = this._syntax.getDefaultValue(variable.getType())
        const defaultValue = this._mxHdPrimvarDefaultValueMap.get(geompropName)
        if (defaultValue !== undefined) {
          if (defaultValue !== '') {
            defaultValueString =
              this._syntax.getTypeName(variable.getType()) + '(' + defaultValue + ')'
          }
        }
        hdVariableDef = _Printf('\n' +
          '    #ifdef HD_HAS_%s\n' +
          '        HdGet_%s()%s\n' +
          '    #else\n' +
          '        %s%s\n' +
          '    #endif\n        ',
          geompropName, geompropName,
          separator,
          defaultValueString,
          separator)
      } else {
        const value = variable.getValue()
        const valueStr = value
          ? this._syntax.getValueOfType(variable.getType(), value, true)
          : this._syntax.getDefaultValue(variable.getType(), true)
        hdVariableDef = valueStr === '' ? EMPTY_STRING : valueStr + separator
      }

      return hdVariableDef === '' ? EMPTY_STRING : hdVariableDef
    }

    /** materialXShaderGen.cpp:692-742. Overriding the MaterialX function to
     *  make sure we initialize some Mx variables with the appropriate Hd
     *  Value. */
    override emitVariableDeclarations(
      block: VariableBlock,
      qualifier: string,
      separator: string,
      context: GenContext,
      stage: ShaderStage,
      assignValue = true,
    ): void {
      // Most public uniforms are set from outside the shader
      const isPublicUniform = block.getName() === HW.PUBLIC_UNIFORMS

      for (let i = 0; i < block.size(); ++i) {
        super.emitLineBegin(stage)
        const variable = block.getItem(i)
        const varType = HdStMaterialXHelpers.getMxTypeDesc(variable)

        // If bindlessTextures are not enabled the Mx Smpler names are mapped
        // to the Hydra equivalents in HdStMaterialXShaderGen*::_EmitMxFunctions
        if (!this._bindlessTexturesEnabled &&
            HdStMaterialXHelpers.mxTypeDescIsFilename(varType)) {
          continue
        }

        // Only declare the variables that we need to initialize with Hd Data
        if ((isPublicUniform && !_IsHardcodedPublicUniform(varType)) ||
            MxHdVariables.has(variable.getName())) {
          super.emitVariableDeclaration(variable, EMPTY_STRING,
                                        context, stage, false /* assignValue */)
        } else {
          // Otherwise assign the value from MaterialX
          super.emitVariableDeclaration(variable, qualifier,
                                        context, stage, assignValue)
        }
        super.emitString(separator, stage)
        super.emitLineEnd(stage, false)
      }
    }

    /** materialXShaderGen.cpp:744-763. Overriding this function to catch and
     *  adjust SurfaceNode code. */
    override emitLine(str: string, stage: ShaderStage, semicolon = true): void {
      super.emitLine(str, stage, semicolon)

      // When emitting the Light loop code for the Surface node, the variable
      // 'occlusion' represents shadow occlusion. We don't use MaterialX's
      // shadow implementation (hwShadowMap is false). Instead, use our own
      // per-light occlusion value calculated in mxInit() and stored in
      // lightData.
      if (this._emittingSurfaceNode &&
          TfStringEndsWith(str, 'L = lightShader.direction')) {
        this.emitLine(
          'occlusion = u_lightData[activeLightIndex].shadowOcclusion', stage)
      }
    }

    /** materialXShaderGen.cpp:765-814 */
    _emitConstantsUniformsAndTypeDefs(
      mxContext: GenContext,
      mxStage: ShaderStage,
      constQualifier: string,
    ): void {
      // Add global constants and type definitions
      this.emitLine('#if NUM_LIGHTS > 0', mxStage, false)
      this.emitLine('#define MAX_LIGHT_SOURCES NUM_LIGHTS', mxStage, false)
      this.emitLine('#else', mxStage, false)
      this.emitLine('#define MAX_LIGHT_SOURCES 1', mxStage, false)
      this.emitLine('#endif', mxStage, false)
      this.emitLine('#define DIRECTIONAL_ALBEDO_METHOD ' +
                    String(Math.trunc(mxContext.getOptions().hwDirectionalAlbedoMethod)),
                    mxStage, false)

      // (MTLX_COMBINED_VERSION >= 13905)
      // Define Airy Fresnel iterations
      this.emitLine('#define AIRY_FRESNEL_ITERATIONS ' +
                    String(mxContext.getOptions().hwAiryFresnelIterations),
                    mxStage, false)

      super.emitLineBreak(mxStage)

      // Add all constants and ensure that values are initialized
      const constants = mxStage.getConstantBlock()
      if (!constants.empty()) {
        this.emitVariableDeclarations(constants, constQualifier,
                                      Syntax.SEMICOLON,
                                      mxContext, mxStage, true /* assignValue */)
        super.emitLineBreak(mxStage)
      }

      // Add all uniforms
      for (const uniforms of mxStage.getUniformBlocks().values()) {
        // Skip light uniforms as they are handled separately
        if (!uniforms.empty() && uniforms.getName() !== HW.LIGHT_DATA) {
          super.emitComment('Uniform block: ' + uniforms.getName(), mxStage)
          this.emitVariableDeclarations(uniforms, EMPTY_STRING,
                                        Syntax.SEMICOLON, mxContext,
                                        mxStage, true /* assignValue */)
          super.emitLineBreak(mxStage)
        }
      }
    }

    /** materialXShaderGen.cpp:816-919 */
    _emitDataStructsAndFunctionDefinitions(
      mxGraph: ShaderGraph,
      mxContext: GenContext,
      mxStage: ShaderStage,
      tokenSubstitutions: Map<string, string>,
    ): void {
      const C = ShaderNodeClassification
      const lighting =
        mxGraph.hasClassification(C.SHADER | C.SURFACE) ||
        mxGraph.hasClassification(C.BSDF)
      const shadowing =
        (lighting && mxContext.getOptions().hwShadowMap) ||
        mxContext.getOptions().hwWriteDepthMoments

      // Add light data block if needed
      if (lighting) {
        const lightData = mxStage.getUniformBlock(HW.LIGHT_DATA)
        this.emitLine('struct ' + lightData.getName(), mxStage, false)
        super.emitScopeBegin(mxStage)
        this.emitVariableDeclarations(lightData, EMPTY_STRING,
                                      Syntax.SEMICOLON,
                                      mxContext, mxStage, false /* assignValue */)
        super.emitScopeEnd(mxStage, true)
        super.emitLineBreak(mxStage)
        this.emitLine(lightData.getName() + ' ' +
                      lightData.getInstance() + '[MAX_LIGHT_SOURCES]', mxStage)
        super.emitLineBreak(mxStage)
        super.emitLineBreak(mxStage)
      }

      // Add vertex data struct and the mxInit function which initializes mx
      // values with the Hd equivalents
      const vertexData = mxStage.getInputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        // add Mx VertexData
        super.emitComment("MaterialX's VertexData", mxStage)
        const mxVertexDataName = 'mx' + vertexData.getName()
        this.emitLine('struct ' + mxVertexDataName, mxStage, false)
        super.emitScopeBegin(mxStage)
        this.emitVariableDeclarations(vertexData, EMPTY_STRING,
                                      Syntax.SEMICOLON,
                                      mxContext, mxStage, false /* assignValue */)
        super.emitScopeEnd(mxStage, false, false)
        super.emitString(Syntax.SEMICOLON, mxStage)
        super.emitLineBreak(mxStage)

        // Add the vd declaration
        this.emitLine(mxVertexDataName + ' ' + vertexData.getInstance(), mxStage)
        super.emitLineBreak(mxStage)
        super.emitLineBreak(mxStage)
      }

      // add the mxInit function to convert Hd -> Mx data
      this._emitMxInitFunction(vertexData, mxStage)

      // Emit lighting and shadowing code
      if (lighting) {
        super.emitSpecularEnvironment(mxContext, mxStage)
        super.emitTransmissionRender(mxContext, mxStage)
      }
      if (shadowing) {
        ShaderGenerator.prototype.emitLibraryInclude.call(this,
          'pbrlib/' + GlslShaderGenerator.TARGET + '/lib/mx_shadow.glsl', mxContext, mxStage)
      }

      // Emit directional albedo table code.
      if (mxContext.getOptions().hwDirectionalAlbedoMethod ===
            HwDirectionalAlbedoMethod.DIRECTIONAL_ALBEDO_TABLE ||
          mxContext.getOptions().hwWriteAlbedoTable) {
        ShaderGenerator.prototype.emitLibraryInclude.call(this,
          'pbrlib/' + GlslShaderGenerator.TARGET + '/lib/mx_table.glsl', mxContext, mxStage)
        super.emitLineBreak(mxStage)
      }

      // Set the include file to use for uv transformations,
      // depending on the vertical flip flag.
      if (mxContext.getOptions().fileTextureVerticalFlip) {
        tokenSubstitutions.set(ShaderGenerator.T_FILE_TRANSFORM_UV, 'mx_transform_uv_vflip.glsl')
      } else {
        tokenSubstitutions.set(ShaderGenerator.T_FILE_TRANSFORM_UV, 'mx_transform_uv.glsl')
      }

      // Emit uv transform code globally if needed.
      if (mxContext.getOptions().hwAmbientOcclusion) {
        ShaderGenerator.prototype.emitLibraryInclude.call(this,
          'stdlib/' + GlslShaderGenerator.TARGET + '/lib/' +
            tokenSubstitutions.get(ShaderGenerator.T_FILE_TRANSFORM_UV)!,
          mxContext, mxStage)
      }

      // Add light sampling functions
      super.emitLightFunctionDefinitions(mxGraph, mxContext, mxStage)

      // Add all functions for node implementations
      super.emitFunctionDefinitions(mxGraph, mxContext, mxStage)
    }

    /** materialXShaderGen.cpp:935-956 (HdStMaterialXShaderGenBaseGlsl).
     *  Based on GlslShaderGenerator::generate(). Generates a glslfx shader
     *  and stores that in the pixel shader stage where it can be retrieved
     *  with getSourceCode(). */
    override generate(shaderName: string, mxElement: Element, mxContext: GenContext): Shader {
      const shader = this.createShader(shaderName, mxElement, mxContext)

      // Turn on fixed float formatting to make sure float values are
      // emitted with a decimal point and not as integers, and to avoid
      // any scientific notation which isn't supported by all OpenGL targets.
      const fmt = new ScopedFloatFormatting(FloatFormat.Fixed)
      try {
        // Create the glslfx (Pixel) Shader
        const shaderStage = shader.getStage(Stage.PIXEL)
        this._emitGlslfxShader(shader.getGraph(), mxContext, shaderStage)
        this.replaceTokens(this._tokenSubstitutions, shaderStage)
      } finally {
        fmt.restore()
      }
      return shader
    }

    /** materialXShaderGen.cpp:958-974 */
    _emitGlslfxShader(mxGraph: ShaderGraph, mxContext: GenContext, mxStage: ShaderStage): void {
      // Add a per-light shadowOcclusion value to the lightData uniform block
      addStageUniform(HW.LIGHT_DATA, Type.FLOAT, 'shadowOcclusion', mxStage)

      this._emitGlslfxHeader(mxContext, mxStage)
      this._emitMxFunctions(mxGraph, mxContext, mxStage)
      this._emitMxSurfaceShader(mxGraph, mxContext, mxStage)
    }

    /** materialXShaderGen.cpp:976-1037. Similar to
     *  GlslShaderGenerator::emitPixelStage() with alterations and additions
     *  to match Pxr's codeGen. */
    _emitMxFunctions(mxGraph: ShaderGraph, mxContext: GenContext, mxStage: ShaderStage): void {
      this.emitLibraryInclude(
        'stdlib/' + this.getTarget() + '/lib/mx_math.glsl', mxContext, mxStage)

      // Add type definitions
      this.emitTypeDefinitions(mxContext, mxStage)

      this._emitConstantsUniformsAndTypeDefs(
        mxContext, mxStage, this._syntax.getConstantQualifier())

      // Emit an overload of mx_latlong_map_lookup that is able to query the
      // cubemaps generated for the dome light.
      super.emitString(MxHdLatLongLookupCubemapGlsl, mxStage)

      // If bindlessTextures are not enabled, the above for loop skips
      // initializing textures. Initialize them here by defining mappings
      // to the appropriate HdGetSampler function.
      if (!this._bindlessTexturesEnabled) {
        // Define mappings for the DomeLight Textures
        this.emitLine('#ifdef HD_HAS_domeLightIrradiance', mxStage, false)
        this.emitLine('#define u_envRadiance ' +
                      'HdGetSampler_domeLightPrefilter() ', mxStage, false)
        this.emitLine('#define u_envIrradiance ' +
                      'HdGetSampler_domeLightIrradiance() ', mxStage, false)
        this.emitLine('#else', mxStage, false)
        this.emitLine('#define u_envRadiance ' +
                      'HdGetSampler_domeLightFallback()', mxStage, false)
        this.emitLine('#define u_envIrradiance ' +
                      'HdGetSampler_domeLightFallback()', mxStage, false)
        this.emitLine('#endif', mxStage, false)
        this.emitLineBreak(mxStage)

        // Define mappings for the MaterialX Textures
        if (this._mxHdTextureNames.length !== 0) {
          this.emitComment('Define MaterialX to Hydra Sampler mappings', mxStage)
          for (const textureName of this._mxHdTextureNames) {
            if (textureName === 'domeLightFallback') {
              continue
            }
            this.emitLine(_Printf('#define %s HdGetSampler_%s()',
              textureName, _GetSamplerName(textureName)),
              mxStage, false)
          }
          this.emitLineBreak(mxStage)
        }
      }

      this._emitDataStructsAndFunctionDefinitions(
        mxGraph, mxContext, mxStage, this._tokenSubstitutions)
    }
  }
  return HdStMaterialXShaderGen
}

/** A customized version of mx::SurfaceNodeGlsl (= mx::HwSurfaceNode,
 *  MaterialXGenGlsl/Nodes/SurfaceNodeGlsl.h) that notifies the shader
 *  generator when it starts/ends emitting the code for the SurfaceNode
 *  (materialXShaderGen.cpp:1043-1062 for GLSL, :1085-1104 for Vulkan GLSL;
 *  the two classes are identical but for the generator they cast to). */
class HdStMaterialXSurfaceNodeGenGlsl extends HwSurfaceNode {
  static override create(): ShaderNodeImpl {
    return new HdStMaterialXSurfaceNodeGenGlsl()
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as unknown as _SurfaceNodeNotified
    shadergen.setEmittingSurfaceNode(true)
    super.emitFunctionCall(node, context, stage)
    shadergen.setEmittingSurfaceNode(false)
  }
}

/** HdStMaterialXShaderGenGlsl (materialXShaderGen.h:131-146,
 *  materialXShaderGen.cpp:1064-1072): a glslfx shader with a surfaceShader
 *  function for a MaterialX network, targeting OpenGL GLSL. */
export class HdStMaterialXShaderGenGlsl extends HdStMaterialXShaderGenBaseGlsl(GlslShaderGenerator) {
  constructor(mxHdInfo: HdSt_MxShaderGenInfo) {
    // (MTLX_COMBINED_VERSION > 13902: Base(mx::TypeSystem::create()))
    super(TypeSystem.create())
    this._initMxHdInfo(mxHdInfo)
    // Register the customized version of the Surface node generator
    this.registerImplementation('IM_surface_' + this.getTarget(),
      HdStMaterialXSurfaceNodeGenGlsl.create)
  }

  static override create(mxHdInfo?: HdSt_MxShaderGenInfo | TypeSystem): ShaderGenerator {
    return new HdStMaterialXShaderGenGlsl(
      mxHdInfo instanceof HdSt_MxShaderGenInfo ? mxHdInfo : new HdSt_MxShaderGenInfo())
  }
}

/** HdStMaterialXShaderGenVkGlsl (materialXShaderGen.h:148-163,
 *  materialXShaderGen.cpp:1106-1114): a glslfx shader with a surfaceShader
 *  function for a MaterialX network, targeting Vulkan GLSL. */
export class HdStMaterialXShaderGenVkGlsl extends HdStMaterialXShaderGenBaseGlsl(VkShaderGenerator) {
  constructor(mxHdInfo: HdSt_MxShaderGenInfo) {
    super(TypeSystem.create())
    this._initMxHdInfo(mxHdInfo)
    // Register the customized version of the Surface node generator
    this.registerImplementation('IM_surface_' + this.getTarget(),
      HdStMaterialXSurfaceNodeGenGlsl.create)
  }

  static override create(mxHdInfo?: HdSt_MxShaderGenInfo | TypeSystem): ShaderGenerator {
    return new HdStMaterialXShaderGenVkGlsl(
      mxHdInfo instanceof HdSt_MxShaderGenInfo ? mxHdInfo : new HdSt_MxShaderGenInfo())
  }
}

/** HdStMaterialXHelpers (materialXShaderGen.h:200-215,
 *  materialXShaderGen.cpp:1360-1428), the MaterialX 1.39 branches. */
export const HdStMaterialXHelpers = {
  mxTypeIsNone(typeDesc: TypeDesc): boolean {
    return typeDesc.equals(Type.NONE)
  },
  mxTypeIsSurfaceShader(typeDesc: TypeDesc): boolean {
    return typeDesc.equals(Type.SURFACESHADER)
  },
  mxTypeDescIsFilename(typeDesc: TypeDesc): boolean {
    return typeDesc.equals(Type.FILENAME)
  },
  getMxTypeDesc(port: ShaderPort): TypeDesc {
    return port.getType()
  },
  mxGetTypeString(mxSyntax: Syntax, mxContext: GenContext, typeName: string): string {
    const mxType = mxContext.getTypeDesc(typeName)
    return mxSyntax.getTypeName(mxType)
  },
  getVector2Name(): string {
    return Type.VECTOR2.getName()
  },
}
