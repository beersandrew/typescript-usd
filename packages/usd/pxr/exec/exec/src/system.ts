// Ported from OpenUSD 26.11.1: pxr/exec/exec/system.cpp,
//  pxr/exec/exec/system.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/system.h and system.cpp.
//
// Mapping choices:
// - ExecSystem is a base class. Its protected API (_ChangeTime, _Compute,
//   _ComputeWithOverrides, _ParallelForEachRequest) and its private members
//   reached by friends (Exec_RequestImpl, ExecSystem::_ChangeProcessor,
//   ExecSystem::Diagnostics) are @internal members with upstream's names,
//   because TypeScript has no friends.
// - The nested classes ExecSystem::_ChangeProcessor (systemChangeProcessor.ts)
//   and ExecSystem::Diagnostics (systemDiagnostics.ts) are static members.
// - The std::unique_ptr members are nullable fields; reset() assigns null
//   before destroying the old object, as libc++'s unique_ptr::reset does.
//   The destructor (system.cpp:45) is Destroy().
// - TfSpan parameters are readonly arrays; TfFunctionRef is a function.

import { SdfPath } from 'typescript-usd/sdf/path'
import { Type as TfType, TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import { WorkWithScopedDispatcher } from 'typescript-usd/work'

import type { EfLeafNode } from 'typescript-usd/ef'
import { EfTime } from 'typescript-usd/ef'
import { EfTimeInterval } from 'typescript-usd/ef'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfRequest } from 'typescript-usd/vdf'
import type { VdfSchedule } from 'typescript-usd/vdf'

import { Exec_Compiler } from './compiler.ts'
import type { Exec_InputKey } from './inputKey.ts'
import { Exec_ResolveInput } from './inputResolver.ts'
import { Exec_Program } from './program.ts'
import { ExecProviderResolution } from './providerResolution.ts'
import type { Exec_RequestImpl } from './requestImpl.ts'
import { Exec_RequestTracker } from './requestTracker.ts'
import { Exec_Runtime } from './runtime.ts'
import { ExecSystem_ChangeProcessor } from './systemChangeProcessor.ts'
import { ExecSystem_Diagnostics } from './systemDiagnostics.ts'
import type { ExecValueKey } from './valueKey.ts'
import type { ExecValueOverrideVector } from './valueOverride.ts'

/**
 * Base implementation of a system to procedurally compute values based on
 * scene description and computation definitions (system.h:39-145).
 *
 * ExecSystem owns all the structures necessary to compile, schedule and
 * evaluate requested computation values. Derived classes are responsible for
 * interfacing with the underlying scene description.
 */
export class ExecSystem {
  /** Diagnostic utility class (system.h:49-50). */
  static readonly Diagnostics = ExecSystem_Diagnostics

  /**
   * Derived systems instantiate this class to deliver scene changes to exec
   * (system.h:99-100).
   */
  static readonly _ChangeProcessor = ExecSystem_ChangeProcessor

  private readonly _stage: EsfStage

  /** @internal */
  _program: Exec_Program | null
  /** @internal */
  _runtime: Exec_Runtime | null
  /** @internal */
  _requestTracker: Exec_RequestTracker | null

  /**
   * Construct an exec system for computing values on `stage`
   * (system.cpp:34-43). Protected upstream.
   */
  protected constructor(stage: EsfStage) {
    this._stage = stage
    this._program = new Exec_Program()
    this._runtime = new Exec_Runtime(
      this._program.getTimeInputNode(),
      this._program.getLeafNodeCache())
    this._requestTracker = new Exec_RequestTracker()
    this._changeTime(new EfTime())
  }

  /**
   * ~ExecSystem (system.cpp:45): destroys the members in reverse order of
   * construction.
   */
  destroy(): void {
    this._resetMembers()
  }

  /**
   * Changes time on the system (system.cpp:47-81). This stores the new time
   * value in the time input node output, invalidates all time dependent
   * computed values, and notifies requests of the change in time.
   * Protected upstream.
   */
  _changeTime(newTime: EfTime): void {
    const program = this._program!
    const runtime = this._runtime!
    const [timeChanged, oldTime] = runtime.SetTime(program.getTimeInputNode(), newTime)
    if (!timeChanged) {
      return
    }

    // Invalidate time on the program.
    const invalidationResult = program.invalidateTime(oldTime, newTime)

    // Invalidate the executor and send request invalidation notification.
    const requestTracker = this._requestTracker!
    WorkWithScopedDispatcher(dispatcher => {
      // Invalidate values on the executor.
      dispatcher.run(() => {
        runtime.invalidateExecutor(invalidationResult.invalidationRequest)
      })

      // Notify all the requests of the time change. Not all the requests
      // will contain all the leaf nodes affected by the time change, and the
      // request impls are responsible for filtering the provided information.
      if (invalidationResult.invalidLeafNodes.length !== 0) {
        dispatcher.run(() => {
          requestTracker.didChangeTime(invalidationResult)
        })
      }
    })
  }

