// Ported from MaterialX 1.39.5: source/MaterialXGenHw/HwShaderGenerator.h,
//  source/MaterialXGenHw/HwShaderGenerator.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/HwShaderGenerator.h and .cpp

import { Document, Element, Matrix44, NodeDef, NodeGraph, Value, Vector3 } from '@mtlx/core'
import {
  CompoundNode,
  ExceptionShaderGenError,
  GenContext,
  GenOptions,
  HwSpecularEnvironmentMethod,
  HwDirectionalAlbedoMethod,
  Shader,
  ShaderGenerator,
  ShaderGraph,
  ShaderNode,
  ShaderNodeClassification,
  ShaderNodeImpl,
  ShaderStage,
  Stage,
  Syntax,
  Type,
  TypeDesc,
  TypeSystem,
  VariableBlock,
  addStageConnector,
  addStageConnectorBlock,
  addStageInput,
  addStageUniform,
} from '@mtlx/genshader'
import { HW } from './hwConstants.ts'
import { HwLightShaders } from './hwLightShaders.ts'
import { HwLightCompoundNode } from './nodes/hwLightCompoundNode.ts'
import { HwMaterialCompoundNode } from './nodes/hwMaterialCompoundNode.ts'

// Types of closure contexts for HW. The order must match the order defined
// in libraries/pbrlib/genglsl/lib/mx_closure_type.glsl.
export enum ClosureContextType {
  DEFAULT,
  REFLECTION,
  TRANSMISSION,
  INDIRECT,
  EMISSION,
  LIGHTING,
  CLOSURE,
}

