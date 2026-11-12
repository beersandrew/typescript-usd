// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwImageNode.h,
//  source/MaterialXGenHw/Nodes/HwImageNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwImageNode.h and .cpp

import {
  Document,
  Node,
  TypedValue,
  UDIM_SET_PROPERTY,
  UDIM_TOKEN,
  Value,
  Vector2,
} from '@mtlx/core'
import {
  SourceCodeNode,
  Type,
  getUdimCoordinates,
  getUdimScaleAndOffset,
  type GenContext,
  type ShaderNode,
  type ShaderNodeImpl,
} from '@mtlx/genshader'

// Additional implementation arguments for image nodes
const UV_SCALE = 'uv_scale'
const UV_OFFSET = 'uv_offset'

// Extending the SourceCodeNode with requirements for image nodes.
export class HwImageNode extends SourceCodeNode {
  static override create(): ShaderNodeImpl {
    return new HwImageNode()
  }

  override addInputs(node: ShaderNode, _context: GenContext): void {
    // Add additional scale and offset inputs to match implementation arguments
    let input = node.addInput(UV_SCALE, Type.VECTOR2)
    input.setValue(Value.createValue(new Vector2(1.0, 1.0)))
    input = node.addInput(UV_OFFSET, Type.VECTOR2)
    input.setValue(Value.createValue(new Vector2(0.0, 0.0)))
  }

  override setValues(node: Node, shaderNode: ShaderNode, context: GenContext): void {
    // Remap uvs to normalized 0..1 space if the original UDIMs in a UDIM set
    // have been mapped to a single texture atlas which must be accessed in 0..1 space.
    if (context.getOptions().hwNormalizeUdimTexCoords) {
      const file = node.getInput('file')
      if (file) {
        // set the uv scale and offset properly.
        const fileName = file.getValueString()
        if (fileName.includes(UDIM_TOKEN)) {
          const udimSetValue = (node.getDocument() as Document).getGeomPropValue(UDIM_SET_PROPERTY)
          if (udimSetValue && udimSetValue.isA('stringarray')) {
            const udimIdentifiers = (udimSetValue as TypedValue).getData() as string[]
            const udimCoordinates = getUdimCoordinates(udimIdentifiers)

            const scaleUV = new Vector2(1.0, 1.0)
            const offsetUV = new Vector2(0.0, 0.0)
            getUdimScaleAndOffset(udimCoordinates, scaleUV, offsetUV)

            let input = shaderNode.getInput(UV_SCALE)
            if (input) {
              input.setValue(Value.createValue(scaleUV))
            }
            input = shaderNode.getInput(UV_OFFSET)
            if (input) {
              input.setValue(Value.createValue(offsetUV))
            }
          }
        }
      }
    }
  }
}
