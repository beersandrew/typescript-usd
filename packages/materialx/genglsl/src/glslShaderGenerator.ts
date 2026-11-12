// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/GlslShaderGenerator.h,
//  source/MaterialXGenGlsl/GlslShaderGenerator.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/GlslShaderGenerator.h and .cpp

import { EMPTY_STRING, FloatFormat, ScopedFloatFormatting, type Element } from '@mtlx/core'
import {
  ExceptionShaderGenError,
  GenContext,
  HwSpecularEnvironmentMethod,
  HwTransmissionRenderMethod,
  MaterialNode,
  Shader,
  ShaderGenerator,
  ShaderGraph,
  ShaderNode,
  ShaderNodeClassification,
  ShaderStage,
  Stage,
  Syntax,
  Type,
  TypeSystem,
  VariableBlock,
  type ShaderPort,
} from '@mtlx/genshader'
import {
  HW,
  HwBitangentNode,
  HwFrameNode,
  HwGeomColorNode,
  HwGeomPropValueNode,
  HwGeomPropValueNodeAsUniform,
  HwImageNode,
  HwLightNode,
  HwLightSamplerNode,
  HwLightShaderNode,
  HwLightShaders,
  HwNormalNode,
  HwNumLightsNode,
  HwPositionNode,
  HwResourceBindingContext,
  HwShaderGenerator,
  HwSurfaceNode,
  HwTangentNode,
  HwTexCoordNode,
  HwTimeNode,
  HwTransformNormalNode,
  HwTransformPointNode,
  HwTransformVectorNode,
  HwViewDirectionNode,
} from '@mtlx/genhw'
import { GlslSyntax } from './glslSyntax.ts'

// Base class for GLSL (OpenGL Shading Language) code generation.
// A generator for a specific GLSL target should be derived from this class.
export class GlslShaderGenerator extends HwShaderGenerator {
  // Unique identifier for this generator target
  static readonly TARGET: string = 'genglsl'

  // Version string for the generator target
  static readonly VERSION: string = '400'

  // Nodes used internally for light sampling.
  protected _lightSamplingNodes: ShaderNode[] = []

