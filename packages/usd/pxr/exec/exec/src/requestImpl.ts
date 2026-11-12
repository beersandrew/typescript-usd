// Ported from OpenUSD 26.11.1: pxr/exec/exec/requestImpl.cpp,
//  pxr/exec/exec/requestImpl.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/requestImpl.h and requestImpl.cpp.
//
// Mapping choices:
// - Exec_RequestImpl is a friend of ExecSystem upstream; it reaches the
//   system's @internal members (_requestTracker, _program, _runtime,
//   _Compile, _Compute, _ComputeWithOverrides, _HasPendingRecompilation).
// - The three DidInvalidateComputedValues overloads are one method that
//   dispatches on the result's fields: `disconnectedLeafNodes` marks
//   Exec_DisconnectedInputsInvalidationResult and `invalidInterval` marks
//   Exec_AttributeValueInvalidationResult.
// - Empty std::functions are null callbacks. TfBits is the base/tf TfBits
//   port; pxr_tsl::robin_map<VdfId, size_t> is a Map keyed by node id.
// - std::unique_ptr<VdfRequest> / <VdfSchedule> are nullable fields;
//   reset() assigns null.
// - The destructor (requestImpl.cpp:54-59) is Destroy().

import { Debug as TfDebug, TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'
import { WorkParallelForN, WorkWithScopedDispatcher } from 'typescript-usd/work'

import { TfBits } from 'typescript-usd/tf'
import type { EfLeafNode } from 'typescript-usd/ef'
import { EfTimeInterval } from 'typescript-usd/ef'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfRequest } from 'typescript-usd/vdf'
import { VdfSchedule } from 'typescript-usd/vdf'
import { VdfScheduler } from 'typescript-usd/vdf'

import { Exec_CacheView } from './cacheView.ts'
import { ExecDebugCodes } from './debugCodes.ts'
import { Exec_DefinitionRegistry } from './definitionRegistry.ts'
import type {
  Exec_AttributeValueInvalidationResult,
  Exec_DisconnectedInputsInvalidationResult,
  Exec_MetadataInvalidationResult,
} from './invalidationResult.ts'
import type {
  ExecRequestComputedValueInvalidationCallback,
  ExecRequestIndexSet,
  ExecRequestTimeChangeInvalidationCallback,
} from './request.ts'
import type { ExecSystem } from './system.ts'
import type { Exec_TimeChangeInvalidationResult } from './timeChangeInvalidationResult.ts'
import { ExecTypeRegistry } from './typeRegistry.ts'
import { Exec_ValueExtractor } from './valueExtractor.ts'
import type { ExecValueKey } from './valueKey.ts'
import type { ExecValueOverrideVector } from './valueOverride.ts'

const EXEC_REQUEST_INVALIDATION = ExecDebugCodes.EXEC_REQUEST_INVALIDATION
const EXEC_REQUEST_EXPIRATION = ExecDebugCodes.EXEC_REQUEST_EXPIRATION

// requestImpl.cpp:61-89
function _OutputInvalidationResultDebugMsg(
  label: string,
  indices: ReadonlySet<number>,
  interval?: EfTimeInterval,
): void {
  TfDebug.msg(EXEC_REQUEST_INVALIDATION, `[${label}]\n`)

  const sortedIndices = [...indices].sort((a, b) => a - b)
  TfDebug.msg(EXEC_REQUEST_INVALIDATION, '    indices:')
  for (const index of sortedIndices) {
    TfDebug.msg(EXEC_REQUEST_INVALIDATION, ` ${index}`)
  }

  if (interval !== undefined) {
    TfDebug.msg(EXEC_REQUEST_INVALIDATION,
      `\n    interval: ${interval.getAsString()}\n`)
  }
}

