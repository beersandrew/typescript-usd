// Ported from OpenUSD 26.11.1: pxr/exec/execIr/types.cpp,
//  pxr/exec/execIr/types.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/types.h and types.cpp.
//
// ExecIrResult, a TfDenseHashMap<TfToken, VtValue> (types.h:20-25), is a JS
// Map from attribute name to value. Its TfType is ExecIrResultType
// (docs/openexec-x1.md 4.1, TfType identity).

import { TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import { ExecTypeRegistry } from 'typescript-usd/exec'

/**
 * Map used to return results from controller forward and inverse
 * computations (types.h:20-25).
 *
 * The map entries are the names of attributes for which the computation
 * produces values and the corresponding computed values.
 */
export type ExecIrResult = Map<string, VtValue>

/** The TfType of ExecIrResult. */
export const ExecIrResultType: TfType = TfType.define('ExecIrResult')

// TF_REGISTRY_FUNCTION(ExecTypeRegistry) (types.cpp:14-17)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(ExecIrResultType, new Map<string, VtValue>() satisfies ExecIrResult)
})