  constructor(typeSystem: TypeSystem, syntax?: Syntax) {
    super(typeSystem, syntax ?? GlslSyntax.create(typeSystem))

    //
    // Register all custom node implementation classes
    //

    // <!-- <position> -->
    this.registerImplementation('IM_position_vector3_' + GlslShaderGenerator.TARGET, HwPositionNode.create)
    // <!-- <normal> -->
    this.registerImplementation('IM_normal_vector3_' + GlslShaderGenerator.TARGET, HwNormalNode.create)
    // <!-- <tangent> -->
    this.registerImplementation('IM_tangent_vector3_' + GlslShaderGenerator.TARGET, HwTangentNode.create)
    // <!-- <bitangent> -->
    this.registerImplementation('IM_bitangent_vector3_' + GlslShaderGenerator.TARGET, HwBitangentNode.create)
    // <!-- <texcoord> -->
    this.registerImplementation('IM_texcoord_vector2_' + GlslShaderGenerator.TARGET, HwTexCoordNode.create)
    this.registerImplementation('IM_texcoord_vector3_' + GlslShaderGenerator.TARGET, HwTexCoordNode.create)
    // <!-- <geomcolor> -->
    this.registerImplementation('IM_geomcolor_float_' + GlslShaderGenerator.TARGET, HwGeomColorNode.create)
    this.registerImplementation('IM_geomcolor_color3_' + GlslShaderGenerator.TARGET, HwGeomColorNode.create)
    this.registerImplementation('IM_geomcolor_color4_' + GlslShaderGenerator.TARGET, HwGeomColorNode.create)
    // <!-- <geompropvalue> -->
    this.registerImplementation(
      [
        'IM_geompropvalue_integer_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_float_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_color3_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_color4_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_vector2_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_vector3_' + GlslShaderGenerator.TARGET,
        'IM_geompropvalue_vector4_' + GlslShaderGenerator.TARGET,
      ],
      HwGeomPropValueNode.create,
    )
    this.registerImplementation('IM_geompropvalue_boolean_' + GlslShaderGenerator.TARGET, HwGeomPropValueNodeAsUniform.create)
    this.registerImplementation('IM_geompropvalue_string_' + GlslShaderGenerator.TARGET, HwGeomPropValueNodeAsUniform.create)
    this.registerImplementation('IM_geompropvalue_filename_' + GlslShaderGenerator.TARGET, HwGeomPropValueNodeAsUniform.create)

    // <!-- <frame> -->
    this.registerImplementation('IM_frame_float_' + GlslShaderGenerator.TARGET, HwFrameNode.create)
    // <!-- <time> -->
    this.registerImplementation('IM_time_float_' + GlslShaderGenerator.TARGET, HwTimeNode.create)
    // <!-- <viewdirection> -->
    this.registerImplementation('IM_viewdirection_vector3_' + GlslShaderGenerator.TARGET, HwViewDirectionNode.create)

    // <!-- <surface> -->
    this.registerImplementation('IM_surface_' + GlslShaderGenerator.TARGET, HwSurfaceNode.create)

    // <!-- <light> -->
    this.registerImplementation('IM_light_' + GlslShaderGenerator.TARGET, HwLightNode.create)

    // <!-- <point_light> -->
    this.registerImplementation('IM_point_light_' + GlslShaderGenerator.TARGET, HwLightShaderNode.create)
    // <!-- <directional_light> -->
    this.registerImplementation('IM_directional_light_' + GlslShaderGenerator.TARGET, HwLightShaderNode.create)
    // <!-- <spot_light> -->
    this.registerImplementation('IM_spot_light_' + GlslShaderGenerator.TARGET, HwLightShaderNode.create)

    // <!-- <ND_transformpoint> ->
    this.registerImplementation('IM_transformpoint_vector3_' + GlslShaderGenerator.TARGET, HwTransformPointNode.create)

    // <!-- <ND_transformvector> ->
    this.registerImplementation('IM_transformvector_vector3_' + GlslShaderGenerator.TARGET, HwTransformVectorNode.create)

    // <!-- <ND_transformnormal> ->
    this.registerImplementation('IM_transformnormal_vector3_' + GlslShaderGenerator.TARGET, HwTransformNormalNode.create)

    // <!-- <image> -->
    this.registerImplementation(
      [
        'IM_image_float_' + GlslShaderGenerator.TARGET,
        'IM_image_color3_' + GlslShaderGenerator.TARGET,
        'IM_image_color4_' + GlslShaderGenerator.TARGET,
        'IM_image_vector2_' + GlslShaderGenerator.TARGET,
        'IM_image_vector3_' + GlslShaderGenerator.TARGET,
        'IM_image_vector4_' + GlslShaderGenerator.TARGET,
      ],
      HwImageNode.create,
    )

    // <!-- <surfacematerial> -->
    this.registerImplementation('IM_surfacematerial_' + GlslShaderGenerator.TARGET, MaterialNode.create)

    this._lightSamplingNodes.push(ShaderNode.createFromImpl(null, 'numActiveLightSources', HwNumLightsNode.create()))
    this._lightSamplingNodes.push(ShaderNode.createFromImpl(null, 'sampleLightSource', HwLightSamplerNode.create()))
  }

  // Creator function. If a TypeSystem is not provided it will be created
  // internally. Optionally pass in an externally created TypeSystem here,
  // if you want to keep type descriptions alive after the lifetime of the
  // shader generator.
  static create(typeSystem?: TypeSystem): ShaderGenerator {
    return new GlslShaderGenerator(typeSystem ?? TypeSystem.create())
  }

  // Return a unique identifier for the target this generator is for
  getTarget(): string {
    return GlslShaderGenerator.TARGET
  }

