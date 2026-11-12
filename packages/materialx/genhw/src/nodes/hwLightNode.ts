// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwLightNode.h,
//  source/MaterialXGenHw/Nodes/HwLightNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwLightNode.h and .cpp

import { Value, Vector3, type TypedValue } from '@mtlx/core'
import {
  Stage,
  Type,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW, VEC3_ZERO } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// Light node implementation for hardware languages.
export class HwLightNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwLightNode()
  }

  override createVariables(_node: ShaderNode, context: GenContext, shader: Shader): void {
    const ps = shader.getStage(Stage.PIXEL)

    // Create uniform for intensity, exposure and direction
    const lightUniforms = ps.getUniformBlock(HW.LIGHT_DATA)
    lightUniforms.add(Type.FLOAT, 'intensity', Value.createValue(1.0))
    lightUniforms.add(Type.FLOAT, 'exposure', Value.createValue(0.0))
    lightUniforms.add(Type.VECTOR3, 'direction', Value.createValue(new Vector3(0.0, 1.0, 0.0)))

    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    shadergen.addStageLightingUniforms(context, ps)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator() as HwShaderGenerator
      const syntax = shadergen.getSyntax()

      const vec3 = syntax.getTypeName(Type.VECTOR3)
      const vec3Zero = syntax.getValueOfType(Type.VECTOR3, VEC3_ZERO)

      shadergen.emitLine(vec3 + ' L = light.position - position', stage)
      shadergen.emitLine('float distance = length(L)', stage)
      shadergen.emitLine('L /= distance', stage)
      shadergen.emitLine('result.direction = L', stage)
      shadergen.emitLineBreak(stage)

      const edfInput = node.getInput('edf')!
      const edf = edfInput.getConnectedSibling()
      if (edf) {
        shadergen.emitScopeBegin(stage)
        shadergen.emitLine(
          'ClosureData closureData = makeClosureData(CLOSURE_TYPE_EMISSION, ' +
            vec3Zero +
            ', -L, light.direction, ' +
            vec3Zero +
            ', 0.0)',
          stage,
        )
        shadergen.emitFunctionCall(edf, context, stage)

        // DIVERGENCE from upstream: upstream closes the scope here and then
        // references the EDF output variable, which is declared inside the
        // scope — the emitted code never compiles (upstream's render tests
        // do not exercise this node). The intensity lines are kept inside
        // the scope instead, mirroring the pattern HwSurfaceNode uses for
        // its BSDF/EDF scopes.
        shadergen.emitComment('Apply quadratic falloff and adjust intensity', stage)
        shadergen.emitLine('result.intensity = ' + edf.getOutput()!.getVariable() + ' / (distance * distance)', stage)

        const intensity = node.getInput('intensity')!
        const exposure = node.getInput('exposure')!

        shadergen.emitLineBegin(stage)
        shadergen.emitString('result.intensity *= ', stage)
        shadergen.emitInput(intensity, context, stage)
        shadergen.emitLineEnd(stage)

        // Emit exposure adjustment only if it matters
        if (
          exposure.getConnection() ||
          (exposure.getValue() && ((exposure.getValue() as TypedValue).getData() as number) !== 0.0)
        ) {
          shadergen.emitLineBegin(stage)
          // DIVERGENCE from upstream: `pow(2, ...)` and a `0` occlusion arg are
          // emitted upstream; ESSL 3.00 has no implicit int->float conversion.
          shadergen.emitString('result.intensity *= pow(2.0, ', stage)
          shadergen.emitInput(exposure, context, stage)
          shadergen.emitString(')', stage)
          shadergen.emitLineEnd(stage)
        }

        shadergen.emitScopeEnd(stage)
        shadergen.emitLineBreak(stage)
      } else {
        shadergen.emitLine('result.intensity = ' + vec3Zero, stage)
      }
    }
  }
}
