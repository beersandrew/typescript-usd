// Ported from MaterialX 1.39.5:
//  source/MaterialXGenShader/ColorManagementSystem.h,
//  source/MaterialXGenShader/ColorManagementSystem.cpp,
//  source/MaterialXGenShader/DefaultColorManagementSystem.h,
//  source/MaterialXGenShader/DefaultColorManagementSystem.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ColorManagementSystem.h/.cpp and
// DefaultColorManagementSystem.h/.cpp

import { Document, NodeDef } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { Type, TypeDesc } from './typeDesc.ts'
import { ShaderNode } from './shaderNode.ts'
import { ShaderNodeImpl } from './shaderNodeImpl.ts'
import type { GenContext } from './genContext.ts'
import type { ShaderGraph } from './shaderGraph.ts'

// Structure that represents color space transform information.
export interface ColorSpaceTransform {
  sourceSpace: string
  targetSpace: string
  type: TypeDesc
}

// Create a validated ColorSpaceTransform (mirrors the C++ constructor).
export function makeColorSpaceTransform(sourceSpace: string, targetSpace: string, type: TypeDesc): ColorSpaceTransform {
  if (type.notEquals(Type.COLOR3) && type.notEquals(Type.COLOR4)) {
    throw new ExceptionShaderGenError('Color space transform can only be a color3 or color4.')
  }
  return { sourceSpace, targetSpace, type }
}

// Abstract base class for color management systems.
export abstract class ColorManagementSystem {
  protected _document: Document | null = null

  // Return the ColorManagementSystem name.
  abstract getName(): string

  // Load a library of implementations from the provided document, replacing
  // any previously loaded content.
  loadLibrary(document: Document): void {
    this._document = document
  }

  // Returns whether this color management system supports a transform.
  supportsTransform(transform: ColorSpaceTransform): boolean {
    if (!this._document) {
      throw new ExceptionShaderGenError('No library loaded for color management system')
    }
    return this.getNodeDef(transform) !== null
  }

  // Create a node to perform the given color space transformation.
  createNode(parent: ShaderGraph | null, transform: ColorSpaceTransform, name: string, context: GenContext): ShaderNode | null {
    const nodeDef = this.getNodeDef(transform)
    if (!nodeDef) {
      throw new ExceptionShaderGenError(
        `No nodedef found for transform: ('${transform.sourceSpace}', '${transform.targetSpace}').`,
      )
    }

    return ShaderNode.create(parent, name, nodeDef, context)
  }

  // Returns true if the CMS can create a shader node implementation for a
  // locally managed CMS transform.
  hasImplementation(_implName: string): boolean {
    return false
  }

  // Create a CMS node implementation for a locally managed transform.
  createImplementation(_implName: string): ShaderNodeImpl | null {
    return null
  }

  // Returns a nodedef for a given transform.
  protected abstract getNodeDef(transform: ColorSpaceTransform): NodeDef | null
}

const CMS_NAME = 'default_cms'

// Remap from legacy color space names to their ACES 1.2 equivalents, plus
// the 1.39 ASWF color-interop namespace remapping.
const COLOR_SPACE_REMAP = new Map<string, string>([
  ['gamma18', 'g18_rec709'],
  ['gamma22', 'g22_rec709'],
  ['gamma24', 'rec709_display'],
  ['lin_ap1', 'acescg'],
  ['lin_ap1_scene', 'acescg'],
  ['lin_rec709_scene', 'lin_rec709'],
  ['lin_p3d65_scene', 'lin_displayp3'],
  ['lin_adobergb_scene', 'lin_adobergb'],
  ['srgb_rec709_scene', 'srgb_texture'],
  ['g22_rec709_scene', 'g22_rec709'],
  ['g18_rec709_scene', 'g18_rec709'],
  ['g22_ap1_scene', 'g22_ap1'],
  ['srgb_p3d65_scene', 'srgb_displayp3'],
  ['g22_adobergb_scene', 'adobergb'],
])

// Class for a default color management system.
export class DefaultColorManagementSystem extends ColorManagementSystem {
  private _target: string

  protected constructor(target: string) {
    super()
    this._target = target
  }

  // Create a new DefaultColorManagementSystem.
  static create(target: string): DefaultColorManagementSystem {
    return new DefaultColorManagementSystem(target)
  }

  override getName(): string {
    return CMS_NAME
  }

  protected override getNodeDef(transform: ColorSpaceTransform): NodeDef | null {
    if (!this._document) {
      throw new ExceptionShaderGenError('No library loaded for color management system')
    }

    const sourceSpace = COLOR_SPACE_REMAP.get(transform.sourceSpace) ?? transform.sourceSpace
    const targetSpace = COLOR_SPACE_REMAP.get(transform.targetSpace) ?? transform.targetSpace
    const nodeName = sourceSpace + '_to_' + targetSpace

    for (const nodeDef of this._document.getMatchingNodeDefs(nodeName)) {
      for (const output of nodeDef.getOutputs()) {
        if (output.getType() === transform.type.getName()) {
          return nodeDef
        }
      }
    }
    return null
  }
}
