// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwMaterialCompoundNode.h,
//  source/MaterialXGenHw/Nodes/HwMaterialCompoundNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwMaterialCompoundNode.h and .cpp

import { Node, NodeGraph, type InterfaceElement } from '@mtlx/core'
import {
  ShaderNodeClassification,
  type GenContext,
  type ShaderNode,
  type ShaderNodeImpl,
} from '@mtlx/genshader'
import { HwSurfaceNode } from './hwSurfaceNode.ts'

const MATERIAL_TYPE = 'material'
const SURFACE_CATEGORY = 'surface'

// MaterialCompound node implementation for hardware languages.
// Used for nodegraphs that output material type, such as LamaSurface.
export class HwMaterialCompoundNode extends HwSurfaceNode {
  private _bsdfInputName = ''
  private _edfInputName = ''
  private _opacityInputName = ''

  static create(): ShaderNodeImpl {
    return new HwMaterialCompoundNode()
  }

  override initialize(element: InterfaceElement, context: GenContext): void {
    super.initialize(element, context)

    if (!(element instanceof NodeGraph)) {
      return
    }

    // Find the material-type output and traverse upstream to discover the
    // surface node, reading its bsdf/edf/opacity interface name mappings.
    for (const output of element.getOutputs()) {
      if (output.getType() === MATERIAL_TYPE) {
        for (const edge of output.traverseGraph()) {
          const upstream = edge.getUpstreamElement()
          const upstreamNode = upstream ? upstream.asA(Node) : null
          if (upstreamNode && upstreamNode.getCategory() === SURFACE_CATEGORY) {
            const bsdfIn = upstreamNode.getInput('bsdf')
            if (bsdfIn && bsdfIn.getInterfaceName() !== '') {
              this._bsdfInputName = bsdfIn.getInterfaceName()
            }

            const edfIn = upstreamNode.getInput('edf')
            if (edfIn && edfIn.getInterfaceName() !== '') {
              this._edfInputName = edfIn.getInterfaceName()
            }

            const opacityIn = upstreamNode.getInput('opacity')
            if (opacityIn && opacityIn.getInterfaceName() !== '') {
              this._opacityInputName = opacityIn.getInterfaceName()
            }

            return
          }
        }
      }
    }
  }

  override addClassification(node: ShaderNode): void {
    // Add SHADER|SURFACE so the top-level graph triggers the
    // surface shader code path in the HW pixel shader generators.
    node.addClassification(ShaderNodeClassification.SHADER | ShaderNodeClassification.SURFACE)
  }

  protected override getBsdfInputName(): string {
    return this._bsdfInputName
  }

  protected override getEdfInputName(): string {
    return this._edfInputName
  }

  protected override getOpacityInputName(): string {
    return this._opacityInputName
  }
}
