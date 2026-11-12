// Ported from OpenUSD 26.11.1: pxr/exec/vdf/subExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/subExecutor.h.
//
// VdfSubExecutor<EngineType, DataManagerType> takes both template arguments
// as constructor arguments (see the header of dataManagerBasedExecutor.ts):
//
//   new VdfSubExecutor(VdfPullBasedExecutorEngine, VdfDataManagerHashTable, parent)

import { VdfDataManagerBasedSubExecutor } from './dataManagerBasedSubExecutor.ts'
import type {
  VdfDataManagerConcept,
  VdfDataManagerType,
  VdfExecutorEngine,
  VdfExecutorEngineType,
} from './dataManagerBasedExecutor.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import { VdfExecutorFactory } from './executorFactory.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'

/**
 * VdfSubExecutor (subExecutor.h:35-107): executes a VdfNetwork to compute a
 * requested set of values, and uses cached output values from a parent
 * executor, if unavailable in the local data manager.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class VdfSubExecutor<DM extends VdfDataManagerConcept<any>,
  E extends VdfExecutorEngine = VdfExecutorEngine>
  extends VdfDataManagerBasedSubExecutor<DM> {
  // subExecutor.h:105: the engine that does most of the work.
  private readonly _engine: E

  // subExecutor.h:101: the factory shared amongst executors of this type
  // (VdfExecutorFactory<VdfSubExecutor<E, D>, VdfSpeculationExecutor<...>>).
  private readonly _factory: VdfExecutorFactory<VdfSubExecutor<DM, E>>

  /** subExecutor.h:63-72: optionally with a parent executor. */
  constructor(
    engineType: VdfExecutorEngineType<DM, E>,
    dataManagerType: VdfDataManagerType<DM>,
    parentExecutor: VdfExecutorInterface | null = null) {
    super(dataManagerType, parentExecutor)
    this._engine = new engineType(this, this._dataManager)
    this._factory = new VdfExecutorFactory(
      (parent) => new VdfSubExecutor(engineType, dataManagerType, parent))
  }

  /** GetFactory (subExecutor.h:80-82). */
  getFactory(): VdfExecutorFactory<VdfSubExecutor<DM, E>> {
    return this._factory
  }

  /** _Run (subExecutor.h:115-131). */
  protected _run(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null): void {
    // If we have an empty request, bail out.
    if (computeRequest.IsEmpty()) {
      return
    }

    this._engine.runSchedule(schedule, computeRequest, errorLogger)
  }

  /** _ClearData (subExecutor.h:133-145): clears the buffer data and invalidation state. */
  protected override _clearData(): void {
    // If the data manager is empty, don't even attempt to clear it.
    if (!this._dataManager.IsEmpty()) {
      this._dataManager.clear()
    }

    this.invalidateTopologicalState()
  }
}
