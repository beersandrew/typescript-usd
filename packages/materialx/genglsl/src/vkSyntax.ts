// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/VkSyntax.h,
//  source/MaterialXGenGlsl/VkSyntax.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/VkSyntax.h and .cpp (MaterialX v1.39.5).

import { TypeSystem } from '@mtlx/genshader'
import { GlslSyntax } from './glslSyntax.ts'

// Syntax class for Vulkan GLSL
export class VkSyntax extends GlslSyntax {
  static override create(typeSystem: TypeSystem): VkSyntax {
    return new VkSyntax(typeSystem)
  }

  override getInputQualifier(): string {
    return GlslSyntax.INPUT_QUALIFIER
  }
}