  /**
   * Computes the values in the `computeRequest` using the provided
   * `schedule` (system.cpp:83-99). Protected upstream.
   */
  _compute(schedule: VdfSchedule, computeRequest: VdfRequest): void {
    // Reset the accumulated input nodes requiring invalidation on the
    // program, and use the returned invalidation request to make sure that
    // the executor data manager is properly invalidated for any input nodes
    // that were initialized.
    this._runtime!.invalidateExecutor(
      this._program!.resetInputNodesRequiringInvalidation())

    // Run the executor to compute the values.
    this._runtime!.computeValues(schedule, computeRequest)
  }

  /**
   * Computes the values in the `computeRequest` using the provided
   * `schedule` in the presence of `valueOverrides` (system.cpp:101-202).
   * Protected upstream.
   */
  _computeWithOverrides(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    valueOverrides: ExecValueOverrideVector,
  ): VdfExecutorInterface | null {
    const program = this._program!

    // Transform the vector of overrides, each containing a ValueKey and
    // override value, into two equal-length vectors. The first contains the
    // masked outputs to be overridden, and the second contains the overridden
    // values.
    const overriddenOutputs: VdfMaskedOutput[] = []
    const overriddenValues: VtValue[] = []

    for (const valueOverride of valueOverrides) {
      // Resolve the output key that provides the value specified by the value
      // key.
      const inputKey: Exec_InputKey = {
        inputName: '', // input name
        computationName: valueOverride.valueKey.getComputationName(),
        disambiguatingId: '', // disambiguating id
        resultType: TfType.getUnknownType(), // do not require a specific result type.
        providerResolution: {
          localTraversal: SdfPath.reflexiveRelativePath,
          dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local,
        },
        fallsBackToDispatched: false,
        optional: false,
      }

      const outputKeys = Exec_ResolveInput(
        valueOverride.valueKey.getProvider().Get().getStage(),
        valueOverride.valueKey.getProvider(),
        new EsfSchemaConfigKey(),
        inputKey,
        null /* journal */)

      // If resolution found no output keys, then the computation was not
      // found on the provider.
      if (outputKeys.length === 0) {
        TF_CODING_ERROR(
          `Cannot override value for value key ` +
          `'${valueOverride.valueKey.getDebugName()}', because the ` +
          'computation was not defined for the provider.')
        continue
      }

      // If the computation was defined, then we should have resolved exactly
      // one output key regardless if the output key has a compiled output in
      // the network.
      if (!TF_VERIFY(outputKeys.length === 1, 'outputKeys.size() == 1')) {
        return null
      }

      // Find the compiled output for the output key. If it does not exist,
      // then we silently skip this override.
      const cacheHit = program.getCompiledOutput(outputKeys[0]!.makeIdentity())
      if (!cacheHit || !TF_VERIFY(cacheHit.output.asBool(), 'cacheHit->output')) {
        continue
      }

      // Check that the type of the override value matches the type of the
      // output being overridden.
      const outputType = cacheHit.output.GetOutput()!.getSpec().getType()
      const overrideType = valueOverride.overrideValue.getType()
      if (outputType !== overrideType) {
        TF_CODING_ERROR(
          `Expected override of value key ` +
          `'${valueOverride.valueKey.getDebugName()}' to have type ` +
          `'${outputType.getTypeName()}'; got '${overrideType.getTypeName()}'`)
        continue
      }

      overriddenOutputs.push(cacheHit.output)
      overriddenValues.push(valueOverride.overrideValue)
    }

    // Reset the accumulated input nodes requiring invalidation on the
    // program, and use the returned invalidation request to make sure that
    // the executor data manager is properly invalidated for any input nodes
    // that were initialized.
    this._runtime!.invalidateExecutor(program.resetInputNodesRequiringInvalidation())

    // Compute the request using the overridden values. The result is the
    // subexecutor that performed the computation, which is returned to the
    // caller in order to extract the computed values.
    return this._runtime!.computeWithOverrides(
      schedule,
      computeRequest,
      overriddenOutputs,
      overriddenValues)
  }

  /**
   * Invoke `f` on each outstanding exec request (system.cpp:204-209). `f`
   * must not re-enter the request tracker. Protected upstream.
   */
  _parallelForEachRequest(f: (impl: Exec_RequestImpl) => void): void {
    this._requestTracker!.parallelForEachRequest(f)
  }

  /** @internal system.cpp:211-216 (private; Exec_RequestImpl is a friend). */
  _compile(valueKeys: readonly ExecValueKey[]): [VdfMaskedOutput[], Array<EfLeafNode | null>] {
    const compiler = new Exec_Compiler(this._stage, this._program!, this._runtime!)
    return compiler.Compile(valueKeys)
  }

