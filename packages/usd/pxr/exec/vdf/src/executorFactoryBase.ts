// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorFactoryBase.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorFactoryBase.h.
//
// VdfSpeculationNode and VdfSpeculationExecutorBase are not ported
// (openexec-speculation). In the speculation signatures below they are
// typed by their base classes, VdfNode and VdfExecutorInterface.

import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfNode } from './node.ts'

/**
 * VdfExecutorFactoryBase (executorFactoryBase.h:28-53): manufactures
 * executors that share traits with the executor owning the factory.
 */
export abstract class VdfExecutorFactoryBase {
  /**
   * Manufactures a new executor, which in an executor hierarchy can be
   * parented underneath the executor owning this factory
   * (executorFactoryBase.h:35). Null where upstream returns an empty
   * std::unique_ptr.
   */
  abstract manufactureChildExecutor(
    parentExecutor: VdfExecutorInterface | null): VdfExecutorInterface | null

  /**
   * Manufactures a new speculation executor with the same traits as the
   * executor owning this factory (executorFactoryBase.h:41-44).
   */
  abstract manufactureSpeculationExecutor(
    speculationNode: VdfNode | null,
    parentExecutor: VdfExecutorInterface | null): VdfExecutorInterface
}
