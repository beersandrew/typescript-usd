// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executor.h.
//
// VdfExecutor<EngineType, DataManagerType> takes both template arguments as
// constructor arguments (see the header of dataManagerBasedExecutor.ts):
//
//   new VdfExecutor(VdfPullBasedExecutorEngine,
//       VdfDataManagerVector.Of(VdfDataManagerDeallocationMode.Background))
//
// Its factory manufactures VdfSubExecutor<EngineType, DataManagerType>
// children; the speculation half of the factory
// (VdfSpeculationExecutor<SpeculationEngineType, DataManagerType>) is not
// ported (openexec-speculation) and fails loudly.

import {
  VdfDataManagerBasedExecutor,
  type VdfDataManagerConcept,
  type VdfDataManagerType,
  type VdfExecutorEngine,
  type VdfExecutorEngineType,
} from './dataManagerBasedExecutor.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import { VdfExecutorFactory } from './executorFactory.ts'
import type { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'
import { VdfSubExecutor } from './subExecutor.ts'

/**
 * VdfExecutor (executor.h:35-99): executes a VdfNetwork to compute a
 * requested set of values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class VdfExecutor<DM extends VdfDataManagerConcept<any>,
  E extends VdfExecutorEngine = VdfExecutorEngine>
  extends VdfDataManagerBasedExecutor<DM> {
  // executor.h:98: the engine that does most of the work.
  private readonly _engine: E

  // executor.h:94: the factory shared amongst executors of this type.
  private readonly _factory: VdfExecutorFactory<VdfSubExecutor<DM, E>>

  /** Default constructor (executor.h:63). */
  constructor(
    engineType: VdfExecutorEngineType<DM, E>,
    dataManagerType: VdfDataManagerType<DM>) {
    super(dataManagerType)
    this._engine = new engineType(this, this._dataManager)
    this._factory = new VdfExecutorFactory(
      (parent) => new VdfSubExecutor(engineType, dataManagerType, parent))
  }

  /** GetFactory (executor.h:71-73). */
  getFactory(): VdfExecutorFactory<VdfSubExecutor<DM, E>> {
    return this._factory
  }

  /** _Run (executor.h:107-123). */
  protected _run(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null): void {
    // If we have an empty request, bail.
    if (computeRequest.IsEmpty()) {
      return
    }

    this._engine.runSchedule(schedule, computeRequest, errorLogger)
  }

  /** _ClearData (executor.h:86-88): clears the temporary execution buffers. */
  protected override _clearData(): void {
    this._dataManager.clear()
  }
}