// Returns a value extractor suitable for the given value key according to its
// computation definition. If any errors occur (e.g. invalid provider, invalid
// computation name, unhandled provider type,) returns an invalid extractor
// (requestImpl.cpp:360-394).
function _GetValueExtractor(
  defReg: Exec_DefinitionRegistry,
  typeReg: ExecTypeRegistry,
  vk: ExecValueKey,
): Exec_ValueExtractor {
  const nullJournal = null

  const provider = vk.getProvider()
  if (!provider.Get().isValid(nullJournal)) {
    TF_CODING_ERROR('Invalid provider')
    return new Exec_ValueExtractor()
  }

  const computationName = vk.getComputationName()
  const def = defReg.getComputationDefinition(
    provider.Get(), computationName,
    new EsfSchemaConfigKey(),
    nullJournal)

  if (!def) {
    TF_CODING_ERROR(
      `Failed to find computation '${computationName}' on provider ` +
      `'${provider.Get().getPath(nullJournal).pathString}'`)
    return new Exec_ValueExtractor()
  }

  return typeReg.getExtractor(def.getExtractionType(provider.Get()))
}

/**
 * Contains data structures necessary to implement exec requests that are
 * independent of scene description (requestImpl.h:41-192).
 *
 * Concrete implementations inherit from Exec_RequestImpl to implement any
 * functionality that is specific to the scene description system.
 */
export abstract class Exec_RequestImpl {
  // The system that issued this request.
  private _system: ExecSystem | null

  // The compiled leaf output.
  private _leafOutputs: VdfMaskedOutput[] = []

  // Value extractors corresponding to each requested value.
  private _extractors: Exec_ValueExtractor[] = []

  // Maps leaf nodes to their index in the array of valueKeys the request was
  // built with.
  private _leafNodeToIndex = new Map<number, number>()

  // The compute request to cache values with.
  private _computeRequest: VdfRequest | null = null

  // The schedule to cache values with.
  private _schedule: VdfSchedule | null = null

  // The combined time interval for which invalidation has been sent out.
  private readonly _lastInvalidatedInterval: EfTimeInterval

  // The combined set of indices for which invalidation has been sent out.
  private readonly _lastInvalidatedIndices = new TfBits()

  // The invalidation callback to invoke when computed values change.
  private _valueCallback: ExecRequestComputedValueInvalidationCallback | null

  // The invalidation callback to invoke when time changes.
  private _timeCallback: ExecRequestTimeChangeInvalidationCallback | null

  /** requestImpl.cpp:40-52 */
  protected constructor(
    system: ExecSystem | null,
    valueCallback: ExecRequestComputedValueInvalidationCallback | null,
    timeCallback: ExecRequestTimeChangeInvalidationCallback | null,
  ) {
    this._system = system
    this._lastInvalidatedInterval = EfTimeInterval.getFullInterval()
    this._valueCallback = valueCallback
    this._timeCallback = timeCallback
    if (TF_VERIFY(this._system, '_system')) {
      this._system!._requestTracker!.insert(this)
    }
  }

  /** ~Exec_RequestImpl (requestImpl.cpp:54-59). */
  destroy(): void {
    if (this._system) {
      this._system._requestTracker!.remove(this)
    }
  }

  /**
   * Notify the request of invalid computed values as a consequence of
   * attribute or metadata authored value invalidation, or of uncompilation
   * (requestImpl.cpp:91-249).
   */
  didInvalidateComputedValues(
    invalidationResult:
      | Exec_AttributeValueInvalidationResult
      | Exec_MetadataInvalidationResult
      | Exec_DisconnectedInputsInvalidationResult,
  ): void {
    if ('disconnectedLeafNodes' in invalidationResult) {
      this._didInvalidateDisconnectedInputs(invalidationResult)
    } else if ('invalidInterval' in invalidationResult) {
      this._didInvalidateAttributeValues(invalidationResult)
    } else {
      this._didInvalidateMetadataValues(invalidationResult)
    }
  }

