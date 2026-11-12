// Ported from MaterialX 1.39.5: source/MaterialXGenShader/Exception.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Exception.h

import { Exception } from '@mtlx/core'

// An exception that is thrown when shader generation fails.
export class ExceptionShaderGenError extends Exception {}
