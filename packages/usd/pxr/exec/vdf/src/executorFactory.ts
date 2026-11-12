// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorFactory.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorFactory.h.
//
// C++ VdfExecutorFactory<ChildExecutorType, SpeculationExecutorType> news the
// two template types. The TS factory takes the matching construction
// functions instead, because the TS executor classes take their engine and
// data manager types as constructor arguments (see the header of
// dataManagerBasedExecutor.ts):
//
//   new VdfExecutorFactory(
//       (parent) => new VdfSubExecutor(EngineType, DataManagerType, parent))
//
// The speculation function is optional; while speculation executors are not
// ported (openexec-speculation), ManufactureSpeculationExecutor fails loudly
// when it is absent. VdfSpeculationNode and VdfSpeculationExecutorBase are
// typed by their base classes VdfNode and VdfExecutorInterface.

import { TF_CODING_ERROR } from 'typescript-usd/tf'

import type { VdfExecutorInterface } from './executorInterface.ts'
import { VdfExecutorFactoryBase } from './executorFactoryBase.ts'
import type { VdfNode } from './node.ts'

/** Constructs a ChildExecutorType with a parent executor (executorFactory.h:44-45). */
export type VdfManufactureChildExecutorFn<C extends VdfExecutorInterface> =
  (parentExecutor: VdfExecutorInterface | null) => C

/**
 * Constructs a SpeculationExecutorType from a speculation node and a parent
 * executor (executorFactory.h:55-56).
 */
export type VdfManufactureSpeculationExecutorFn<S extends VdfExecutorInterface> =
  (speculationNode: VdfNode | null, parentExecutor: VdfExecutorInterface | null) => S

/** VdfExecutorFactory (executorFactory.h:30-59). */
export class VdfExecutorFactory<
  C extends VdfExecutorInterface,
  S extends VdfExecutorInterface = VdfExecutorInterface,
> extends VdfExecutorFactoryBase {
  private readonly _manufactureChild: VdfManufactureChildExecutorFn<C>
  private readonly _manufactureSpeculation: VdfManufactureSpeculationExecutorFn<S> | null

  constructor(
    manufactureChild: VdfManufactureChildExecutorFn<C>,
    manufactureSpeculation: VdfManufactureSpeculationExecutorFn<S> | null = null) {
    super()
    this._manufactureChild = manufactureChild
    this._manufactureSpeculation = manufactureSpeculation
  }

  /** ManufactureChildExecutor (executorFactory.h:41-46). */
  manufactureChildExecutor(parentExecutor: VdfExecutorInterface | null): C {
    return this._manufactureChild(parentExecutor)
  }

  /** ManufactureSpeculationExecutor (executorFactory.h:51-57). */
  manufactureSpeculationExecutor(
    speculationNode: VdfNode | null,
    parentExecutor: VdfExecutorInterface | null): S {
    if (!this._manufactureSpeculation) {
      // FAITHFULNESS-DEBT(openexec-speculation): executorFactory.h:55-56
      // constructs VdfSpeculationExecutor<SpeculationEngineType, DataManager>
      // -> port speculationExecutor.h and pass its constructor here.
      const message = 'VdfExecutorFactory::ManufactureSpeculationExecutor ' +
        '(pxr/exec/vdf/executorFactory.h:51-57): VdfSpeculationExecutor is ' +
        'not ported (openexec-speculation)'
      TF_CODING_ERROR(message)
      throw new Error(message)
    }
    return this._manufactureSpeculation(speculationNode, parentExecutor)
  }
}
