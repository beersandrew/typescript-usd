// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerBasedExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerBasedExecutor.h.
//
// ============================================================================
// The TS shape of the executor templates (binding for vdf, ef and exec)
// ============================================================================
//
// Upstream composes executors from class templates:
//
//   VdfDataManagerBasedExecutor<DataManagerType, BaseClass>
//   VdfDataManagerBasedSubExecutor<DataManagerType, BaseClass>
//   VdfExecutor<EngineType, DataManagerType>
//   VdfSubExecutor<EngineType, DataManagerType>
//   EfPageCacheBasedExecutor<EngineType, DataManagerType>   (ef)
//   EfPageCacheExecutor<EngineType, DataManagerType>        (ef)
//
// where EngineType is a class template over the data manager
// (VdfPullBasedExecutorEngine<DataManagerType>) and DataManagerType is a data
// manager class (VdfDataManagerVector<Mode>, VdfDataManagerHashTable,
// VdfParallelDataManagerVector).
//
// In TS the same classes keep their names and inheritance, and the template
// arguments become constructor arguments that are *types* (constructors):
//
//   DataManagerType: VdfDataManagerType<DM> = new () => DM
//       VdfDataManagerHashTable, VdfParallelDataManagerVector, and
//       VdfDataManagerVector.Of(VdfDataManagerDeallocationMode.Background)
//       for VdfDataManagerVector<Background>.
//   EngineType:      VdfExecutorEngineType<DM, E> =
//                        new (executor: VdfExecutorInterface, dataManager: DM) => E
//       VdfPullBasedExecutorEngine. The engine is constructed as upstream
//       does, `_engine(*this, &this->_dataManager)`.
//
// Constructors take the types first, then upstream's own constructor
// arguments:
//
//   new VdfDataManagerBasedExecutor(DataManagerType, parentExecutor?)   (abstract)
//   new VdfDataManagerBasedSubExecutor(DataManagerType, parentExecutor?) (abstract)
//   new VdfExecutor(EngineType, DataManagerType)
//   new VdfSubExecutor(EngineType, DataManagerType, parentExecutor?)
//   new EfPageCacheExecutor(EngineType, DataManagerType, cacheStorage)  (ef)
//
// so that EfPageCacheExecutor<VdfPullBasedExecutorEngine,
// VdfDataManagerVector<Background>> is
//
//   new EfPageCacheExecutor(VdfPullBasedExecutorEngine,
//       VdfDataManagerVector.Of(VdfDataManagerDeallocationMode.Background),
//       cacheStorage)
//
// and exec's runtime sub-executor VdfSubExecutor<VdfPullBasedExecutorEngine,
// VdfDataManagerHashTable> is
//
//   new VdfSubExecutor(VdfPullBasedExecutorEngine, VdfDataManagerHashTable, parent)
//
// A subclass that needs the engine constructs it after super():
// `this._engine = new engineType(this, this._dataManager)`.
//
// The static `_factory` of each executor template instantiation is a
// VdfExecutorFactory built from the same types (executorFactory.ts):
//   new VdfExecutorFactory((parent) =>
//       new VdfSubExecutor(engineType, dataManagerType, parent))
//
// The BaseClass template parameter is always VdfExecutorInterface outside of
// speculation (VdfSpeculationExecutorBase, openexec-speculation), so these
// classes extend VdfExecutorInterface directly.
//
// _dataManager is protected (upstream: protected member). The data manager
// API an executor uses is VdfDataManagerConcept below; VdfExecutorDataManager
// subclasses and VdfParallelExecutorDataManager subclasses both satisfy it.
// ============================================================================

import type { VdfConnection } from './connection.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfOutput } from './output.ts'
import type { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'
import type { VdfVector } from './vector.ts'

/**
 * The data manager API used by the data manager based executors (the
 * implicit C++ template concept of DataManagerType). DataHandle is the
 * data manager's handle type.
 */
export interface VdfDataManagerConcept<DataHandle> {
  resize(network: VdfNetwork): void
  isValidDataHandle(handle: DataHandle): boolean
  getDataHandle(outputId: number): DataHandle
  getOrCreateDataHandle(outputId: number): DataHandle
  getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null
  getOutputValueForReading(handle: DataHandle, mask: VdfMask): VdfVector | null
  getOrCreateOutputValueForWriting(output: VdfOutput, handle: DataHandle): VdfVector | null
  setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void
  takeOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): boolean
  setReferenceOutputValue(sourceValue: VdfVector | null, destOutputId: number): void
  duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void
  isOutputInvalid(outputId: number, invalidationMask: VdfMask): boolean
  invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean
  /** DataManagerType::Base::Touch(const VdfOutput &). */
  touch(output: VdfOutput): void
  updateInvalidationTimestamp(timestamp: number): void
  hasInvalidationTimestampMismatch(sourceHandle: DataHandle, destHandle: DataHandle): boolean
  clearDataForOutput(outputId: number): void
  clear(): void
  IsEmpty(): boolean
  /** The data manager destructor, where it has observable effects. */
  destroy?(): void
}

/** A DataManagerType template argument: a zero-argument data manager constructor. */
export type VdfDataManagerType<DM> = new () => DM

/** The engine API the executors use (VdfPullBasedExecutorEngine::RunSchedule). */
export interface VdfExecutorEngine {
  runSchedule(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null): void
}

/**
 * An EngineType template template argument, bound to a data manager type:
 * constructed with the executor and its data manager.
 */