  /**
   * @internal Returns true if the program has inputs requiring recompilation
   * (system.cpp:218-227).
   */
  _hasPendingRecompilation(): boolean {
    // If there exist any inputs marked for recompilation, then the network
    // needs to be recompiled. If not, there may still be leaf nodes requiring
    // recompilation if the previous round of compilation was interrupted by
    // cycle detection.
    return this._program!.getInputsRequiringRecompilation().size !== 0 ||
      this._program!.wasInterrupted()
  }

  /**
   * @internal Discards all internal state, and constructs new internal data
   * structures leaving the system in the same state as if it was newly
   * constructed (system.cpp:229-248).
   */
  _invalidateAll(): void {
    // Reset data structures in reverse order of construction.
    this._resetMembers()

    // Reconstruct the relevant data structures.
    this._program = new Exec_Program()
    this._runtime = new Exec_Runtime(
      this._program.getTimeInputNode(),
      this._program.getLeafNodeCache())
    this._requestTracker = new Exec_RequestTracker()

    // Initialize time with the default time.
    this._changeTime(new EfTime())
  }

  /** @internal Notifies the system of invalidation due to uncompilation (system.cpp:250-284). */
  _invalidateDisconnectedInputs(): void {
    const invalidationResult = this._program!.invalidateDisconnectedInputs()

    // Invalidate the executor and send request invalidation.
    const runtime = this._runtime!
    const requestTracker = this._requestTracker!
    WorkWithScopedDispatcher(dispatcher => {
      // Invalidate the executor data manager.
      dispatcher.run(() => {
        runtime.invalidateExecutor(invalidationResult.invalidationRequest)
      })

      // Invalidate values in the page cache.
      dispatcher.run(() => {
        runtime.invalidatePageCache(
          invalidationResult.invalidationRequest,
          EfTimeInterval.getFullInterval())
      })

      // Notify all the requests of computed value invalidation. Not all the
      // requests will contain all the invalid leaf nodes, and the request
      // impls are responsible for filtering the provided information.
      dispatcher.run(() => {
        requestTracker.didInvalidateComputedValues(invalidationResult)
      })
    })
  }

  /** @internal Notifies the system of attribute value invalidation (system.cpp:286-322). */
  _invalidateAttributeValues(invalidAttributes: readonly SdfPath[]): void {
    const invalidationResult =
      this._program!.invalidateAttributeAuthoredValues(invalidAttributes)

    // Invalidate the executor and send request invalidation.
    const runtime = this._runtime!
    const requestTracker = this._requestTracker!
    WorkWithScopedDispatcher(dispatcher => {
      // If any of the inputs to exec changed to be time dependent when
      // previously they were not (or vice versa), we need to invalidate the
      // main executor's topological state, such that invalidation traversals
      // pick up the new time dependency.
      if (invalidationResult.isTimeDependencyChange) {
        dispatcher.run(() => {
          runtime.invalidateTopologicalState()
        })
      }

      // Invalidate values in the page cache.
      dispatcher.run(() => {
        runtime.invalidatePageCache(
          invalidationResult.invalidationRequest,
          invalidationResult.invalidInterval)
      })

      // Notify all the requests of computed value invalidation. Not all the
      // requests will contain all the invalid leaf nodes or invalid
      // attributes, and the request impls are responsible for filtering the
      // provided information.
      requestTracker.didInvalidateComputedValues(invalidationResult)
    })
  }

  /** @internal Notifies the system of metadata value invalidation (system.cpp:324-353). */
  _invalidateMetadataValues(
    invalidObjects: ReadonlyArray<readonly [SdfPath, string]>,
  ): void {
    const invalidationResult = this._program!.invalidateMetadataValues(invalidObjects)

    const fullTimeInterval = EfTimeInterval.getFullInterval()

    // Invalidate the executor and send request invalidation.
    const runtime = this._runtime!
    const requestTracker = this._requestTracker!
    WorkWithScopedDispatcher(dispatcher => {
      // Invalidate values in the page cache.
      dispatcher.run(() => {
        runtime.invalidatePageCache(
          invalidationResult.invalidationRequest,
          fullTimeInterval)
      })

      // Notify all the requests of computed value invalidation. Not all the
      // requests will contain all the invalid leaf nodes, and the request
      // impls are responsible for filtering the provided information.
      requestTracker.didInvalidateComputedValues(invalidationResult)
    })
  }

  /**
   * @internal Notifies the system to invalidate value keys that don't have a
   * compiled leaf node (system.cpp:355-359).
   */
  _invalidateUnknownValues(): void {
    this._requestTracker!.didInvalidateUnknownValues()
  }

  // _requestTracker.reset(); _runtime.reset(); _program.reset();
  // (system.cpp:234-237): each pointer is null before its object is
  // destroyed.
  private _resetMembers(): void {
    const requestTracker = this._requestTracker
    this._requestTracker = null
    requestTracker?.destroy()

    const runtime = this._runtime
    this._runtime = null
    runtime?.destroy()

    const program = this._program
    this._program = null
    program?.destroy()
  }
}
