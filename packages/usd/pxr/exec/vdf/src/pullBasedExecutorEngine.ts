// Ported from OpenUSD 26.11.1: pxr/exec/vdf/pullBasedExecutorEngine.h,
//  pxr/exec/vdf/schedule.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/pullBasedExecutorEngine.h.
//
// VdfPullBasedExecutorEngine<DataManagerType> is a class generic over the
// data manager; executors pass the class itself as their EngineType (see the
// header of dataManagerBasedExecutor.ts). DataManagerType must derive from
// VdfExecutorDataManager (VdfDataManagerVector, VdfDataManagerHashTable).
//
// Mapping notes:
// - The SpeculationExecutorEngine typedef (pullBasedExecutorEngine.h:75-77)
//   names VdfSpeculationExecutorEngine, which is not ported
//   (openexec-speculation).
// - VdfExecutionStats is not ported (openexec-stats): where upstream logs to
//   non-null stats, the engine fails loudly.
// - TfBits executedNodes becomes a Uint8Array of flags.
// - VDF_PBEE_TRACE_* profiling macros are compiled out upstream
//   (pullBasedExecutorEngine.h:41-48) and dropped here.
// - The VDF_FOR_EACH_SCHEDULED_OUTPUT_ID macro (schedule.h:652-656) is
//   spelled out with GetOutputIdsBegin/GetOutputIdsEnd, NotEquals and
//   Increment on VdfSchedule::OutputId.

import { Debug as TfDebug, TF_CODING_ERROR, TF_DEV_AXIOM, TF_WARN } from 'typescript-usd/tf'