  // Return the version string for the GLSL version this generator is for
  getVersion(): string {
    return GlslShaderGenerator.VERSION
  }

  // Generate a shader starting from the given element, translating
  // the element and all dependencies upstream into shader code.
  generate(name: string, element: Element, context: GenContext): Shader {
    const shader = this.createShader(name, element, context)

    // Request fixed floating-point notation for consistency across targets.
    const fmt = new ScopedFloatFormatting(FloatFormat.Fixed)
    try {
      // Make sure we initialize/reset the binding context before generation.
      const resourceBindingCtx = this.getResourceBindingContext(context)
      if (resourceBindingCtx) {
        resourceBindingCtx.initialize()
      }

      // Emit code for vertex shader stage
      const vs = shader.getStage(Stage.VERTEX)
      this.emitVertexStage(shader.getGraph(), context, vs)
      this.replaceTokens(this._tokenSubstitutions, vs)

      // Emit code for pixel shader stage
      const ps = shader.getStage(Stage.PIXEL)
      this.emitPixelStage(shader.getGraph(), context, ps)
      this.replaceTokens(this._tokenSubstitutions, ps)
    } finally {
      fmt.restore()
    }

    return shader
  }

  protected emitVertexStage(graph: ShaderGraph, context: GenContext, stage: ShaderStage): void {
    const resourceBindingCtx = this.getResourceBindingContext(context)

    this.emitDirectives(context, stage)
    if (resourceBindingCtx) {
      resourceBindingCtx.emitDirectives(context, stage)
    }
    this.emitLineBreak(stage)

    // Add all constants
    this.emitConstants(context, stage)

    // Add all uniforms
    this.emitUniforms(context, stage)

    // Add vertex inputs
    this.emitInputs(context, stage)

    // Add vertex data outputs block
    this.emitOutputs(context, stage)

    // Add common math functions
    this.emitLibraryInclude('stdlib/genglsl/lib/mx_math.glsl', context, stage)
    this.emitLineBreak(stage)

    this.emitFunctionDefinitions(graph, context, stage)

    // Add main function
    this.setFunctionName('main', stage)
    this.emitLine('void main()', stage, false)
    this.emitFunctionBodyBegin(graph, context, stage)
    this.emitLine('vec4 hPositionWorld = ' + HW.T_WORLD_MATRIX + ' * vec4(' + HW.T_IN_POSITION + ', 1.0)', stage)
    this.emitLine('gl_Position = ' + HW.T_VIEW_PROJECTION_MATRIX + ' * hPositionWorld', stage)

    // Emit all function calls in order
    for (const node of graph.getNodes()) {
      this.emitFunctionCall(node, context, stage)
    }

    this.emitFunctionBodyEnd(graph, context, stage)
  }

