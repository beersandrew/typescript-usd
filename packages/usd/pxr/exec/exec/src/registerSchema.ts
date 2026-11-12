// Ported from OpenUSD 26.11.1: pxr/exec/exec/registerSchema.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/registerSchema.h.

import { TfRegistryManager } from 'typescript-usd/tf'
import { ExecComputationBuilder } from './computationBuilders.ts'
import { ExecDefinitionRegistryTagKey } from './types.ts'

/**
 * Initiates registration of exec computations for the schema named
 * `schemaType` (registerSchema.h:20-68, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA).
 *
 * The macro's code block is the `body` function; it receives `self`, the
 * ExecComputationBuilder for the schema, and uses the Computation Definition
 * Language (computationBuilders.ts) to register the schema's computations.
 *
 * As the macro's TF_REGISTRY_FUNCTION(ExecDefinitionRegistryTag) does, this
 * adds a registry function under the ExecDefinitionRegistryTag key; it runs
 * when Exec_DefinitionRegistry subscribes to that key, or immediately if the
 * registry already has. At the end of the function `self` is destroyed,
 * completing the schema's registration.
 */
export function EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  schemaType: string,
  body: (self: ExecComputationBuilder) => void,
): void {
  TfRegistryManager.add(ExecDefinitionRegistryTagKey, () => {
    const self = ExecComputationBuilder.ConstructionAccess.construct(schemaType)
    try {
      body(self)
    } finally {
      self._destroy()
    }
  })
}
