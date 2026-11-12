// Ported from OpenUSD 26.11.1: pxr/exec/exec/systemChangeProcessor.cpp,
//  pxr/exec/exec/systemChangeProcessor.h, pxr/usd/sdf/schema.h
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/systemChangeProcessor.h and
// systemChangeProcessor.cpp.
//
// ExecSystem::_ChangeProcessor is ExecSystem_ChangeProcessor, exposed as the
// static ExecSystem._ChangeProcessor (system.ts). Its destructor, which
// post-processes the accumulated changes (systemChangeProcessor.cpp:46-49),
// is Dispose() (also [Symbol.dispose] for `using`).
//
// SdfFieldKeys tokens (pxr/usd/sdf/schema.h) are their token strings.

import type { SdfPath } from 'typescript-usd/sdf/path'
import { TF_VERIFY } from 'typescript-usd/tf'

import { EsfEditReason } from 'typescript-usd/esf'

import type { ExecSystem } from './system.ts'
import { Exec_Uncompiler } from './uncompiler.ts'

// SdfFieldKeys->Default, Spline, TimeSamples, TargetPaths, ConnectionPaths.
const _SdfFieldKeys = {
  Default: 'default',
  Spline: 'spline',
  TimeSamples: 'timeSamples',
  TargetPaths: 'targetPaths',
  ConnectionPaths: 'connectionPaths',
} as const

// State accumulated over a round of change processing
// (systemChangeProcessor.cpp:21-37).
class _State {
  // Accumulates scene paths to attributes with invalid authored values, so
  // that program and executor invalidation can be batch-processed.
  readonly attributesWithInvalidAuthoredValues: SdfPath[] = []

  // Accumulates scene paths and field names that indicate invalid metadata
  // values.
  readonly objectsWithInvalidMetadataValues: Array<readonly [SdfPath, string]> = []

  // Uncompiles changed network.
  readonly uncompiler: Exec_Uncompiler

  constructor(system: ExecSystem) {
    this.uncompiler = new Exec_Uncompiler(system._program!, system._runtime!)
  }
}

/**
 * Public API to deliver scene changes from ExecSystem derived classes
 * (systemChangeProcessor.h:23-75).
 *
 * Classes derived from ExecSystem are responsible for notifying ExecSystem
 * when scene changes occur. They do so by constructing an
 * ExecSystem._ChangeProcessor from their parent ExecSystem, invoking methods
 * corresponding to the scene changes, and then disposing of the processor.
 */
export class ExecSystem_ChangeProcessor {
  private readonly _system: ExecSystem
  private _state: _State | null

  /** systemChangeProcessor.cpp:39-44 */
  constructor(system: ExecSystem) {
    this._system = system
    this._state = new _State(system)
    TF_VERIFY(system, 'system')
  }

  /** ~_ChangeProcessor (systemChangeProcessor.cpp:46-49). */
  dispose(): void {
    if (!this._state) {
      return
    }
    this._postProcessChanges()
    this._state = null
  }

  [Symbol.dispose](): void {
    this.dispose()
  }

  /**
   * Notifies the ExecSystem that a scene object has been resynced
   * (systemChangeProcessor.cpp:51-59).
   */
  didResync(path: SdfPath): void {
    // TODO (upstream): Resyncs on an object may trigger edit reasons on
    // related objects.
    this._getState().uncompiler.uncompileForSceneChange(
      path, EsfEditReason.ResyncedObject)
  }

  /**
   * Notifies the ExecSystem that the set of attribute connections that
   * target a scene object has changed (systemChangeProcessor.cpp:61-66).
   */
  didChangeIncomingConnections(path: SdfPath): void {
    this._getState().uncompiler.uncompileForSceneChange(
      path, EsfEditReason.ChangedIncomingConnections)
  }

  /**
   * Notifies the ExecSystem that a scene object's fields have changed, but
   * the object has *not* been resynced (systemChangeProcessor.cpp:68-109).
   */
  didChangeInfoOnly(path: SdfPath, changedFields: readonly string[]): void {
    const state = this._getState()
    if (path.isPropertyPath()) {
      let didRecordAttributeValueChange = false
      for (const field of changedFields) {
        if (!didRecordAttributeValueChange &&
          (field === _SdfFieldKeys.Default ||
            field === _SdfFieldKeys.Spline ||
            field === _SdfFieldKeys.TimeSamples)) {
          state.attributesWithInvalidAuthoredValues.push(path)
          didRecordAttributeValueChange = true
        } else if (field === _SdfFieldKeys.TargetPaths) {
          state.uncompiler.uncompileForSceneChange(
            path, EsfEditReason.ChangedTargetPaths)
        } else if (field === _SdfFieldKeys.ConnectionPaths) {
          state.uncompiler.uncompileForSceneChange(
            path, EsfEditReason.ChangedConnectionPaths)
        } else {
          // TODO (upstream): The field name may not even be a valid metadata
          // key. It works correctly to pass along all invalid field names
          // here, since we will only invalidate when they correspond to
          // metadata input nodes that have been compiled.
          state.objectsWithInvalidMetadataValues.push([path, field])
        }
      }
    } else if (path.isPrimPath()) {
      for (const field of changedFields) {
        state.objectsWithInvalidMetadataValues.push([path, field])
      }
    }
  }

  // Processes accumulated state from changes before the processor goes out
  // of scope (systemChangeProcessor.cpp:111-132).
  private _postProcessChanges(): void {
    const state = this._getState()
    if (state.uncompiler.didUncompile() ||
      this._system._program!.wasInterrupted()) {
      this._system._invalidateDisconnectedInputs()
    }

    if (state.attributesWithInvalidAuthoredValues.length !== 0) {
      this._system._invalidateAttributeValues(
        state.attributesWithInvalidAuthoredValues)
    }

    if (state.objectsWithInvalidMetadataValues.length !== 0) {
      this._system._invalidateMetadataValues(
        state.objectsWithInvalidMetadataValues)
    }

    if (this._system._program!.wasInterrupted()) {
      this._system._invalidateUnknownValues()
    }
  }

  private _getState(): _State {
    if (!this._state) {
      TF_VERIFY(false, '_state', 'ExecSystem::_ChangeProcessor used after Dispose()')
      throw new Error('ExecSystem::_ChangeProcessor used after Dispose()')
    }
    return this._state
  }
}
