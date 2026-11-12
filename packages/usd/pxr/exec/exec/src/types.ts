// Ported from OpenUSD 26.11.1: pxr/exec/exec/types.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/types.h.

import type { Type as TfType } from 'typescript-usd/tf'
import type { VdfContext } from 'typescript-usd/vdf'

/** Function type used for computation callbacks (types.h:28-29). */
export type ExecCallbackFn = (context: VdfContext) => void

/**
 * Type used to identify Exec_DefinitionRegistry registry functions
 * (types.h:31-37).
 *
 * TF_REGISTRY_FUNCTION(ExecDefinitionRegistryTag) registers under the
 * TfRegistryManager key `ExecDefinitionRegistryTagKey`, the tag's name, as the
 * other exec ports key registry functions by the C++ type name (for example
 * 'VdfExecutionTypeRegistry' in ef/src/time.ts).
 */
export class ExecDefinitionRegistryTag {}

/** The TfRegistryManager key of ExecDefinitionRegistryTag. */
export const ExecDefinitionRegistryTagKey = 'ExecDefinitionRegistryTag'

/**
 * A vector of schema types used to restrict the schemas that dispatched
 * compuations dispatch onto (types.h:39-42).
 */
export type ExecDispatchesOntoSchemas = TfType[]