export type VdfExecutorEngineType<DM, E extends VdfExecutorEngine = VdfExecutorEngine> =
  new (executor: VdfExecutorInterface, dataManager: DM) => E

/**
 * VdfDataManagerBasedExecutor (dataManagerBasedExecutor.h:30-205): base
 * class for executors that use a data manager. Implements much of the
 * VdfExecutorInterface API by passing the work on to the data manager.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class VdfDataManagerBasedExecutor<DM extends VdfDataManagerConcept<any>>
  extends VdfExecutorInterface {
  /**
   * dataManagerBasedExecutor.h:204: manages the data needed for this
   * executor, including all the cached output values.
   */
  protected readonly _dataManager: DM

  /** The DataManagerType template argument. */
  protected readonly _dataManagerType: VdfDataManagerType<DM>

  /** dataManagerBasedExecutor.h:37-44: optionally with a parent executor. */
  protected constructor(
    dataManagerType: VdfDataManagerType<DM>,
    parentExecutor: VdfExecutorInterface | null = null) {
    super(parentExecutor)
    this._dataManagerType = dataManagerType
    this._dataManager = new dataManagerType()
  }

  /**
   * The destructor: VdfExecutorInterface's observer notification
   * (executorInterface.cpp:32-43), then the data manager member's destructor.
   */
  override destroy(): void {
    super.destroy()
    this._dataManager.destroy?.()
  }

  /** Resize (dataManagerBasedExecutor.h:52-54). */
  override resize(network: VdfNetwork): void {
    this._dataManager.resize(network)
  }

  /** SetOutputValue (dataManagerBasedExecutor.h:61-66). */
  setOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): void {
    this._dataManager.setOutputValue(output, value, mask)
  }

  /** TakeOutputValue (dataManagerBasedExecutor.h:70-75). */
  takeOutputValue(output: VdfOutput, value: VdfVector, mask: VdfMask): boolean {
    return this._dataManager.takeOutputValue(output, value, mask)
  }

  /** DuplicateOutputData (dataManagerBasedExecutor.h:80-84). */
  duplicateOutputData(sourceOutput: VdfOutput, destOutput: VdfOutput): void {
    this._dataManager.duplicateOutputData(sourceOutput, destOutput)
  }

  /** IsEmpty (dataManagerBasedExecutor.h:88-90). */
  IsEmpty(): boolean {
    return this._dataManager.IsEmpty()
  }

  /** HasInvalidationTimestampMismatch (dataManagerBasedExecutor.h:95-101). */
  hasInvalidationTimestampMismatch(source: VdfOutput, dest: VdfOutput): boolean {
    return this._dataManager.hasInvalidationTimestampMismatch(
      this._dataManager.getDataHandle(source.getId()),
      this._dataManager.getDataHandle(dest.getId()))
  }

  /** _GetInputValue (dataManagerBasedExecutor.h:107-111). */
  _getInputValue(connection: VdfConnection, mask: VdfMask): VdfVector | null {
    return this._dataManager.getInputValue(connection, mask)
  }

  /** _GetOutputValueForReading (dataManagerBasedExecutor.h:115-120). */
  _getOutputValueForReading(output: VdfOutput, mask: VdfMask): VdfVector | null {
    return this._dataManager.getOutputValueForReading(
      this._dataManager.getDataHandle(output.getId()), mask)
  }

  /** _GetOutputValueForWriting (dataManagerBasedExecutor.h:124-128). */
  _getOutputValueForWriting(output: VdfOutput): VdfVector | null {
    return this._dataManager.getOrCreateOutputValueForWriting(
      output, this._dataManager.getDataHandle(output.getId()))
  }

  /** _ClearDataForOutput (dataManagerBasedExecutor.h:132-135). */
  protected override _clearDataForOutput(outputId: number, _nodeId: number): void {
    this._dataManager.clearDataForOutput(outputId)
  }

  /** _IsOutputInvalid (dataManagerBasedExecutor.h:140-144). */
  _isOutputInvalid(outputId: number, invalidationMask: VdfMask): boolean {
    return this._dataManager.isOutputInvalid(outputId, invalidationMask)
  }

  /** _InvalidateOutput (dataManagerBasedExecutor.h:156-161). */
  _invalidateOutput(output: VdfOutput, invalidationMask: VdfMask): boolean {
    return this._dataManager.invalidateOutput(output, invalidationMask)
  }

  /** _UpdateInvalidationTimestamp (dataManagerBasedExecutor.h:167-171). */
  protected _updateInvalidationTimestamp(): void {
    this._dataManager.updateInvalidationTimestamp(this.getExecutorInvalidationTimestamp())
  }

  /** _SetReferenceOutputValue (dataManagerBasedExecutor.h:176-188). */
  _setReferenceOutputValue(destOutput: VdfOutput, sourceOutput: VdfOutput, sourceMask: VdfMask): void {
    // XXX: We are getting the cached output value from the executor, which
    //      may give us a pointer into the parent executor data manager. We
    //      cannot take ownership of values stored outside of this executor's
    //      data manager.
    const sourceValue = this._getOutputValueForReading(sourceOutput, sourceMask)
    this._dataManager.setReferenceOutputValue(sourceValue, destOutput.getId())
  }

  /** _TouchOutput (dataManagerBasedExecutor.h:194-197). */
  _touchOutput(output: VdfOutput): void {
    this._dataManager.touch(output)
  }
}