// Base class for shader generators targeting HW rendering.
export class HwShaderGenerator extends ShaderGenerator {
  protected constructor(typeSystem: TypeSystem, syntax: Syntax) {
    super(typeSystem, syntax)

    // Assign default identifier names for all tokens. Derived generators
    // can override these names.
    const t = this._tokenSubstitutions
    t.set(HW.T_IN_POSITION, HW.IN_POSITION)
    t.set(HW.T_IN_NORMAL, HW.IN_NORMAL)
    t.set(HW.T_IN_TANGENT, HW.IN_TANGENT)
    t.set(HW.T_IN_BITANGENT, HW.IN_BITANGENT)
    t.set(HW.T_IN_TEXCOORD, HW.IN_TEXCOORD)
    t.set(HW.T_IN_GEOMPROP, HW.IN_GEOMPROP)
    t.set(HW.T_IN_COLOR, HW.IN_COLOR)
    t.set(HW.T_POSITION_WORLD, HW.POSITION_WORLD)
    t.set(HW.T_NORMAL_WORLD, HW.NORMAL_WORLD)
    t.set(HW.T_TANGENT_WORLD, HW.TANGENT_WORLD)
    t.set(HW.T_BITANGENT_WORLD, HW.BITANGENT_WORLD)
    t.set(HW.T_POSITION_OBJECT, HW.POSITION_OBJECT)
    t.set(HW.T_NORMAL_OBJECT, HW.NORMAL_OBJECT)
    t.set(HW.T_TANGENT_OBJECT, HW.TANGENT_OBJECT)
    t.set(HW.T_BITANGENT_OBJECT, HW.BITANGENT_OBJECT)
    t.set(HW.T_TEXCOORD, HW.TEXCOORD)
    t.set(HW.T_COLOR, HW.COLOR)
    t.set(HW.T_WORLD_MATRIX, HW.WORLD_MATRIX)
    t.set(HW.T_WORLD_INVERSE_MATRIX, HW.WORLD_INVERSE_MATRIX)
    t.set(HW.T_WORLD_TRANSPOSE_MATRIX, HW.WORLD_TRANSPOSE_MATRIX)
    t.set(HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX, HW.WORLD_INVERSE_TRANSPOSE_MATRIX)
    t.set(HW.T_VIEW_MATRIX, HW.VIEW_MATRIX)
    t.set(HW.T_VIEW_INVERSE_MATRIX, HW.VIEW_INVERSE_MATRIX)
    t.set(HW.T_VIEW_TRANSPOSE_MATRIX, HW.VIEW_TRANSPOSE_MATRIX)
    t.set(HW.T_VIEW_INVERSE_TRANSPOSE_MATRIX, HW.VIEW_INVERSE_TRANSPOSE_MATRIX)
    t.set(HW.T_PROJ_MATRIX, HW.PROJ_MATRIX)
    t.set(HW.T_PROJ_INVERSE_MATRIX, HW.PROJ_INVERSE_MATRIX)
    t.set(HW.T_PROJ_TRANSPOSE_MATRIX, HW.PROJ_TRANSPOSE_MATRIX)
    t.set(HW.T_PROJ_INVERSE_TRANSPOSE_MATRIX, HW.PROJ_INVERSE_TRANSPOSE_MATRIX)
    t.set(HW.T_WORLD_VIEW_MATRIX, HW.WORLD_VIEW_MATRIX)
    t.set(HW.T_VIEW_PROJECTION_MATRIX, HW.VIEW_PROJECTION_MATRIX)
    t.set(HW.T_WORLD_VIEW_PROJECTION_MATRIX, HW.WORLD_VIEW_PROJECTION_MATRIX)
    t.set(HW.T_VIEW_POSITION, HW.VIEW_POSITION)
    t.set(HW.T_VIEW_DIRECTION, HW.VIEW_DIRECTION)
    t.set(HW.T_FRAME, HW.FRAME)
    t.set(HW.T_TIME, HW.TIME)
    t.set(HW.T_GEOMPROP, HW.GEOMPROP)
    t.set(HW.T_ALPHA_THRESHOLD, HW.ALPHA_THRESHOLD)
    t.set(HW.T_NUM_ACTIVE_LIGHT_SOURCES, HW.NUM_ACTIVE_LIGHT_SOURCES)
    t.set(HW.T_ENV_MATRIX, HW.ENV_MATRIX)
    t.set(HW.T_ENV_RADIANCE, HW.ENV_RADIANCE)
    t.set(HW.T_ENV_RADIANCE_SAMPLER2D, HW.ENV_RADIANCE_SAMPLER2D)
    t.set(HW.T_ENV_RADIANCE_MIPS, HW.ENV_RADIANCE_MIPS)
    t.set(HW.T_ENV_RADIANCE_SAMPLES, HW.ENV_RADIANCE_SAMPLES)
    t.set(HW.T_ENV_IRRADIANCE, HW.ENV_IRRADIANCE)
    t.set(HW.T_ENV_IRRADIANCE_SAMPLER2D, HW.ENV_IRRADIANCE_SAMPLER2D)
    t.set(HW.T_ENV_LIGHT_INTENSITY, HW.ENV_LIGHT_INTENSITY)
    t.set(HW.T_REFRACTION_TWO_SIDED, HW.REFRACTION_TWO_SIDED)
    t.set(HW.T_ALBEDO_TABLE, HW.ALBEDO_TABLE)
    t.set(HW.T_ALBEDO_TABLE_SIZE, HW.ALBEDO_TABLE_SIZE)
    t.set(HW.T_SHADOW_MAP, HW.SHADOW_MAP)
    t.set(HW.T_SHADOW_MATRIX, HW.SHADOW_MATRIX)
    t.set(HW.T_AMB_OCC_MAP, HW.AMB_OCC_MAP)
    t.set(HW.T_AMB_OCC_GAIN, HW.AMB_OCC_GAIN)
    t.set(HW.T_VERTEX_DATA_INSTANCE, HW.VERTEX_DATA_INSTANCE)
    t.set(HW.T_LIGHT_DATA_INSTANCE, HW.LIGHT_DATA_INSTANCE)
    t.set(HW.T_ENV_PREFILTER_MIP, HW.ENV_PREFILTER_MIP)
    t.set(HW.T_TEX_SAMPLER_SAMPLER2D, HW.TEX_SAMPLER_SAMPLER2D)
    t.set(HW.T_TEX_SAMPLER_SIGNATURE, HW.TEX_SAMPLER_SIGNATURE)
    t.set(HW.T_CLOSURE_DATA_CONSTRUCTOR, HW.CLOSURE_DATA_CONSTRUCTOR)
  }

