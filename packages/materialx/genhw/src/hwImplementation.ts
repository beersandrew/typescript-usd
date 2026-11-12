// Ported from MaterialX 1.39.5: source/MaterialXGenHw/HwImplementation.h,
//  source/MaterialXGenHw/HwImplementation.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/HwImplementation.h and .cpp

import { ShaderNodeImpl, type ShaderInput, type ShaderOutput } from '@mtlx/genshader'

// When node inputs with these names are modified, the associated HW shader
// must be recompiled.
const IMMUTABLE_INPUTS = new Set(['index', 'space', 'attrname'])

// Base class for HW node implementations.
export class HwImplementation extends ShaderNodeImpl {
  // Integer identifiers for coordinate spaces. The order must match the
  // order given for the space enum string in stdlib.
  static readonly MODEL_SPACE = 0
  static readonly OBJECT_SPACE = 1
  static readonly WORLD_SPACE = 2

  // Internal string constants.
  static readonly SPACE = 'space'
  static readonly INDEX = 'index'
  static readonly GEOMPROP = 'geomprop'

  override isEditable(input: ShaderInput | ShaderOutput): boolean {
    return !IMMUTABLE_INPUTS.has(input.getName())
  }
}