  // DidInvalidateComputedValues(const Exec_AttributeValueInvalidationResult &)
  // (requestImpl.cpp:91-138).
  private _didInvalidateAttributeValues(
    invalidationResult: Exec_AttributeValueInvalidationResult,
  ): void {
    const funcName = 'Exec_RequestImpl::DidInvalidateComputedValues'
    if (!this._valueCallback || this._leafOutputs.length === 0) {
      TfDebug.msg(EXEC_REQUEST_INVALIDATION,
        `[${funcName}] ${!this._valueCallback
          ? 'No value invalidation callback'
          : 'Request has not been prepared'}\n`)
      return
    }

    // This is considered new invalidation only if the invalidation interval
    // isn't already fully contained in the last invalidation interval.
    const invalidInterval = invalidationResult.invalidInterval
    const isNewlyInvalidInterval = invalidInterval.isFullInterval()
      ? !this._lastInvalidatedInterval.isFullInterval()
      : !this._lastInvalidatedInterval.contains(invalidInterval)
    if (isNewlyInvalidInterval) {
      this._lastInvalidatedInterval.orAssign(invalidInterval)
    }

    // Build a set of invalid indices from the provided invalid leaf nodes.
    const invalidIndices: ExecRequestIndexSet = new Set()
    this._invalidateLeafOutputs(
      isNewlyInvalidInterval,
      invalidationResult.invalidLeafNodes,
      invalidIndices)

    // TODO (upstream): Handle invalid properties which are not computed
    // through exec.

    // Only invoke the invalidation callback if there are any invalid indices
    // from this request.
    if (invalidIndices.size !== 0) {
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(funcName, invalidIndices, invalidInterval)
      }
      this._valueCallback(invalidIndices, invalidInterval)
    }
  }

  // DidInvalidateComputedValues(const Exec_MetadataInvalidationResult &)
  // (requestImpl.cpp:140-182).
  private _didInvalidateMetadataValues(
    invalidationResult: Exec_MetadataInvalidationResult,
  ): void {
    const funcName = 'Exec_RequestImpl::DidInvalidateComputedValues'
    if (!this._valueCallback || this._leafOutputs.length === 0) {
      TfDebug.msg(EXEC_REQUEST_INVALIDATION,
        `[${funcName}] ${!this._valueCallback
          ? 'No value invalidation callback'
          : 'Request has not been prepared'}\n`)
      return
    }

    // For metadata value changes, we always invalidate over the entire time
    // range. This is considered new invalidation if the last invalidation
    // interval isn't already over the entire time range.
    const invalidInterval = EfTimeInterval.getFullInterval()
    const isNewlyInvalidInterval = !this._lastInvalidatedInterval.isFullInterval()
    if (isNewlyInvalidInterval) {
      this._lastInvalidatedInterval.assign(invalidInterval)
    }

    // Build a set of invalid indices from the provided invalid leaf nodes.
    const invalidIndices: ExecRequestIndexSet = new Set()
    this._invalidateLeafOutputs(
      isNewlyInvalidInterval,
      invalidationResult.invalidLeafNodes,
      invalidIndices)

    // Only invoke the invalidation callback if there are any invalid indices
    // from this request.
    if (invalidIndices.size !== 0) {
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(funcName, invalidIndices, invalidInterval)
      }
      this._valueCallback(invalidIndices, invalidInterval)
    }
  }

  // DidInvalidateComputedValues(
  //     const Exec_DisconnectedInputsInvalidationResult &)
  // (requestImpl.cpp:184-249).
  private _didInvalidateDisconnectedInputs(
    invalidationResult: Exec_DisconnectedInputsInvalidationResult,
  ): void {
    const funcName = 'Exec_RequestImpl::DidInvalidateComputedValues'
    if (this._leafOutputs.length === 0) {
      TfDebug.msg(EXEC_REQUEST_INVALIDATION,
        `[${funcName}] Request has not been prepared\n`)
      return
    }

    if (!this._valueCallback) {
      TfDebug.msg(EXEC_REQUEST_INVALIDATION,
        `[${funcName}] No value invalidation callback\n`)

      // If the callback is empty, it is still necessary to invalidate the
      // schedule if any of the disconnected leaf nodes correspond to value
      // keys in this request. However, we can skip building the set of
      // invalid indices, since there is no callback to invoke.
      this._invalidateScheduleForLeafNodes(invalidationResult.disconnectedLeafNodes)
      return
    }

    // For topological edits like disconnected inputs we always invalidate
    // over the entire time range. This is considered new invalidation if the
    // last invalidation interval isn't already over the entire time range.
    const invalidInterval = EfTimeInterval.getFullInterval()
    const isNewlyInvalidInterval = !this._lastInvalidatedInterval.isFullInterval()
    if (isNewlyInvalidInterval) {
      this._lastInvalidatedInterval.assign(invalidInterval)
    }

    // Build a set of invalid indices from the provided invalid leaf nodes.
    const invalidIndices: ExecRequestIndexSet = new Set()
    this._invalidateLeafOutputs(
      isNewlyInvalidInterval,
      invalidationResult.disconnectedLeafNodes,
      invalidIndices)

    // If any disconnected leaf nodes correspond to value keys in the request,
    // invalidate the schedule to signal that it needs to be rebuilt.
    if (invalidIndices.size !== 0) {
      this._schedule = null
    }

    this._invalidateLeafOutputs(
      isNewlyInvalidInterval,
      invalidationResult.invalidLeafNodes,
      invalidIndices)

    // Only invoke the invalidation callback if there are any invalid indices
    // from this request.
    if (invalidIndices.size !== 0) {
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(funcName, invalidIndices, invalidInterval)
      }
      this._valueCallback(invalidIndices, invalidInterval)
    }
  }

  /**
   * Notify the request to invalidate value keys that don't have a compiled
   * leaf node (requestImpl.cpp:251-278).
   */
  didInvalidateUnknownValues(): void {
    // Gather all indices that don't have a compiled leaf output.
    const invalidIndices: ExecRequestIndexSet = new Set()
    for (let index = 0; index < this._leafOutputs.length; ++index) {
      if (!this._leafOutputs[index]!.asBool() &&
        !this._lastInvalidatedIndices.isSet(index)) {
        invalidIndices.add(index)
        this._lastInvalidatedIndices.Set(index)
      }
    }

    // Only invoke the invalidation callback if there are any invalid indices
    // from this request.
    if (invalidIndices.size !== 0) {
      const invalidInterval = EfTimeInterval.getFullInterval()
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(
          'Exec_RequestImpl::DidInvalidateUnknownValues', invalidIndices, invalidInterval)
      }
      // Upstream invokes the callback without checking it
      // (requestImpl.cpp:276).
      this._valueCallback!(invalidIndices, invalidInterval)
    }
  }

  /** Notify the request of time having changed (requestImpl.cpp:280-325). */
  didChangeTime(invalidationResult: Exec_TimeChangeInvalidationResult): void {
    const funcName = 'Exec_RequestImpl::DidChangeTime'
    if (!this._timeCallback || this._leafOutputs.length === 0) {
      // requestImpl.cpp:287: upstream tests _valueCallback for the message.
      TfDebug.msg(EXEC_REQUEST_INVALIDATION,
        `[${funcName}] ${!this._valueCallback
          ? 'No time invalidation callback'
          : 'Request has not been prepared'}\n`)
      return
    }

    // Build a set of invalid indices from the provided invalid leaf nodes.
    const invalidIndices: ExecRequestIndexSet = new Set()
    for (const leafNode of invalidationResult.invalidLeafNodes) {
      // All requests are notified about all time changes, but not all the
      // invalid leaf nodes may be included in this particular request.
      const index = this._leafNodeToIndex.get(leafNode.getId())
      if (index === undefined) {
        continue
      }

      // Insert the index into the set of invalid indices.
      invalidIndices.add(index)
    }

    // TODO (upstream): Handle all time-dependent properties which are not
    // compiled in exec.

    // Only invoke the invalidation callback if there are any invalid indices
    // from this request.
    if (invalidIndices.size !== 0) {
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(funcName, invalidIndices)
      }
      this._timeCallback(invalidIndices)
    }
  }

  /**
   * Expires all request indices and discards the request
   * (requestImpl.cpp:327-358). Sends value invalidation for all indices over
   * all time and renders the request unusable for any future operation.
   */
  expire(): void {
    TfDebug.msg(EXEC_REQUEST_EXPIRATION,
      '[Exec_RequestImpl::Expire] Expiring request\n')

    if (!TF_VERIFY(this._system, '_system', 'Attempted to expire an expired request')) {
      return
    }

    // If the request has never been prepared (or just contains no values to
    // compute) there's no need push index-specific expiration.
    if (this._leafOutputs.length !== 0) {
      const allIndices: ExecRequestIndexSet = new Set()
      const numLeafOutputs = this._leafOutputs.length
      for (let i = 0; i < numLeafOutputs; ++i) {
        allIndices.add(i)
      }
      this._expireIndices(allIndices)
    }

    // Because we're expiring the whole request, we do more than just expiring
    // all the indices. It is guaranteed that no more invalidation can occur so
    // the request removes itself from the system's tracker and drops all its
    // data structures.
    this._discard()
  }

  /** Compiles outputs for the value keys in the request (requestImpl.cpp:396-476). */
  protected _compile(valueKeys: readonly ExecValueKey[]): void {
    if (!TF_VERIFY(this._system, '_system')) {
      return
    }
    const system = this._system!

    // Even if the request is already compiled, we always need to perform
    // recompilation, because doing so might make new connections that
    // invalidate the request's schedule.

    let leafNodes: Array<EfLeafNode | null> = []

    // Compile the value keys.
    WorkWithScopedDispatcher(d => {
      d.run(() => {
        const leafOutputsAndNodes = system._compile(valueKeys)
        this._leafOutputs = leafOutputsAndNodes[0]
        leafNodes = leafOutputsAndNodes[1]
      })

      {
        // Collect the extractors. This is redundant work as compilation must
        // also look up the computation definitions for each value key.
        const defReg = Exec_DefinitionRegistry.GetInstance()
        const typeReg = ExecTypeRegistry.GetInstance()
        const extractors: Exec_ValueExtractor[] = []
        for (let i = 0; i < valueKeys.length; ++i) {
          extractors.push(new Exec_ValueExtractor())
        }
        this._extractors = extractors
        WorkParallelForN(valueKeys.length, (i, n) => {
          for (; i < n; ++i) {
            extractors[i] = _GetValueExtractor(defReg, typeReg, valueKeys[i]!)
          }
        })
      }
    })

    if (!TF_VERIFY(this._leafOutputs.length === valueKeys.length,
      '_leafOutputs.size() == valueKeys.size()') ||
      !TF_VERIFY(this._extractors.length === valueKeys.length,
        '_extractors.size() == valueKeys.size()')) {
      // If we somehow got the wrong number of outputs from compilation or the
      // wrong number of extractors, we have no idea if the indices correspond
      // correctly so zero out all the outputs & extractors.
      this._leafOutputs = valueKeys.map(() => new VdfMaskedOutput())
      this._extractors = valueKeys.map(() => new Exec_ValueExtractor())
    }

    // If the schedule is still valid, then we are done.
    if (this._schedule && this._schedule.isValid()) {
      return
    }

    // After rescheduling, we need to invalidate all data dependent on the
    // compiled network and the set of compiled leaf outputs.
    this._computeRequest = null
    this._schedule = null
    this._lastInvalidatedIndices.resize(this._leafOutputs.length)
    // These bits are set instead of cleared because clients are notified of
    // invalidation only after computing values.
    this._lastInvalidatedIndices.setAll()

    // We must greedily build the leaf node to index map. When requests are
    // informed of network edits, some leaf nodes may have already been
    // disconnected from their source output.
    this._buildLeafNodeToIndexMap(valueKeys, leafNodes)
  }

  /** Builds the schedule for the request (requestImpl.cpp:478-510). */
  protected _Schedule(): void {
    // If there's nothing to compute, there's nothing to schedule.
    if (this._leafOutputs.length === 0) {
      this._schedule = null
      return
    }

    // The compute request only needs to be rebuilt if the compiled outputs
    // change.
    if (!this._computeRequest) {
      // All outputs received from compilation are expected to be valid. If
      // they are not, an error should have already been issued.
      const outputs: VdfMaskedOutput[] = []
      for (const mo of this._leafOutputs) {
        if (mo.asBool()) {
          outputs.push(mo)
        }
      }
      this._computeRequest = new VdfRequest(outputs)
    }

    // We only need to schedule if there isn't already a valid schedule.
    if (!this._schedule || !this._schedule.isValid()) {
      this._schedule = new VdfSchedule()
      VdfScheduler.schedule(
        this._computeRequest, this._schedule, /* topologicallySort */ false)
    }
  }

  /** Computes the value keys in the request (requestImpl.cpp:512-533). */
  protected _compute(): Exec_CacheView {
    if (!TF_VERIFY(this._system, '_system') || !this._schedule) {
      return new Exec_CacheView()
    }
    const system = this._system!

    // Reset the last invalidation state so that new invalidation is properly
    // sent out as clients renew their interest in the computed values
    // included in this request.
    this._lastInvalidatedIndices.clearAll()
    this._lastInvalidatedInterval.clear()

    // Compute the values.
    system._compute(this._schedule, this._computeRequest!)

    // Return an exec cache view for the computed values.
    return new Exec_CacheView(
      system._runtime!.getDataManager(), this._leafOutputs, this._extractors)
  }

  /**
   * Computes the value keys in the request in the presence of the provided
   * `valueOverrides` (requestImpl.cpp:535-548).
   */
  protected _computeWithOverrides(valueOverrides: ExecValueOverrideVector): Exec_CacheView {
    if (!TF_VERIFY(this._system, '_system') || !this._schedule) {
      return new Exec_CacheView()
    }

    const executor = this._system!._computeWithOverrides(
      this._schedule, this._computeRequest!, valueOverrides)

    // A null executor (an error, already reported) makes an invalid view,
    // as the cache view built from an empty unique_ptr is unusable upstream.
    if (!executor) {
      return new Exec_CacheView()
    }
    return new Exec_CacheView(executor, this._leafOutputs, this._extractors)
  }

  /**
   * Returns true if the request needs to be compiled (requestImpl.cpp:
   * 550-556). A request may skip compilation if its schedule is up-to-date
   * and there is no pending recompilation in the network.
   */
  protected _requiresCompilation(): boolean {
    return !this._schedule
      || !this._schedule.isValid()
      || (TF_VERIFY(this._system, '_system') && this._system!._hasPendingRecompilation())
  }

  /**
   * Expires the indices in `expired` (requestImpl.cpp:558-598). Invalidation
   * callbacks will be invoked for these indices one final time. No values
   * will be extractable and no further invalidation will be sent for these
   * indices.
   */
  protected _expireIndices(expired: ReadonlySet<number>): void {
    // If the request has never been prepared, there's no invalidation to push
    // to clients.
    if (this._leafOutputs.length === 0) {
      return
    }

    TfDebug.msg(EXEC_REQUEST_EXPIRATION,
      `[Exec_RequestImpl::_ExpireIndices] Expiring ${expired.size} indices\n`)

    const isNewlyInvalidInterval = !this._lastInvalidatedInterval.isFullInterval()
    const newlyInvalidIndices: ExecRequestIndexSet = new Set()
    for (const idx of expired) {
      if (isNewlyInvalidInterval || !this._lastInvalidatedIndices.isSet(idx)) {
        newlyInvalidIndices.add(idx)
        this._lastInvalidatedIndices.Set(idx)
      }
      this._leafOutputs[idx] = new VdfMaskedOutput()
      this._extractors[idx] = new Exec_ValueExtractor()
    }
    this._schedule = null
    this._computeRequest = null

    if (this._valueCallback && newlyInvalidIndices.size !== 0) {
      if (TfDebug.isEnabled(EXEC_REQUEST_INVALIDATION)) {
        _OutputInvalidationResultDebugMsg(
          'Exec_RequestImpl::_ExpireIndices', expired, EfTimeInterval.getFullInterval())
      }
      this._valueCallback(expired, EfTimeInterval.getFullInterval())
    }

    this._lastInvalidatedInterval.assign(EfTimeInterval.getFullInterval())
  }

  /**
   * Removes the request from the system (requestImpl.cpp:600-615). This
   * prevents any further notification and releases internal request data
   * structures.
   */
  protected _discard(): void {
    // If we get here because the system released its request tracker, the
    // tracker is null; in that case, we don't need to remove this impl from
    // the tracker, since the tracker is being deleted.
    const tracker = this._system!._requestTracker
    if (tracker) {
      tracker.remove(this)
    }
    this._system = null
    this._leafOutputs = []
    this._extractors = []
    this._leafNodeToIndex = new Map()
    this._valueCallback = null
    this._timeCallback = null
  }

  // Ensures the _leafNodeToIndex map is up-to-date (requestImpl.cpp:617-642).
  private _buildLeafNodeToIndexMap(
    valueKeys: readonly ExecValueKey[],
    leafNodes: ReadonlyArray<EfLeafNode | null>,
  ): void {
    const program = this._system!._program
    if (!program) {
      return
    }

    // Invalid leaf nodes will need to be converted into indices for client
    // notification. Here, we build a data structure for efficient lookup.
    this._leafNodeToIndex.clear()
    for (let i = 0; i < valueKeys.length; ++i) {
      const leafNode = leafNodes[i]
      if (!leafNode) {
        continue
      }

      // emplace: the first index for a leaf node wins.
      if (!this._leafNodeToIndex.has(leafNode.getId())) {
        this._leafNodeToIndex.set(leafNode.getId(), i)
      }
    }
  }

  // Turns invalid leaf nodes into a set of requested - and not previously
  // invalidated - indices (requestImpl.cpp:644-674).
  private _invalidateLeafOutputs(
    isNewlyInvalidInterval: boolean,
    leafNodes: readonly VdfNode[],
    invalidIndices: ExecRequestIndexSet,
  ): void {
    if (leafNodes.length === 0 || !TF_VERIFY(invalidIndices, 'invalidIndices')) {
      return
    }

    // Build a set of invalid indices from the provided invalid leaf nodes.
    for (const leafNode of leafNodes) {
      // All requests are notified about all computed value invalidation, but
      // not all the invalid leaf nodes may be included in this particular
      // request.
      const index = this._leafNodeToIndex.get(leafNode.getId())
      if (index === undefined) {
        continue
      }

      // Determine if invalidation has already been sent out for the invalid
      // index. If not, record this index as being invalid.
      if (isNewlyInvalidInterval || !this._lastInvalidatedIndices.isSet(index)) {
        invalidIndices.add(index)
      }
      this._lastInvalidatedIndices.Set(index)
    }
  }

  // Resets the schedule if there are any topological network edits to leaf
  // nodes that are referenced in this request (requestImpl.cpp:676-692).
  private _invalidateScheduleForLeafNodes(disconnectedLeafNodes: readonly VdfNode[]): void {
    if (disconnectedLeafNodes.length === 0) {
      return
    }

    for (const leafNode of disconnectedLeafNodes) {
      if (this._leafNodeToIndex.has(leafNode.getId())) {
        this._schedule = null
        return
      }
    }
  }
}