  override applyDefaultOptions(options: GenOptions): void {
    super.applyDefaultOptions(options)
    options.premultipliedBsdfAdd = true
  }

  // Create and initialize a new HW shader for shader generation.
  protected createShader(name: string, element: Element, context: GenContext): Shader {
    // Create the root shader graph.
    const graph = ShaderGraph.create(null, name, element, context)
    const shader = new Shader(name, graph)

    // Check for inputs with default geomprops assigned. To bind the
    // corresponding data, geomprop nodes are inserted in the graph.
    let geomNodeAdded = false
    for (const socket of graph.getInputSockets()) {
      if (socket.getGeomProp() !== '') {
        const doc = element.getDocument() as Document
        const geomprop = doc.getGeomPropDef(socket.getGeomProp())
        if (geomprop) {
          // For all internal connections to this input, break the
          // connection and assign a geomprop node that generates the data.
          for (const connection of [...socket.getConnections()]) {
            connection.breakConnection()
            graph.addDefaultGeomNode(connection, geomprop, context)
            geomNodeAdded = true
          }
        }
      }
    }
    // If nodes were added the nodes must be re-sorted topologically.
    if (geomNodeAdded) {
      graph.topologicalSort()
    }

    // Create the vertex stage.
    const vs = shader.createStage(Stage.VERTEX, this._syntax)
    vs.createInputBlock(HW.VERTEX_INPUTS, 'i_vs')

    // Each stage has private and public uniform blocks: public uniforms are
    // published in a UI for user interaction; private uniforms are internal
    // variables needed by the system.
    vs.createUniformBlock(HW.PRIVATE_UNIFORMS, 'u_prv')
    vs.createUniformBlock(HW.PUBLIC_UNIFORMS, 'u_pub')

    // Create required variables for the vertex stage.
    const vsInputs = vs.getInputBlock(HW.VERTEX_INPUTS)
    vsInputs.add(Type.VECTOR3, HW.T_IN_POSITION)
    const vsPrivateUniforms = vs.getUniformBlock(HW.PRIVATE_UNIFORMS)
    vsPrivateUniforms.add(Type.MATRIX44, HW.T_WORLD_MATRIX)
    vsPrivateUniforms.add(Type.MATRIX44, HW.T_VIEW_PROJECTION_MATRIX)

    // Create the pixel stage.
    const ps = shader.createStage(Stage.PIXEL, this._syntax)
    const psOutputs = ps.createOutputBlock(HW.PIXEL_OUTPUTS, 'o_ps')

    // Create required uniform blocks.
    const psPrivateUniforms = ps.createUniformBlock(HW.PRIVATE_UNIFORMS, 'u_prv')
    const psPublicUniforms = ps.createUniformBlock(HW.PUBLIC_UNIFORMS, 'u_pub')
    const lightData = ps.createUniformBlock(HW.LIGHT_DATA, HW.T_LIGHT_DATA_INSTANCE)
    lightData.add(Type.INTEGER, this.getLightDataTypevarString())

    // Add a block for data from the vertex to pixel shader.
    addStageConnectorBlock(HW.VERTEX_DATA, HW.T_VERTEX_DATA_INSTANCE, vs, ps)

    // Add uniforms for transparent rendering.
    if (context.getOptions().hwTransparency) {
      psPrivateUniforms.add(Type.FLOAT, HW.T_ALPHA_THRESHOLD, Value.createValue(0.001))
    }

    // Add uniforms for shadow map rendering.
    if (context.getOptions().hwShadowMap) {
      psPrivateUniforms.add(Type.FILENAME, HW.T_SHADOW_MAP)
      psPrivateUniforms.add(Type.MATRIX44, HW.T_SHADOW_MATRIX, Value.createValue(Matrix44.IDENTITY))
    }

    // Add inputs and uniforms for ambient occlusion.
    if (context.getOptions().hwAmbientOcclusion) {
      addStageInput(HW.VERTEX_INPUTS, Type.VECTOR2, HW.T_IN_TEXCOORD + '_0', vs)
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR2, HW.T_TEXCOORD + '_0', vs, ps)
      psPrivateUniforms.add(Type.FILENAME, HW.T_AMB_OCC_MAP)
      psPrivateUniforms.add(Type.FLOAT, HW.T_AMB_OCC_GAIN, Value.createValue(1.0))
    }

