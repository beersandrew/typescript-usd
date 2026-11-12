// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/EsslSyntax.h,
//  source/MaterialXGenGlsl/EsslSyntax.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/EsslSyntax.h and .cpp

import { TypeSystem } from '@mtlx/genshader'
import { GlslSyntax } from './glslSyntax.ts'

// Syntax class for ESSL (OpenGL ES Shading Language)
export class EsslSyntax extends GlslSyntax {
  static override create(typeSystem: TypeSystem): EsslSyntax {
    return new EsslSyntax(typeSystem)
  }
}
