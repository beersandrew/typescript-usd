// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwSurfaceNode.h,
//  source/MaterialXGenHw/Nodes/HwSurfaceNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwSurfaceNode.h and .cpp

import {
  HwTransmissionRenderMethod,
  ShaderNodeClassification,
  Stage,
  Type,
  addStageConnector,
  addStageInput,
  addStageUniform,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW, VEC3_ONE, VEC3_ZERO } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

const INPUT_BSDF = 'bsdf'
const INPUT_EDF = 'edf'
const INPUT_OPACITY = 'opacity'

// Surface node implementation for hardware languages.
export class HwSurfaceNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwSurfaceNode()
  }

  // Return the name of the BSDF input on the node.
  protected getBsdfInputName(): string {
    return INPUT_BSDF
  }

  // Return the name of the EDF input on the node.
  protected getEdfInputName(): string {
    return INPUT_EDF
  }

  // Return the name of the opacity input on the node.
  protected getOpacityInputName(): string {
    return INPUT_OPACITY
  }

  override createVariables(_node: ShaderNode, context: GenContext, shader: Shader): void {
    // TODO:
    // The surface shader needs position, normal, view position and light sources. We should solve this by adding some
    // dependency mechanism so this implementation can be set to depend on the HwPositionNode, HwNormalNode
    // HwViewDirectionNode and LightNodeGlsl nodes instead? This is where the MaterialX attribute "internalgeomprops"
    // is needed.
    //
    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_POSITION, vs)
    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_NORMAL, vs)
    addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX, vs)

    addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_POSITION_WORLD, vs, ps)
    addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_NORMAL_WORLD, vs, ps)

    addStageUniform(HW.PRIVATE_UNIFORMS, Type.VECTOR3, HW.T_VIEW_POSITION, ps)

    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    shadergen.addStageLightingUniforms(context, ps)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    const syntax = shadergen.getSyntax()

    const vec2 = syntax.getTypeName(Type.VECTOR2)
    const vec3 = syntax.getTypeName(Type.VECTOR3)
    const vec3Zero = syntax.getValueOfType(Type.VECTOR3, VEC3_ZERO)
    const vec3One = syntax.getValueOfType(Type.VECTOR3, VEC3_ONE)

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const position = vertexData.getItem(HW.T_POSITION_WORLD)
      if (!position.isEmitted()) {
        position.setEmitted()
        shadergen.emitLine(prefix + position.getVariable() + ' = hPositionWorld.xyz', stage)
      }
      const normal = vertexData.getItem(HW.T_NORMAL_WORLD)
      if (!normal.isEmitted()) {
        normal.setEmitted()
        shadergen.emitLine(
          prefix +
            normal.getVariable() +
            ' = normalize(mx_matrix_mul(' +
            HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX +
            ', ' +
            syntax.getTypeName(Type.VECTOR4) +
            '(' +
            HW.T_IN_NORMAL +
            ', 0)).xyz)',
          stage,
        )
      }
      if (context.getOptions().hwAmbientOcclusion) {
        const texcoord = vertexData.getItem(HW.T_TEXCOORD + '_0')
        if (!texcoord.isEmitted()) {
          texcoord.setEmitted()
          shadergen.emitLine(prefix + texcoord.getVariable() + ' = ' + HW.T_IN_TEXCOORD + '_0', stage)
        }
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)

      // Declare the output variable
      const output = node.getOutput()!
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(output, true, true, context, stage)
      shadergen.emitLineEnd(stage)

      shadergen.emitScopeBegin(stage)

      shadergen.emitLine(vec3 + ' N = normalize(' + prefix + HW.T_NORMAL_WORLD + ')', stage)
      shadergen.emitLine(
        vec3 + ' V = normalize(' + HW.T_VIEW_POSITION + ' - ' + prefix + HW.T_POSITION_WORLD + ')',
        stage,
      )
      shadergen.emitLine(vec3 + ' P = ' + prefix + HW.T_POSITION_WORLD, stage)
      shadergen.emitLine(vec3 + ' L = ' + vec3Zero, stage)
      shadergen.emitLine('float occlusion = 1.0', stage)
      shadergen.emitLineBreak(stage)

      const outColor = output.getVariable() + '.color'
      const outTransparency = output.getVariable() + '.transparency'

      const bsdfInput = node.getInput(this.getBsdfInputName())
      if (bsdfInput) {
        const bsdf = bsdfInput.getConnectedSibling()
        if (bsdf) {
          shadergen.emitLineBegin(stage)
          shadergen.emitString('float surfaceOpacity = ', stage)
          shadergen.emitInput(node.getInput(this.getOpacityInputName())!, context, stage)
          shadergen.emitLineEnd(stage)
          shadergen.emitLineBreak(stage)

          //
          // Handle direct lighting
          //
          shadergen.emitComment('Shadow occlusion', stage)
          if (context.getOptions().hwShadowMap) {
            shadergen.emitLine(
              'occlusion = mx_shadow_occlusion(' +
                HW.T_SHADOW_MAP +
                ', ' +
                HW.T_SHADOW_MATRIX +
                ', ' +
                prefix +
                HW.T_POSITION_WORLD +
                ')',
              stage,
            )
          }
          shadergen.emitLineBreak(stage)

          this.emitLightLoop(node, context, stage, outColor)

          //
          // Handle indirect lighting.
          //
          shadergen.emitComment('Ambient occlusion', stage)
          if (context.getOptions().hwAmbientOcclusion) {
            const texcoord = vertexData.getItem(HW.T_TEXCOORD + '_0')
            shadergen.emitLine(vec2 + ' ambOccUv = ' + prefix + texcoord.getVariable(), stage)
            if (context.getOptions().fileTextureVerticalFlip) {
              shadergen.emitLine('ambOccUv = ' + vec2 + '(ambOccUv.x, 1.0 - ambOccUv.y)', stage)
            }
            shadergen.emitLine(
              'occlusion = mix(1.0, texture(' + HW.T_AMB_OCC_MAP + ', ambOccUv).x, ' + HW.T_AMB_OCC_GAIN + ')',
              stage,
            )
          } else {
            shadergen.emitLine('occlusion = 1.0', stage)
          }
          shadergen.emitLineBreak(stage)

          shadergen.emitComment('Add environment contribution', stage)
          shadergen.emitScopeBegin(stage)

          // indirect lighting
          if (bsdf.hasClassification(ShaderNodeClassification.BSDF_R)) {
            shadergen.emitLine('ClosureData closureData = makeClosureData(CLOSURE_TYPE_INDIRECT, L, V, N, P, occlusion)', stage)
            shadergen.emitFunctionCall(bsdf, context, stage)
          } else {
            shadergen.emitLineBegin(stage)
            shadergen.emitOutput(bsdf.getOutput()!, true, true, context, stage)
            shadergen.emitLineEnd(stage)
          }

          shadergen.emitLineBreak(stage)
          shadergen.emitLine(outColor + ' += occlusion * ' + bsdf.getOutput()!.getVariable() + '.response', stage)
          shadergen.emitScopeEnd(stage)
          shadergen.emitLineBreak(stage)
        }
      }

      //
      // Handle surface emission.
      //
      const edfInput = node.getInput(this.getEdfInputName())
      if (edfInput) {
        const edf = edfInput.getConnectedSibling()
        if (edf) {
          shadergen.emitComment('Add surface emission', stage)
          shadergen.emitScopeBegin(stage)

          if (edf.hasClassification(ShaderNodeClassification.EDF)) {
            shadergen.emitLine('ClosureData closureData = makeClosureData(CLOSURE_TYPE_EMISSION, L, V, N, P, occlusion)', stage)
            shadergen.emitFunctionCall(edf, context, stage)
          } else {
            shadergen.emitLineBegin(stage)
            shadergen.emitOutput(edf.getOutput()!, true, true, context, stage)
            shadergen.emitLineEnd(stage)
          }

          shadergen.emitLine(outColor + ' += ' + edf.getOutput()!.getVariable(), stage)
          shadergen.emitScopeEnd(stage)
          shadergen.emitLineBreak(stage)
        }
      }

      //
      // Handle surface transmission and opacity.
      //
      const bsdfInput2 = node.getInput(this.getBsdfInputName())
      if (bsdfInput2) {
        const bsdf = bsdfInput2.getConnectedSibling()
        if (bsdf) {
          shadergen.emitComment('Calculate the BSDF transmission for viewing direction', stage)
          if (
            bsdf.hasClassification(ShaderNodeClassification.BSDF_T) ||
            bsdf.hasClassification(ShaderNodeClassification.VDF)
          ) {
            shadergen.emitLine('ClosureData closureData = makeClosureData(CLOSURE_TYPE_TRANSMISSION, L, V, N, P, occlusion)', stage)
            shadergen.emitFunctionCall(bsdf, context, stage)
          } else {
            shadergen.emitLineBegin(stage)
            shadergen.emitOutput(bsdf.getOutput()!, true, true, context, stage)
            shadergen.emitLineEnd(stage)
          }

          if (context.getOptions().hwTransmissionRenderMethod === HwTransmissionRenderMethod.TRANSMISSION_REFRACTION) {
            shadergen.emitLine(outColor + ' += ' + bsdf.getOutput()!.getVariable() + '.response', stage)
          } else {
            shadergen.emitLine(outTransparency + ' += ' + bsdf.getOutput()!.getVariable() + '.response', stage)
          }

          shadergen.emitLineBreak(stage)
          shadergen.emitComment('Compute and apply surface opacity', stage)
          shadergen.emitScopeBegin(stage)
          shadergen.emitLine(outColor + ' *= surfaceOpacity', stage)
          shadergen.emitLine(outTransparency + ' = mix(' + vec3One + ', ' + outTransparency + ', surfaceOpacity)', stage)
          shadergen.emitScopeEnd(stage)
        }
      }

      shadergen.emitScopeEnd(stage)
      shadergen.emitLineBreak(stage)
    }
  }

  // Emit the light loop if requested.
  emitLightLoop(node: ShaderNode, context: GenContext, stage: ShaderStage, outColor: string): void {
    //
    // Generate Light loop if requested
    //
    if (context.getOptions().hwMaxActiveLightSources > 0) {
      const shadergen = context.getShaderGenerator() as HwShaderGenerator
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)

      const bsdfInput = node.getInput(this.getBsdfInputName())
      const bsdf = bsdfInput ? bsdfInput.getConnectedSibling() : null
      if (!bsdf) {
        return
      }

      shadergen.emitComment('Light loop', stage)
      shadergen.emitLine('int numLights = numActiveLightSources()', stage)
      shadergen.emitLine('lightshader lightShader', stage)
      shadergen.emitLine('for (int activeLightIndex = 0; activeLightIndex < numLights; ++activeLightIndex)', stage, false)

      shadergen.emitScopeBegin(stage)

      shadergen.emitLine(
        'sampleLightSource(' +
          HW.T_LIGHT_DATA_INSTANCE +
          '[activeLightIndex], ' +
          prefix +
          HW.T_POSITION_WORLD +
          ', lightShader)',
        stage,
      )
      shadergen.emitLine('L = lightShader.direction', stage)
      shadergen.emitLineBreak(stage)

      shadergen.emitComment('Calculate the BSDF response for this light source', stage)
      if (bsdf.hasClassification(ShaderNodeClassification.BSDF_R)) {
        shadergen.emitLine('ClosureData closureData = makeClosureData(CLOSURE_TYPE_REFLECTION, L, V, N, P, occlusion)', stage)
        shadergen.emitFunctionCall(bsdf, context, stage)
      } else {
        shadergen.emitLineBegin(stage)
        shadergen.emitOutput(bsdf.getOutput()!, true, true, context, stage)
        shadergen.emitLineEnd(stage)
      }

      shadergen.emitLineBreak(stage)

      shadergen.emitComment("Accumulate the light's contribution", stage)
      shadergen.emitLine(outColor + ' += lightShader.intensity * ' + bsdf.getOutput()!.getVariable() + '.response', stage)

      shadergen.emitLineBreak(stage)

      shadergen.emitComment('Clear shadow factor for next light', stage)
      shadergen.emitLine('occlusion = 1.0', stage)

      shadergen.emitScopeEnd(stage)
      shadergen.emitLineBreak(stage)
    }
  }
}