    // Add uniforms for environment lighting.
    if (
      this.requiresLighting(graph) &&
      context.getOptions().hwSpecularEnvironmentMethod !== HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_NONE
    ) {
      const yRotationPI = Matrix44.createScale(new Vector3(-1, 1, -1))
      psPrivateUniforms.add(Type.MATRIX44, HW.T_ENV_MATRIX, Value.createValue(yRotationPI))
      psPrivateUniforms.add(Type.FILENAME, HW.ENV_RADIANCE) // Direct value instead of HW.T_ENV_RADIANCE
      psPrivateUniforms.add(Type.FLOAT, HW.T_ENV_LIGHT_INTENSITY, Value.createValue(1.0))
      psPrivateUniforms.add(Type.INTEGER, HW.T_ENV_RADIANCE_MIPS, Value.createValue(1, 'integer'))
      psPrivateUniforms.add(Type.INTEGER, HW.T_ENV_RADIANCE_SAMPLES, Value.createValue(16, 'integer'))
      psPrivateUniforms.add(Type.FILENAME, HW.ENV_IRRADIANCE) // Direct value instead of HW.T_ENV_IRRADIANCE
      psPrivateUniforms.add(Type.BOOLEAN, HW.T_REFRACTION_TWO_SIDED)
    }

    // Add uniforms for the directional albedo table.
    if (
      context.getOptions().hwDirectionalAlbedoMethod === HwDirectionalAlbedoMethod.DIRECTIONAL_ALBEDO_TABLE ||
      context.getOptions().hwWriteAlbedoTable
    ) {
      psPrivateUniforms.add(Type.FILENAME, HW.T_ALBEDO_TABLE)
      psPrivateUniforms.add(Type.INTEGER, HW.T_ALBEDO_TABLE_SIZE, Value.createValue(64, 'integer'))
    }

    // Add uniforms for environment prefiltering.
    if (context.getOptions().hwWriteEnvPrefilter) {
      psPrivateUniforms.add(Type.FILENAME, HW.ENV_RADIANCE)
      psPrivateUniforms.add(Type.FLOAT, HW.T_ENV_LIGHT_INTENSITY, Value.createValue(1.0))
      psPrivateUniforms.add(Type.INTEGER, HW.T_ENV_PREFILTER_MIP, Value.createValue(1, 'integer'))
      const yRotationPI = Matrix44.createScale(new Vector3(-1, 1, -1))
      psPrivateUniforms.add(Type.MATRIX44, HW.T_ENV_MATRIX, Value.createValue(yRotationPI))
      psPrivateUniforms.add(Type.INTEGER, HW.T_ENV_RADIANCE_MIPS, Value.createValue(1, 'integer'))
    }

    // Create uniforms for the published graph interface, for inputs that
    // are connected internally and editable by users.
    for (const inputSocket of graph.getInputSockets()) {
      if (inputSocket.getConnections().length > 0 && graph.isEditable(inputSocket)) {
        psPublicUniforms.addPort(inputSocket)
      }
    }

