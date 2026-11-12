// Ported from OpenUSD 26.11.1: pxr/exec/vdf/error.cpp, pxr/exec/vdf/error.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/error.h and error.cpp.
//
// VDF_FATAL_ERROR and VDF_AXIOM are fatal errors in the spirit of
// TF_FATAL_ERROR and TF_AXIOM (error.h:33-49). Fatal errors throw
// (openexec-x1.md section 4, convention 9).

import { TF_FATAL_ERROR } from 'typescript-usd/tf'
import { VdfGrapher } from './grapher.ts'
import type { VdfNode } from './node.ts'

/**
 * Vdf_ErrorHelper::FatalError (error.cpp:24-29): graphs the network around
 * `node`, then issues a fatal error.
 */
export function VDF_FATAL_ERROR(node: VdfNode, msg: string): never {
  VdfGrapher.graphNodeNeighborhood(node, 5, 5)
  return TF_FATAL_ERROR(msg)
}

/** VDF_AXIOM(node, cond) (error.h:43-49). `expression` is the condition text. */
export function VDF_AXIOM(node: VdfNode, cond: unknown, expression = ''): asserts cond {
  if (!cond) {
    VDF_FATAL_ERROR(node, `Failed axiom: ' ${expression} '`)
  }
}
