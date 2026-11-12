// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/HwResourceBindingContext.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/HwResourceBindingContext.h

import { GenUserData, type GenContext, type ShaderStage, type VariableBlock } from '@mtlx/genshader'
import { EMPTY_STRING } from '@mtlx/core'

// Class representing a context for resource binding for hardware resources.
export abstract class HwResourceBindingContext extends GenUserData {
  // Initialize the context before generation starts.
  abstract initialize(): void

  // Emit directives required for binding support.
  abstract emitDirectives(context: GenContext, stage: ShaderStage): void

  // Emit uniforms with binding information.
  abstract emitResourceBindings(context: GenContext, uniforms: VariableBlock, stage: ShaderStage): void

  // Emit struct uniforms with binding information.
  abstract emitStructuredResourceBindings(
    context: GenContext,
    uniforms: VariableBlock,
    stage: ShaderStage,
    structInstanceName: string,
    arraySuffix?: typeof EMPTY_STRING | string,
  ): void
}