    // Add the pixel stage output. This needs to be a color4 for rendering,
    // copying name and variable from the graph output with type color4.
    const outputSocket = graph.getOutputSocket()!
    const output = psOutputs.add(Type.COLOR4, outputSocket.getName())
    output.setVariable(outputSocket.getVariable())
    output.setPath(outputSocket.getPath())

    // Create shader variables for all nodes that need them.
    this.createVariables(graph, context, shader)

    const lightShaders = context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)

    // For surface shaders we need light shaders.
    if (lightShaders && graph.hasClassification(ShaderNodeClassification.SHADER | ShaderNodeClassification.SURFACE)) {
      for (const node of lightShaders.getAll().values()) {
        node.getImplementation().createVariables(node, context, shader)
      }
    }

    // For image textures, filenames are converted into uniforms (texture
    // samplers): any unconnected filename input on file texture nodes gets
    // a corresponding uniform.
    const graphStack: ShaderGraph[] = [graph]
    if (lightShaders) {
      for (const node of lightShaders.getAll().values()) {
        const lightGraph = node.getImplementation().getGraph()
        if (lightGraph) {
          graphStack.push(lightGraph)
        }
      }
    }

    while (graphStack.length > 0) {
      const g = graphStack.pop()!

      for (const node of g.getNodes()) {
        if (node.hasClassification(ShaderNodeClassification.FILETEXTURE)) {
          for (const input of node.getInputs()) {
            if (!input.getConnection() && input.getType().equals(Type.FILENAME)) {
              // Create the uniform using the filename type to make it a
              // texture sampler.
              const filename = psPublicUniforms.add(Type.FILENAME, input.getVariable(), input.getValue())
              filename.setPath(input.getPath())

              // Assign the uniform name to the input value for reference
              // during code generation.
              input.setValue(Value.createValue(input.getVariable()))
            }
          }
        }
        // Push subgraphs onto the stack to process them as well.
        const subgraph = node.getImplementation().getGraph()
        if (subgraph) {
          graphStack.push(subgraph)
        }
      }
    }

    if (context.getOptions().hwTransparency) {
      // Flag the shader as being transparent.
      shader.setAttribute(HW.ATTR_TRANSPARENT)
    }

    return shader
  }

  // Whether code to support direct lighting should be emitted. By default
  // lighting is required for shader-classified or BSDF graphs.
  requiresLighting(graph: ShaderGraph): boolean {
    const isBsdf = graph.hasClassification(ShaderNodeClassification.BSDF)
    const isLitSurfaceShader =
      graph.hasClassification(ShaderNodeClassification.SHADER) &&
      graph.hasClassification(ShaderNodeClassification.SURFACE) &&
      !graph.hasClassification(ShaderNodeClassification.UNLIT)
    return isBsdf || isLitSurfaceShader
  }

  // Bind a light shader to a light type id, for usage in surface shaders
  // created by the generator.
  static bindLightShader(nodeDef: NodeDef, lightTypeId: number, context: GenContext): void {
    if (context.getTypeDesc(nodeDef.getType()).notEquals(Type.LIGHTSHADER)) {
      throw new ExceptionShaderGenError(
        `Error binding light shader. Given nodedef '${nodeDef.getName()}' is not of lightshader type`,
      )
    }

    let lightShaders = context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)
    if (!lightShaders) {
      lightShaders = HwLightShaders.create()
      context.pushUserData(HW.USER_DATA_LIGHT_SHADERS, lightShaders)
    }

    if (lightShaders.get(lightTypeId)) {
      throw new ExceptionShaderGenError(
        `Error binding light shader. Light type id '${lightTypeId}' has already been bound`,
      )
    }

    const shader = ShaderNode.create(null, nodeDef.getNodeString(), nodeDef, context)

    // For graph implementations, prepend the light struct instance name on
    // all input socket variables, since in generated code these inputs are
    // members of the light struct.
    const graph = shader.getImplementation().getGraph()
    if (graph) {
      for (const inputSocket of graph.getInputSockets()) {
        inputSocket.setVariable('light.' + inputSocket.getName())
      }
    }

    lightShaders.bind(lightTypeId, shader)
  }

  // Unbind a light shader previously bound to the given light type id.
  static unbindLightShader(lightTypeId: number, context: GenContext): void {
    context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)?.unbind(lightTypeId)
  }

  // Unbind all light shaders previously bound.
  static unbindLightShaders(context: GenContext): void {
    context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)?.clear()
  }

  override nodeNeedsClosureData(node: ShaderNode): boolean {
    return (
      node.hasClassification(ShaderNodeClassification.BSDF) ||
      node.hasClassification(ShaderNodeClassification.EDF) ||
      node.hasClassification(ShaderNodeClassification.VDF)
    )
  }

  // Emit code for active light count definitions and uniforms.
  addStageLightingUniforms(context: GenContext, stage: ShaderStage): void {
    if (context.getOptions().hwMaxActiveLightSources > 0) {
      const numActiveLights = addStageUniform(HW.PRIVATE_UNIFORMS, Type.INTEGER, HW.T_NUM_ACTIVE_LIGHT_SOURCES, stage)
      numActiveLights.setValue(Value.createValue(0, 'integer'))
    }
  }

  override createShaderNodeImplForNodeGraph(nodegraph: NodeGraph): ShaderNodeImpl {
    const outputs = nodegraph.getActiveOutputs()
    if (outputs.length === 0) {
      throw new ExceptionShaderGenError(`NodeGraph '${nodegraph.getName()}' has no outputs defined`)
    }

    const outputType = this._typeSystem.getType(outputs[0]!.getType())

    // Use specialized implementations for light shader and material graphs.
    if (outputType.equals(Type.LIGHTSHADER)) {
      return HwLightCompoundNode.create()
    }
    if (outputType.equals(Type.MATERIAL)) {
      return HwMaterialCompoundNode.create()
    }

    return CompoundNode.create()
  }

  override emitClosureDataArg(node: ShaderNode, _context: GenContext, stage: ShaderStage): void {
    if (this.nodeNeedsClosureData(node)) {
      this.emitString(HW.CLOSURE_DATA_ARG + ', ', stage)
    }
  }

  override emitClosureDataParameter(node: ShaderNode, _context: GenContext, stage: ShaderStage): void {
    if (this.nodeNeedsClosureData(node)) {
      this.emitString(HW.CLOSURE_DATA_TYPE + ' ' + HW.CLOSURE_DATA_ARG + ', ', stage)
    }
  }

  // Determine the prefix of vertex data variables. Derived classes must
  // implement this.
  getVertexDataPrefix(_vertexData: VariableBlock): string {
    throw new ExceptionShaderGenError('getVertexDataPrefix must be implemented by HW generators')
  }

  // Promote a variable expression to vec4 for output assignment.
  protected toVec4(type: TypeDesc, variable: string): string {
    const vec4 = this._syntax.getTypeName(Type.VECTOR4)

    if (type.isFloat3()) {
      return vec4 + '(' + variable + ', 1.0)'
    } else if (type.isFloat2()) {
      return vec4 + '(' + variable + ', 0.0, 1.0)'
    } else if (type.equals(Type.FLOAT) || type.equals(Type.INTEGER) || type.equals(Type.BOOLEAN)) {
      return vec4 + '(' + variable + ', ' + variable + ', ' + variable + ', 1.0)'
    } else if (type.equals(Type.BSDF) || type.equals(Type.EDF)) {
      return vec4 + '(' + variable + ', 1.0)'
    }
    // Other types are not understood; return black.
    return vec4 + '(0.0, 0.0, 0.0, 1.0)'
  }
}