import { VdfContext } from './context.ts'
import { VDF_FATAL_ERROR } from './error.ts'
import { VdfEvaluationState } from './evaluationState.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorDataManager } from './executorDataManager.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import type { VdfExecutionStats, VdfExecutorInterface } from './executorInterface.ts'
import { VdfExecutionTypeRegistry } from './executionTypeRegistry.ts'
import type { VdfInput } from './input.ts'
import { VdfMask } from './mask.ts'
import type { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfGetAssociatedSourceOutput } from './networkUtil.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput } from './poolChainIndex.ts'
import { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'
import type { VdfVector } from './vector.ts'

/** VdfSchedule::OutputId (schedule.h:91-158). */
type _OutputId = ReturnType<VdfSchedule['getOutputId']>

/** The stages that a node goes through in execution (pullBasedExecutorEngine.h:120-133). */
const enum _ExecutionStage {
  ExecutionStageStart, // Nodes start in this stage.
  ExecutionStagePreRequisitesDone, // After prerequisites have been computed.
  ExecutionStageReadsDone, // After the reads have finished (speculation only).
  ExecutionStageCompute, // Final stage before node computation.
}

/** The state needed to compute an output (pullBasedExecutorEngine.h:232-261). */
class _OutputToExecute {
  readonly outputId: _OutputId
  stage = _ExecutionStage.ExecutionStageStart
  lockedCacheMask: VdfMask
  affective: boolean
  absorbLockedCache = false

  constructor(outputId: _OutputId, lockedCacheMask: VdfMask, affective: boolean) {
    this.outputId = outputId
    this.lockedCacheMask = lockedCacheMask
    this.affective = affective
  }
}

// FAITHFULNESS-DEBT(openexec-stats): the engine logs node evaluation events
// and element counts to VdfExecutionStats (pullBasedExecutorEngine.h:403-408,
// 516-522, 914-921, 1051-1058, 1073-1075) -> port executionStats.{h,cpp} and
// log here. Executors without stats (the only kind that can exist while the
// stats class is not ported) take upstream's no-stats path.
function _FailOnStats(stats: VdfExecutionStats | null, site: string): void {
  if (stats) {
    const message = `VdfPullBasedExecutorEngine (pxr/exec/vdf/${site}): ` +
      'VdfExecutionStats is not ported (openexec-stats)'
    TF_CODING_ERROR(message)
    throw new Error(message)
  }
}

/**
 * VdfPullBasedExecutorEngine (pullBasedExecutorEngine.h:66-315): a
 * collection of common functions used by pull based executors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class VdfPullBasedExecutorEngine<DataManagerType extends VdfExecutorDataManager<any>> {
  // pullBasedExecutorEngine.h:304: the executor that uses this engine.
  private readonly _executor: VdfExecutorInterface

  // pullBasedExecutorEngine.h:308: the data manager for this engine.
  private readonly _dataManager: DataManagerType

  // pullBasedExecutorEngine.h:313: cached output data handles.
  private readonly _dataHandleCache: ReturnType<DataManagerType['getDataHandle']>[] = []

  /** Constructor (pullBasedExecutorEngine.h:81-86). */
  constructor(executor: VdfExecutorInterface, dataManager: DataManagerType) {
    this._executor = executor
    this._dataManager = dataManager
  }

  /**
   * RunSchedule (pullBasedExecutorEngine.h:91-98, 319-374). Executes the
   * schedule with a computeRequest and an optional errorLogger. Invokes
   * `callback` after evaluation of each uncached output in the request, and
   * immediately after hitting the cache for cached outputs in the request.
   */
  runSchedule(
    schedule: VdfSchedule,
    computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null,
    callback: (maskedOutput: VdfMaskedOutput, index: number) => void = () => {}): void {
    // Make sure the data manager is appropriately sized.
    this._dataManager.resize(schedule.getNetwork()!)

    // Indicates which nodes have been executed.
    const executedNodes = new Uint8Array(schedule.getScheduleNodeVector().length)

    // The persistent evaluation state
    const state = new VdfEvaluationState(this._getExecutor(), schedule, errorLogger)

    // Now execute the uncached, requested outputs.
    const requestView = new VdfRequest.IndexedView(computeRequest)
    for (let i = 0; i < requestView.getSize(); ++i) {
      // Skip outputs not included in the request.
      const maskedOutput = requestView.Get(i)
      if (!maskedOutput) {
        continue
      }

      // Skip outputs that have already been cached. However, we must invoke
      // the callback to notify the client side that evaluation of the
      // requested output has completed.
      const output = maskedOutput.GetOutput()!
      const mask = maskedOutput.GetMask()
      if (this._getExecutor().getOutputValue(output, mask)) {
        callback(maskedOutput, i)
        continue
      }

      this._executeOutput(state, output, executedNodes)

      // If we've been interrupted, bail out.
      if (this._getExecutor().hasBeenInterrupted()) {
        break
      }

      // Invoke the callback once the output has been evaluated, but only if
      // the executor has not been interrupted.
      else {
        callback(maskedOutput, i)
      }
    }
  }

  /** _GetExecutor (pullBasedExecutorEngine.h:174). */
  protected _getExecutor(): VdfExecutorInterface {
    return this._executor
  }

  /** _GetDataManager (pullBasedExecutorEngine.h:178). */
  protected _getDataManager(): DataManagerType {
    return this._dataManager
  }

  /** _CopyCache (pullBasedExecutorEngine.h:376-411). */
  protected _copyCache(
    toOutput: VdfOutput,
    toBuffer: VdfExecutorBufferData,
    fromOutput: VdfOutput,
    fromMask: VdfMask): VdfVector {
    // We must look up the data through the executor, instead of the data
    // manager, because the data may live in the parent executor.
    const sourceVector = this._executor.getOutputValue(fromOutput, fromMask)

    if (!sourceVector) {
      // CODE_COVERAGE_OFF - We should never hit this
      VDF_FATAL_ERROR(fromOutput.getNode(), 'No cache for output ' + fromOutput.getDebugName())
      // CODE_COVERAGE_ON
    }

    const result = this._dataManager.createOutputCache(toOutput, toBuffer)
    result.copy(sourceVector!, fromMask)

    _FailOnStats(this._executor.getExecutionStats(), 'pullBasedExecutorEngine.h:403-408')

    return result
  }

  /** _PassOrCopySourceOutputBuffer (pullBasedExecutorEngine.h:414-441). */
  protected _passOrCopySourceOutputBuffer(
    dataHandle: ReturnType<DataManagerType['getDataHandle']>,
    output: VdfOutput,
    source: VdfOutput,
    inputMask: VdfMask,
    schedule: VdfSchedule): VdfVector {
    // Touch all the outputs between the source output and the output that
    // was passed the buffer.
    let betweenOutput = VdfGetAssociatedSourceOutput(output)
    while (betweenOutput && betweenOutput !== source) {
      this._getExecutor()._touchOutput(betweenOutput)
      betweenOutput = VdfGetAssociatedSourceOutput(betweenOutput)
    }

    return this._passOrCopyBufferInternal(dataHandle, output, source, inputMask, schedule)
  }

  /** _PassOrCopyBufferInternal (pullBasedExecutorEngine.h:443-541). */
  protected _passOrCopyBufferInternal(
    dataHandle: ReturnType<DataManagerType['getDataHandle']>,
    output: VdfOutput,
    source: VdfOutput,
    inputMask: VdfMask,
    schedule: VdfSchedule): VdfVector {
    // We can re-use our inputs cache (without any copying) if our input has
    // one and only one output (and that's us).
    const sourceHandle = this._dataManager.getDataHandle(source.getId())
    const sourceId = schedule.getOutputId(source)

    let result: VdfVector | null = null

    // If this is the output that 'source' is supposed to pass its buffer to,
    // do so, otherwise copy.
    if (this._dataManager.isValidDataHandle(sourceHandle) &&
        output === schedule.getPassToOutput(sourceId)) {
      const sourceBuffer = this._dataManager.getBufferData(sourceHandle)

      // If the source output does not contain any data, don't even bother
      // with mung buffer locking or buffer passing.
      if (sourceBuffer.getExecutorCache() &&
          sourceBuffer.getExecutorCacheMask().isAnySet()) {
        // Decide whether mung buffer locking should be in effect: if the
        // current output has been recently invalidated while the source
        // output has not, "lock" the buffer by copying it instead of
        // passing it.
        if (this._dataManager.hasInvalidationTimestampMismatch(sourceHandle, dataHandle)) {
          if (TfDebug.isEnabled('VDF_MUNG_BUFFER_LOCKING')) {
            TfDebug.msg('VDF_MUNG_BUFFER_LOCKING',
              `Mung buffer locking between outputs '${source.getDebugName()}' ` +
              `and '${output.getDebugName()}'.\n`)
          }
        }

        // If mung buffers are not supposed to be locked, pass the buffer
        // data from the source output to the destination output.
        else {
          // If the source output does not contain all the data that has been
          // requested in the inputMask, we cannot pass buffers.
          if (sourceBuffer.getExecutorCacheMask().contains(inputMask)) {
            const keepMask = schedule.getKeepMask(sourceId)
            result = this._dataManager.passBuffer(
              source, sourceBuffer,
              output, this._dataManager.getBufferData(dataHandle),
              keepMask)

            _FailOnStats(this._executor.getExecutionStats(), 'pullBasedExecutorEngine.h:516-522')
          }

          // Note that result can be NULL and we can still end up in
          // _CopyCache.
        }
      }
    }

    if (!result) {
      result = this._copyCache(
        output, this._dataManager.getBufferData(dataHandle), source, inputMask)
    }

    return result
  }

  /** _PrepareReadWriteBuffer (pullBasedExecutorEngine.h:543-568). */
  protected _prepareReadWriteBuffer(
    dataHandle: ReturnType<DataManagerType['getDataHandle']>,
    input: VdfInput,
    mask: VdfMask,
    schedule: VdfSchedule): void {
    // Get the output associated with the read/write input.
    const output = input.getAssociatedOutput()
    TF_DEV_AXIOM(output, 'output')

    // We can re-use our inputs cache (without any copying) if our input has
    // one and only one output (and that's us).
    const numInputNodes = input.getNumConnections()
    if (numInputNodes === 1 && !input.Get(0).GetMask().isAllZeros()) {
      this._passOrCopyBufferInternal(
        dataHandle, output, input.Get(0).getSourceOutput(), mask, schedule)
      return
    }

    // If we have no inputs, provide a fresh new cache.
    this._dataManager.createOutputCache(output, this._dataManager.getBufferData(dataHandle))
  }

  /** _IsNotPassing (pullBasedExecutorEngine.h:219-226). */
  protected static _isNotPassing(
    output: VdfOutput, outputId: _OutputId, schedule: VdfSchedule): boolean {
    return output.getAssociatedInput() !== null && !schedule.getPassToOutput(outputId)
  }

  /** _PushBackOutput (pullBasedExecutorEngine.h:570-594). */
  private _pushBackOutput(
    outputs: _OutputToExecute[],
    lockedCacheMask: VdfMask,
    output: VdfOutput,
    schedule: VdfSchedule): boolean {
    const outputId = schedule.getOutputId(output)

    if (outputId.isValid()) {
      outputs.push(new _OutputToExecute(
        outputId, lockedCacheMask, schedule.isAffective(outputId)))
      return true
    }

    // The output to push is not actually scheduled, which guarantees that is
    // value will never be needed by any computations. So just skip it.
    return false
  }

  /** _UpdateOutputForSMBL (pullBasedExecutorEngine.h:596-689). */
  private _updateOutputForSMBL(
    output: VdfOutput,
    stackEntry: _OutputToExecute,
    schedule: VdfSchedule): boolean {
    // Retrieve the output data handle.
    const dataHandle = this._dataManager.getDataHandle(output.getId())
    if (!this._dataManager.isValidDataHandle(dataHandle)) {
      return false
    }

    // Get the invalidation timestamp at the output.
    const invalidationTs = this._dataManager.getInvalidationTimestamp(dataHandle)

    // If this output has never been invalidated, bail out.
    if (!invalidationTs) {
      return false
    }

    // If this output was not invalidated during the last invalidation round,
    // do not consider it for sparse mung buffer locking. We also have to
    // reset the locked cache mask when crossing the timestamp edge.
    if (invalidationTs !== this._dataManager.getInvalidationTimestamp()) {
      if (!stackEntry.lockedCacheMask.IsEmpty()) {
        stackEntry.lockedCacheMask = new VdfMask()
        return true
      }
      return false
    }

    let updated = false

    // Append the data sitting at this output to the locked cache mask. This
    // grows the lockedCacheMask as we traverse up the pool chain.
    const outputBuffer = this._dataManager.getBufferData(dataHandle)
    const smblData = this._dataManager.getOrCreateSMBLData(dataHandle)
    const outputId = stackEntry.outputId
    const keepMask = schedule.getKeepMask(outputId)
    if (outputBuffer.getExecutorCache() &&
        !outputBuffer.getExecutorCacheMask().IsEmpty() &&
        !keepMask.IsEmpty()) {
      stackEntry.lockedCacheMask = smblData.extendLockedCacheMask(
        stackEntry.lockedCacheMask, outputBuffer.getExecutorCacheMask())
      stackEntry.absorbLockedCache = true
      updated = true
    }

    // If the locked cache mask is still empty, than there is no work to do.
    if (stackEntry.lockedCacheMask.IsEmpty()) {
      return false
    }

    // Before determining the affective-ness of the node, insure that the
    // data indicated by the keep mask is stored in the executor cache, and
    // that any bits not contained in the executor cache are not contained in
    // the locked cache mask.
    if (!keepMask.IsEmpty()) {
      stackEntry.lockedCacheMask = smblData.removeUncachedMask(
        stackEntry.lockedCacheMask, outputBuffer.getExecutorCacheMask(), keepMask)
      updated = true
    }

    // If this node is affective in the schedule, we may be able to get away
    // without computing it, and making it un-affective.
    if (stackEntry.affective &&
        !smblData.computeAffectiveness(
          stackEntry.lockedCacheMask, schedule.getAffectsMask(outputId))) {
      stackEntry.affective = false
      return true
    }

    return updated
  }

  /** _ExecuteOutput (pullBasedExecutorEngine.h:691-903). */
  private _executeOutput(
    state: VdfEvaluationState,
    output: VdfOutput,
    executedNodes: Uint8Array): void {
    const trace = TfDebug.isEnabled('VDF_PBEE_TRACE')
    if (trace) {
      TfDebug.msg('VDF_PBEE_TRACE', '----------------- _ExecuteOutput --------- \n')
    }

    // The current schedule
    const schedule = state.getSchedule()

    // Is Sparse Mung Buffer Locking enabled for this round of evaluation?
    // Executors that may be interrupted do not yet support SMBL.
    const enableSMBL =
      schedule.hasSMBL() && !this._getExecutor().getInterruptionFlag()

    // This is the stack of the outputs currently in the process of execution.
    const outputsStack: _OutputToExecute[] = []

    // Add the first output to the stack.
    this._pushBackOutput(outputsStack, new VdfMask(), output, schedule)

    while (outputsStack.length !== 0) {
      // If we've been interrupted, bail out.
      if (this._getExecutor().hasBeenInterrupted()) {
        break
      }

      // Stack Top State
      const top = outputsStack[outputsStack.length - 1]!
      const outputId = top.outputId
      let affective = top.affective
      let lockedCacheMask = top.lockedCacheMask
      let absorbLockedCache = top.absorbLockedCache

      const node = schedule.getNode(outputId)!
      let added = false

      // The switch with fall-through (pullBasedExecutorEngine.h:739-901) is
      // spelled as a sequence of stage checks.
      let stage = top.stage

      if (stage === _ExecutionStage.ExecutionStageStart) {
        if (trace) {
          TfDebug.msg('VDF_PBEE_TRACE', `{ BeginNode("${node.getDebugName()}");\n`)
        }

        // We have to compute if
        //   o The node has not been executed, yet
        //   o The output is dirty
        //   o The cache is empty
        //   o The computed mask doesn't cover what is asked for in the
        //     schedule.
        const scheduledOutput = schedule.GetOutput(outputId)!
        const requestMask = schedule.getRequestMask(outputId)
        if (executedNodes[schedule.getScheduleNodeIndex(outputId)] ||
            this._getExecutor().getOutputValue(scheduledOutput, requestMask)) {
          // Pop off the top of the output stack
          outputsStack.pop()

          if (trace) {
            TfDebug.msg('VDF_PBEE_TRACE', ' EndNodeFoundCache(); }\n')
          }
          continue
        }

        // Update the output for SMBL. This refreshes the affective-ness flag,
        // the lockedCacheMask and the flag that indicates whether the locked
        // cache should be absorbed into the executor cache.
        if (enableSMBL && Vdf_IsPoolOutput(scheduledOutput)) {
          // No new outputs have been pushed onto the stack at this point, so
          // the top is still the output we are currently executing.
          const stackTop = top
          if (this._updateOutputForSMBL(scheduledOutput, stackTop, schedule)) {
            affective = stackTop.affective
            lockedCacheMask = stackTop.lockedCacheMask
            absorbLockedCache = stackTop.absorbLockedCache
          }
        }

        // The first stage of computation is to execute all the prerequisites
        // for current output. Mark that we've processed the prerequisites.
        top.stage = _ExecutionStage.ExecutionStagePreRequisitesDone

        // Push back all the prerequisites if this output will do anything
        if (affective) {
          for (const input of schedule.getInputs(node)) {
            if (input.input.getSpec().isPrerequisite()) {
              added = this._pushBackOutput(
                outputsStack, new VdfMask(), input.source!, schedule) || added
            }
          }
        }

        // If we added inputs then we want to go back to the top of the loop
        // and execute our inputs, otherwise we fall through to the next stage.
        if (added) {
          continue
        }
        stage = _ExecutionStage.ExecutionStagePreRequisitesDone
      }

      if (stage === _ExecutionStage.ExecutionStagePreRequisitesDone) {
        // Now that all the prerequisites are done, use them to determine what
        // other inputs we need to run to satisfy the current output. Mark
        // that all the inputs have now been processed for the current output.
        top.stage = _ExecutionStage.ExecutionStageCompute

        // Outputs added are executed in reverse order, so we push last the
        // nodes that we want to run first. Only run the reads if the output
        // is expected to modify anything.
        if (affective) {
          // Get the list of required inputs based on the prerequisite
          // computations.
          const inputsPredicate =
            node.getRequiredInputsPredicate(new VdfContext(state, node))

          // Run the required reads last.
          if (inputsPredicate.hasRequiredReads()) {
            for (const input of schedule.getInputs(node)) {
              if (inputsPredicate.isRequiredRead(input.input)) {
                added = this._pushBackOutput(
                  outputsStack, new VdfMask(), input.source!, schedule) || added
              }
            }
          }
        }

        // Run the read/writes first, so that we can maximize the chance of
        // being able to re-use the kept buffers for speculations.
        for (const input of schedule.getInputs(node)) {
          const assocOutput = input.input.getAssociatedOutput()
          if (!assocOutput) {
            continue
          }

          // Does this output have a pass-through scheduled?
          const assocOutputId = schedule.getOutputId(assocOutput)
          if (assocOutputId.isValid()) {
            const fromBufferOutput = schedule.getFromBufferOutput(assocOutputId)
            if (fromBufferOutput) {
              added = this._pushBackOutput(
                outputsStack, lockedCacheMask, fromBufferOutput, schedule) || added
              continue
            }
          }

          // If the associated output is not scheduled, or it does not have a
          // pass-through scheduled, we need to consider all connected source
          // outputs!
          added = this._pushBackOutput(
            outputsStack, lockedCacheMask, input.source!, schedule) || added
        }

        // If we added inputs then we want to go back to the top of the loop
        // and execute our inputs, otherwise we fall through to the next stage.
        if (added) {
          continue
        }
      }

      // default:

      // Set a bit indicating that this node has been executed.
      executedNodes[schedule.getScheduleNodeIndex(outputId)] = 1

      // Compute the node.
      if (affective) {
        this._computeNode(state, node, absorbLockedCache)

        if (trace) {
          TfDebug.msg('VDF_PBEE_TRACE', `ComputedNode("${node.getDebugName()}"); }\n`)
        }
      } else {
        // The node doesn't have any outputs that need to be computed. Skip
        // the node passing through the data for read/write outputs.
        this._passThroughNode(schedule, node, absorbLockedCache)

        if (trace) {
          TfDebug.msg('VDF_PBEE_TRACE',
            `ComputedNodeInaffective("${node.getDebugName()}"); }\n`)
        }
      }

      // Pop the output off the stack, once we are done with it
      outputsStack.pop()
    }
  }

  /** _ComputeNode (pullBasedExecutorEngine.h:905-1060). */
  protected _computeNode(
    state: VdfEvaluationState,
    node: VdfNode,
    absorbLockedCache = false): void {
    _FailOnStats(this._executor.getExecutionStats(), 'pullBasedExecutorEngine.h:914-921')

    // The current schedule.
    const schedule = state.getSchedule()

    // Clear the acceleration structure for output data lookups.
    this._dataHandleCache.length = 0

    for (let outputId = schedule.getOutputIdsBegin(node),
        end = schedule.getOutputIdsEnd(node);
      outputId.notEquals(end); outputId.increment()) {
      const output = schedule.GetOutput(outputId)!

      // Retrieve the data handle and cache it for accelerated lookup below.
      const dataHandle = this._dataManager.getOrCreateDataHandle(output.getId())
      this._dataHandleCache.push(dataHandle)

      // Retrieve the buffer data associated with the handle.
      const bufferData = this._dataManager.getBufferData(dataHandle)

      // If this output still contains data (i.e., invalidation did not remove
      // the cache), it may have been locked and we may want to retain the
      // data to absorb it shortly.
      if (absorbLockedCache ||
          (bufferData.getExecutorCache() &&
            VdfPullBasedExecutorEngine._isNotPassing(output, outputId, schedule))) {
        bufferData.retainExecutorCache(
          output.getSpec(), this._dataManager.getOrCreateSMBLData(dataHandle))
      }

      // Before we compute the output, we have to make sure that all the
      // recipients of its cache are cleared and that the cache is reclaimed
      // by output.
      bufferData.resetExecutorCache()

      // Mark the output as having been touched during evaluation.
      this._dataManager.touch(dataHandle)

      // If this is a read/write output, make sure the buffer has been passed
      // down. We also need to set the computed output mask here, because the
      // node will read input values of read/write inputs directly at this
      // output. Note, that on interruption this mask must be reset!
      const ai = output.getAssociatedInput()
      if (ai) {
        const requestMask = schedule.getRequestMask(outputId)
        this._prepareReadWriteBuffer(dataHandle, ai, requestMask, schedule)
        this._dataManager.setComputedOutputMask(bufferData, requestMask)
      }
    }

    // Compute the node
    node.compute(new VdfContext(state, node))

    // Has the node been interrupted during execution?
    const hasBeenInterrupted = this._getExecutor().hasBeenInterrupted()

    // Deallocate temporary buffers which the schedule knows can be
    // deallocated now that this node has run. We only ever want to eagerly
    // clear temporary buffers in our own data manager (never a parent's).
    const ctd = schedule.getOutputToClear(node)
    if (ctd) {
      const dataHandle = this._dataManager.getDataHandle(ctd.getId())
      if (this._dataManager.isValidDataHandle(dataHandle)) {
        this._dataManager.getBufferData(dataHandle).Reset()
      }
    }

    // We now need to mark the computed parts of our vectors.
    let outputIndex = 0
    for (let outputId = schedule.getOutputIdsBegin(node),
        end = schedule.getOutputIdsEnd(node);
      outputId.notEquals(end); outputId.increment()) {
      const output = schedule.GetOutput(outputId)!
      const requestMask = schedule.getRequestMask(outputId)

      // Retrieve the data handle from the cache.
      const dataHandle = this._dataHandleCache[outputIndex++]!

      // Retrieve the buffer data associated with the handle.
      const bufferData = this._dataManager.getBufferData(dataHandle)

      // Check to see if the node did indeed produce values for this output.
      // We don't want to post warnings for missing output values if the node
      // has been interrupted.
      if (!hasBeenInterrupted &&
          !output.getAssociatedInput() &&
          !bufferData.getExecutorCache()) {
        // This is an output without an associated input that has no value
        // even though it was requested.
        TF_WARN(
          'No value set for output ' + output.getDebugName() +
          ' of type ' + output.getSpec().getType().getTypeName() +
          ' named ' + output.getName())

        VdfExecutionTypeRegistry.fillVector(
          output.getSpec().getType(),
          requestMask.getSize(),
          this._dataManager.getOrCreateOutputValueForWriting(output, dataHandle)!)
      }

      // If the node has been interrupted, make sure to reset the computed
      // output mask: Read/writes will already have their mask set.
      this._finalizeComputedOutput(
        dataHandle,
        requestMask,
        hasBeenInterrupted,
        VdfPullBasedExecutorEngine._isNotPassing(output, outputId, schedule))

      _FailOnStats(this._executor.getExecutionStats(), 'pullBasedExecutorEngine.h:1051-1058')
    }
  }

  /** _PassThroughNode (pullBasedExecutorEngine.h:1062-1138). */
  protected _passThroughNode(
    schedule: VdfSchedule,
    node: VdfNode,
    absorbLockedCache = false): boolean {
    let passedThrough = false

    _FailOnStats(this._executor.getExecutionStats(), 'pullBasedExecutorEngine.h:1073-1075')

    for (let outputId = schedule.getOutputIdsBegin(node),
        end = schedule.getOutputIdsEnd(node);
      outputId.notEquals(end); outputId.increment()) {
      const output = schedule.GetOutput(outputId)!
      const requestMask = schedule.getRequestMask(outputId)

      // Retrieve the data handle.
      const dataHandle = this._dataManager.getOrCreateDataHandle(output.getId())

      // Get the buffer data associated with the data handle.
      const bufferData = this._dataManager.getBufferData(dataHandle)

      // If this output still contains data, it may have been locked and we
      // may want to retain the data to absorb it shortly.
      if (absorbLockedCache ||
          (bufferData.getExecutorCache() &&
            VdfPullBasedExecutorEngine._isNotPassing(output, outputId, schedule))) {
        bufferData.retainExecutorCache(
          output.getSpec(), this._dataManager.getOrCreateSMBLData(dataHandle))
      }

      // Before we pass the output data through, make sure that all the
      // recipients of its cache are cleared and that the cache is reclaimed
      // by output.
      bufferData.resetExecutorCache()

      // Marked the output as having been touched during evaluation.
      this._dataManager.touch(dataHandle)

      const fromBufferOutput = schedule.getFromBufferOutput(outputId)
      const ai = output.getAssociatedInput()
      if (fromBufferOutput) {
        this._passOrCopySourceOutputBuffer(
          dataHandle, output, fromBufferOutput, requestMask, schedule)

        passedThrough = true
      } else if (ai) {
        // We better have one and only one connection on this input connector.
        TF_DEV_AXIOM(ai.getNumConnections() === 1,
          'output.GetAssociatedInput()->GetNumConnections()==1')

        // If the output has an associated input, pass the data through.
        this._prepareReadWriteBuffer(dataHandle, ai, requestMask, schedule)
        passedThrough = true
      }

      // Finalize the computed output, by merging in any temporary data and
      // setting the appropriate computed output mask.
      this._finalizeComputedOutput(
        dataHandle,
        requestMask,
        false, /* hasBeenInterrupted */
        VdfPullBasedExecutorEngine._isNotPassing(output, outputId, schedule))
    }

    return passedThrough
  }

  /** _FinalizeComputedOutput (pullBasedExecutorEngine.h:1140-1173). */
  private _finalizeComputedOutput(
    dataHandle: ReturnType<DataManagerType['getDataHandle']>,
    requestMask: VdfMask,
    hasBeenInterrupted: boolean,
    extendRequestMask: boolean): void {
    const bufferData = this._dataManager.getBufferData(dataHandle)

    // Merge in temporary data, if available. Note, we must release the SMBL
    // data despite any possible interruption!
    const lockedMask = bufferData.releaseExecutorCache(
      this._dataManager.getSMBLData(dataHandle))

    // Has the executor been interrupted? Make sure to reset the computed
    // output mask, so that subsequent cache hits do not return garbage data.
    if (hasBeenInterrupted) {
      this._dataManager.setComputedOutputMask(bufferData, new VdfMask())
    }

    // Otherwise, set the computed output mask to the request mask, extended
    // by the locked mask if requested.
    else {
      this._dataManager.setComputedOutputMask(
        bufferData,
        extendRequestMask && !lockedMask.IsEmpty()
          ? lockedMask.or(requestMask)
          : requestMask)
    }
  }
}