  // Emit specular environment lookup code
  protected emitSpecularEnvironment(context: GenContext, stage: ShaderStage): void {
    const specularMethod = context.getOptions().hwSpecularEnvironmentMethod
    if (specularMethod === HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_FIS) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_environment_fis.glsl', context, stage)
    } else if (specularMethod === HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_PREFILTER) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_environment_prefilter.glsl', context, stage)
    } else if (specularMethod === HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_NONE) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_environment_none.glsl', context, stage)
    } else {
      throw new ExceptionShaderGenError(`Invalid hardware specular environment method specified: '${specularMethod}'`)
    }
    this.emitLineBreak(stage)
  }

  // Emit transmission rendering code
  protected emitTransmissionRender(context: GenContext, stage: ShaderStage): void {
    const transmissionMethod = context.getOptions().hwTransmissionRenderMethod
    if (transmissionMethod === HwTransmissionRenderMethod.TRANSMISSION_REFRACTION) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_transmission_refract.glsl', context, stage)
    } else if (transmissionMethod === HwTransmissionRenderMethod.TRANSMISSION_OPACITY) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_transmission_opacity.glsl', context, stage)
    } else {
      throw new ExceptionShaderGenError(`Invalid transmission render specified: '${transmissionMethod}'`)
    }
    this.emitLineBreak(stage)
  }

  protected emitDirectives(_context: GenContext, stage: ShaderStage): void {
    this.emitLine('#version ' + this.getVersion(), stage, false)
    this.emitLineBreak(stage)
  }

  protected emitConstants(context: GenContext, stage: ShaderStage): void {
    const constants = stage.getConstantBlock()
    if (!constants.empty()) {
      this.emitVariableDeclarations(constants, this._syntax.getConstantQualifier(), Syntax.SEMICOLON, context, stage)
      this.emitLineBreak(stage)
    }
  }

  protected emitUniforms(context: GenContext, stage: ShaderStage): void {
    for (const uniforms of stage.getUniformBlocks().values()) {
      // Skip light uniforms as they are handled separately
      if (!uniforms.empty() && uniforms.getName() !== HW.LIGHT_DATA) {
        this.emitComment('Uniform block: ' + uniforms.getName(), stage)
        const resourceBindingCtx = this.getResourceBindingContext(context)
        if (resourceBindingCtx) {
          resourceBindingCtx.emitResourceBindings(context, uniforms, stage)
        } else {
          this.emitVariableDeclarations(uniforms, this._syntax.getUniformQualifier(), Syntax.SEMICOLON, context, stage)
          this.emitLineBreak(stage)
        }
      }
    }
  }

  protected emitLightData(context: GenContext, stage: ShaderStage): void {
    const lightData = stage.getUniformBlock(HW.LIGHT_DATA)
    const structArraySuffix = '[' + HW.LIGHT_DATA_MAX_LIGHT_SOURCES + ']'
    const structName = lightData.getInstance()
    const resourceBindingCtx = this.getResourceBindingContext(context)
    if (resourceBindingCtx) {
      resourceBindingCtx.emitStructuredResourceBindings(context, lightData, stage, structName, structArraySuffix)
    } else {
      this.emitLine('struct ' + lightData.getName(), stage, false)
      this.emitScopeBegin(stage)
      this.emitVariableDeclarations(lightData, EMPTY_STRING, Syntax.SEMICOLON, context, stage, false)
      this.emitScopeEnd(stage, true)
      this.emitLineBreak(stage)
      this.emitLine('uniform ' + lightData.getName() + ' ' + structName + structArraySuffix, stage)
    }
    this.emitLineBreak(stage)
  }

  protected emitInputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexInputs = stage.getInputBlock(HW.VERTEX_INPUTS)
      if (!vertexInputs.empty()) {
        this.emitComment('Inputs block: ' + vertexInputs.getName(), stage)
        this.emitVariableDeclarations(vertexInputs, this._syntax.getInputQualifier(), Syntax.SEMICOLON, context, stage, false)
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitLine('in ' + vertexData.getName(), stage, false)
        this.emitScopeBegin(stage)
        this.emitVariableDeclarations(vertexData, EMPTY_STRING, Syntax.SEMICOLON, context, stage, false)
        this.emitScopeEnd(stage, false, false)
        this.emitString(' ' + vertexData.getInstance() + Syntax.SEMICOLON, stage)
        this.emitLineBreak(stage)
        this.emitLineBreak(stage)
      }
    }
  }

  protected emitOutputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitLine('out ' + vertexData.getName(), stage, false)
        this.emitScopeBegin(stage)
        this.emitVariableDeclarations(vertexData, EMPTY_STRING, Syntax.SEMICOLON, context, stage, false)
        this.emitScopeEnd(stage, false, false)
        this.emitString(' ' + vertexData.getInstance() + Syntax.SEMICOLON, stage)
        this.emitLineBreak(stage)
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      this.emitComment('Pixel shader outputs', stage)
      const outputs = stage.getOutputBlock(HW.PIXEL_OUTPUTS)
      this.emitVariableDeclarations(outputs, this._syntax.getOutputQualifier(), Syntax.SEMICOLON, context, stage, false)
      this.emitLineBreak(stage)
    }
  }

  protected getResourceBindingContext(context: GenContext): HwResourceBindingContext | null {
    return context.getUserData<HwResourceBindingContext>(HW.USER_DATA_BINDING_CONTEXT)
  }

  // Determine the prefix of vertex data variables.
  override getVertexDataPrefix(vertexData: VariableBlock): string {
    return vertexData.getInstance() + '.'
  }

  protected emitPixelStage(graph: ShaderGraph, context: GenContext, stage: ShaderStage): void {
    const resourceBindingCtx = this.getResourceBindingContext(context)

    // Add directives
    this.emitDirectives(context, stage)
    if (resourceBindingCtx) {
      resourceBindingCtx.emitDirectives(context, stage)
    }
    this.emitLineBreak(stage)

    // Add type definitions
    this.emitTypeDefinitions(context, stage)

    // Add all constants
    this.emitConstants(context, stage)

    // Add all uniforms
    this.emitUniforms(context, stage)

    // Add vertex data inputs block
    this.emitInputs(context, stage)

    // Add the pixel shader output. This needs to be a vec4 for rendering
    // and upstream connection will be converted to vec4 if needed in emitFinalOutput()
    this.emitOutputs(context, stage)

    // Add common math functions
    this.emitLibraryInclude('stdlib/genglsl/lib/mx_math.glsl', context, stage)
    this.emitLineBreak(stage)

    // Determine whether lighting is required
    const lighting = this.requiresLighting(graph)

    // Define directional albedo approach
    if (lighting || context.getOptions().hwWriteAlbedoTable || context.getOptions().hwWriteEnvPrefilter) {
      this.emitLine('#define DIRECTIONAL_ALBEDO_METHOD ' + String(context.getOptions().hwDirectionalAlbedoMethod), stage, false)
      this.emitLineBreak(stage)
    }

    // Define Airy Fresnel iterations
    this.emitLine('#define AIRY_FRESNEL_ITERATIONS ' + String(context.getOptions().hwAiryFresnelIterations), stage, false)
    this.emitLineBreak(stage)

    // Add lighting support
    if (lighting) {
      if (context.getOptions().hwMaxActiveLightSources > 0) {
        const maxLights = Math.max(1, context.getOptions().hwMaxActiveLightSources)
        this.emitLine('#define ' + HW.LIGHT_DATA_MAX_LIGHT_SOURCES + ' ' + String(maxLights), stage, false)
      }
      this.emitSpecularEnvironment(context, stage)
      this.emitTransmissionRender(context, stage)

      if (context.getOptions().hwMaxActiveLightSources > 0) {
        this.emitLightData(context, stage)
      }
    }

    // Add shadowing support
    const shadowing = (lighting && context.getOptions().hwShadowMap) || context.getOptions().hwWriteDepthMoments
    if (shadowing) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_shadow.glsl', context, stage)
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_shadow_platform.glsl', context, stage)
    }

    // Emit directional albedo table code.
    if (context.getOptions().hwWriteAlbedoTable) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_generate_albedo_table.glsl', context, stage)
      this.emitLineBreak(stage)
    }

    // Emit environment prefiltering code
    if (context.getOptions().hwWriteEnvPrefilter) {
      this.emitLibraryInclude('pbrlib/genglsl/lib/mx_generate_prefilter_env.glsl', context, stage)
      this.emitLineBreak(stage)
    }

    // Set the include file to use for uv transformations,
    // depending on the vertical flip flag.
    if (context.getOptions().fileTextureVerticalFlip) {
      this._tokenSubstitutions.set(ShaderGenerator.T_FILE_TRANSFORM_UV, 'mx_transform_uv_vflip.glsl')
    } else {
      this._tokenSubstitutions.set(ShaderGenerator.T_FILE_TRANSFORM_UV, 'mx_transform_uv.glsl')
    }

    this.emitLightFunctionDefinitions(graph, context, stage)

    // Emit function definitions for all nodes in the graph.
    this.emitFunctionDefinitions(graph, context, stage)

    const outputSocket = graph.getOutputSocket()!

    // Add main function
    this.setFunctionName('main', stage)
    this.emitLine('void main()', stage, false)
    this.emitFunctionBodyBegin(graph, context, stage)

    if (
      graph.hasClassification(ShaderNodeClassification.CLOSURE) &&
      !graph.hasClassification(ShaderNodeClassification.SHADER)
    ) {
      // Handle the case where the graph is a direct closure.
      // We don't support rendering closures without attaching
      // to a surface shader, so just output black.
      this.emitLine(outputSocket.getVariable() + ' = vec4(0.0, 0.0, 0.0, 1.0)', stage)
    } else if (context.getOptions().hwWriteDepthMoments) {
      this.emitLine(outputSocket.getVariable() + ' = vec4(mx_compute_depth_moments(), 0.0, 1.0)', stage)
    } else if (context.getOptions().hwWriteAlbedoTable) {
      this.emitLine(outputSocket.getVariable() + ' = vec4(mx_generate_dir_albedo_table(), 1.0)', stage)
    } else if (context.getOptions().hwWriteEnvPrefilter) {
      this.emitLine(outputSocket.getVariable() + ' = vec4(mx_generate_prefilter_env(), 1.0)', stage)
    } else {
      // Add all function calls.
      //
      // Surface shaders need special handling.
      if (graph.hasClassification(ShaderNodeClassification.SHADER | ShaderNodeClassification.SURFACE)) {
        // Emit all texturing nodes. These are inputs to any
        // closure/shader nodes and need to be emitted first.
        this.emitFunctionCalls(graph, context, stage, ShaderNodeClassification.TEXTURE)

        // Emit function calls for "root" closure/shader nodes.
        // These will internally emit function calls for any dependent closure nodes upstream.
        for (const socket of graph.getOutputSockets()) {
          if (socket.getConnection()) {
            const upstream = socket.getConnection()!.getNode()!
            if (
              upstream.getParent() === graph &&
              (upstream.hasClassification(ShaderNodeClassification.CLOSURE) ||
                upstream.hasClassification(ShaderNodeClassification.SHADER))
            ) {
              this.emitFunctionCall(upstream, context, stage)
            }
          }
        }
      } else {
        // No surface shader graph so just generate all
        // function calls in order.
        this.emitFunctionCalls(graph, context, stage)
      }

      // Emit final output
      const outputConnection = outputSocket.getConnection()
      if (outputConnection) {
        if (graph.hasClassification(ShaderNodeClassification.SURFACE)) {
          let outColor = outputConnection.getVariable() + '.color'
          const outTransparency = outputConnection.getVariable() + '.transparency'
          if (context.getOptions().hwSrgbEncodeOutput) {
            outColor = 'mx_srgb_encode(' + outColor + ')'
          }
          if (context.getOptions().hwTransparency) {
            this.emitLine('float outAlpha = clamp(1.0 - dot(' + outTransparency + ', vec3(0.3333)), 0.0, 1.0)', stage)
            this.emitLine(outputSocket.getVariable() + ' = vec4(' + outColor + ', outAlpha)', stage)
            this.emitLine('if (outAlpha < ' + HW.T_ALPHA_THRESHOLD + ')', stage, false)
            this.emitScopeBegin(stage)
            this.emitLine('discard', stage)
            this.emitScopeEnd(stage)
          } else {
            this.emitLine(outputSocket.getVariable() + ' = vec4(' + outColor + ', 1.0)', stage)
          }
        } else {
          let outValue = outputConnection.getVariable()
          if (context.getOptions().hwSrgbEncodeOutput && outputSocket.getType().isFloat3()) {
            outValue = 'mx_srgb_encode(' + outValue + ')'
          }
          if (!outputSocket.getType().isFloat4()) {
            outValue = this.toVec4(outputSocket.getType(), outValue)
          }
          this.emitLine(outputSocket.getVariable() + ' = ' + outValue, stage)
        }
      } else {
        const outputValue = outputSocket.getValue()
          ? this._syntax.getValueOfType(outputSocket.getType(), outputSocket.getValue()!)
          : this._syntax.getDefaultValue(outputSocket.getType())
        if (!outputSocket.getType().isFloat4()) {
          let finalOutput = outputSocket.getVariable() + '_tmp'
          this.emitLine(this._syntax.getTypeName(outputSocket.getType()) + ' ' + finalOutput + ' = ' + outputValue, stage)
          finalOutput = this.toVec4(outputSocket.getType(), finalOutput)
          this.emitLine(outputSocket.getVariable() + ' = ' + finalOutput, stage)
        } else {
          this.emitLine(outputSocket.getVariable() + ' = ' + outputValue, stage)
        }
      }
    }

    // End main function
    this.emitFunctionBodyEnd(graph, context, stage)
  }

  // Emit function definitions for lighting code
  protected emitLightFunctionDefinitions(graph: ShaderGraph, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      // Emit Light functions if requested
      if (this.requiresLighting(graph) && context.getOptions().hwMaxActiveLightSources > 0) {
        // For surface shaders we need light shaders
        if (graph.hasClassification(ShaderNodeClassification.SHADER | ShaderNodeClassification.SURFACE)) {
          // Emit functions for all bound light shaders
          const lightShaders = context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)
          if (lightShaders) {
            for (const shader of lightShaders.getAll().values()) {
              this.emitFunctionDefinition(shader, context, stage)
            }
          }
          // Emit functions for light sampling
          for (const node of this._lightSamplingNodes) {
            this.emitFunctionDefinition(node, context, stage)
          }
        }
      }
    }
  }

  // Emit a shader variable.
  override emitVariableDeclaration(
    variable: ShaderPort,
    qualifier: string,
    _context: GenContext,
    stage: ShaderStage,
    assignValue = true,
  ): void {
    // A file texture input needs special handling on GLSL
    if (variable.getType().equals(Type.FILENAME)) {
      // Samplers must always be uniforms
      const str = qualifier === '' ? EMPTY_STRING : qualifier + ' '
      this.emitString(str + 'sampler2D ' + variable.getVariable(), stage)
    } else {
      let str = qualifier === '' ? EMPTY_STRING : qualifier + ' '
      // Varying parameters of type int must be flat qualified on output from vertex stage and
      // input to pixel stage. The only way to get these is with geompropvalue_integer nodes.
      if (
        qualifier === '' &&
        variable.getType().equals(Type.INTEGER) &&
        !assignValue &&
        variable.getName().startsWith(HW.T_IN_GEOMPROP)
      ) {
        str += GlslSyntax.FLAT_QUALIFIER + ' '
      }
      str += this._syntax.getTypeName(variable.getType()) + ' ' + variable.getVariable()

      // If an array we need an array qualifier (suffix) for the variable name
      if (variable.getType().isArray() && variable.getValue()) {
        str += this._syntax.getArrayVariableSuffix(variable.getType(), variable.getValue()!)
      }

      if (variable.getSemantic() !== '') {
        str += ' : ' + variable.getSemantic()
      }

      if (assignValue) {
        const valueStr = variable.getValue()
          ? this._syntax.getValueOfType(variable.getType(), variable.getValue()!, true)
          : this._syntax.getDefaultValue(variable.getType(), true)
        str += valueStr === '' ? EMPTY_STRING : ' = ' + valueStr
      }

      this.emitString(str, stage)
    }
  }
}

// Backward compatibility alias for OpenUSD and other external projects
// referencing files that were removed in MaterialX 1.39.5
// (mirrors source/MaterialXGenGlsl/Nodes/SurfaceNodeGlsl.h).
export { HwSurfaceNode as SurfaceNodeGlsl }
