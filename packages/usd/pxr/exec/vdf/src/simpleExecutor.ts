// Ported from OpenUSD 26.11.1: pxr/exec/vdf/simpleExecutor.cpp,
//  pxr/exec/vdf/simpleExecutor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/simpleExecutor.h and
// pxr/exec/vdf/simpleExecutor.cpp.
//
// VdfSimpleExecutor stores its data in a VdfParallelDataManagerVector, as
// upstream does (simpleExecutor.h:33-37). Its factory's speculation executor
// (VdfSpeculationExecutor<VdfSpeculationExecutorEngine,
// VdfDataManagerHashTable>) is not ported (openexec-speculation).

import { TF_AXIOM, TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'

import { VdfContext } from './context.ts'
import { VdfDataManagerBasedExecutor } from './dataManagerBasedExecutor.ts'
import { VdfEvaluationState } from './evaluationState.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import { VdfExecutorFactoryBase } from './executorFactoryBase.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import type { VdfInput } from './input.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import { VdfParallelDataManagerVector } from './parallelDataManagerVector.ts'
import type { VdfRequest } from './request.ts'
import type { VdfSchedule } from './schedule.ts'

/** The simple executor factory (simpleExecutor.cpp:30-54). */
class _SimpleExecutorFactory extends VdfExecutorFactoryBase {
  /** simpleExecutor.cpp:39-44. */
  manufactureChildExecutor(_parentExecutor: VdfExecutorInterface | null): VdfExecutorInterface | null {
    TF_CODING_ERROR('Cannot manufacture child from VdfSimpleExecutor.')
    return null
  }

  /** simpleExecutor.cpp:47-53. */
  manufactureSpeculationExecutor(
    _speculationNode: VdfNode | null,
    _parentExecutor: VdfExecutorInterface | null): VdfExecutorInterface {
    // FAITHFULNESS-DEBT(openexec-speculation): simpleExecutor.cpp:51-52
    // constructs VdfSpeculationExecutor<VdfSpeculationExecutorEngine,
    // VdfDataManagerHashTable> -> port speculationExecutor.h and construct it.
    const message = '_SimpleExecutorFactory::ManufactureSpeculationExecutor ' +
      '(pxr/exec/vdf/simpleExecutor.cpp:47-53): VdfSpeculationExecutor is ' +
      'not ported (openexec-speculation)'
    TF_CODING_ERROR(message)
    throw new Error(message)
  }
}

// simpleExecutor.cpp:65: the factory shared by all simple executors.
let _factory: _SimpleExecutorFactory | null = null

/**
 * VdfSimpleExecutor (simpleExecutor.h:33-79): executes a VdfNetwork to
 * compute a requested set of values using depth first search.
 */
export class VdfSimpleExecutor extends VdfDataManagerBasedExecutor<VdfParallelDataManagerVector> {
  constructor() {
    super(VdfParallelDataManagerVector)
  }

  /** GetFactory (simpleExecutor.cpp:62-67). */
  getFactory(): VdfExecutorFactoryBase {
    return _factory ??= new _SimpleExecutorFactory()
  }

  /**
   * _Run (simpleExecutor.cpp:69-118). VdfSimpleExecutor ignores the
   * computeRequest and computes all the outputs in the schedule.
   */
  protected _run(
    schedule: VdfSchedule,
    _computeRequest: VdfRequest,
    errorLogger: VdfExecutorErrorLogger | null): void {
    this._dataManager.resize(schedule.getNetwork()!)

    const state = new VdfEvaluationState(this, schedule, errorLogger)

    const scheduleNodes = schedule.getScheduleNodeVector()
    for (const scheduleNode of scheduleNodes) {
      // Make sure we reclaim all caches that we are about to re-execute.
      const node = scheduleNode.node
      for (let outputId = schedule.getOutputIdsBegin(node),
          end = schedule.getOutputIdsEnd(node);
        outputId.notEquals(end); outputId.increment()) {
        const output = schedule.GetOutput(outputId)!

        // Touch the output.
        this._dataManager.touch(output.getId())

        // Create a data handle for the output.
        const dataHandle = this._dataManager.getOrCreateDataHandle(output.getId())

        // Reset the private buffer and apply the request mask.
        const requestMask = schedule.getRequestMask(outputId)
        const bufferData = this._dataManager.getPrivateBufferData(dataHandle)
        bufferData.resetExecutorCache(requestMask)

        // Pass down read/write buffers before executing the callback.
        const ai = output.getAssociatedInput()
        if (ai) {
          this._prepareReadWriteBuffer(bufferData, ai, requestMask, schedule)
        }
      }

      // Compute the node.
      node.compute(new VdfContext(state, node))

      // Publish each one of the computed outputs.
      for (let outputId = schedule.getOutputIdsBegin(node),
          end = schedule.getOutputIdsEnd(node);
        outputId.notEquals(end); outputId.increment()) {
        const dataHandle = this._dataManager.getDataHandle(
          schedule.GetOutput(outputId)!.getId())
        this._dataManager.publishPrivateBufferData(dataHandle)
      }
    }
  }

  /** _PrepareReadWriteBuffer (simpleExecutor.cpp:120-149). */
  protected _prepareReadWriteBuffer(
    bufferData: VdfExecutorBufferData,
    input: VdfInput,
    mask: VdfMask,
    _schedule: VdfSchedule): void {
    if (bufferData.getExecutorCache()) {
      return
    }

    const output = input.getAssociatedOutput()
    if (!TF_VERIFY(output, 'output')) {
      return
    }

    // Always create a new output cache and make a copy for read/write
    // buffers. The simple executor does not support buffer passing.
    const value = VdfParallelDataManagerVector.createOutputCache(output!, bufferData)

    const numInputNodes = input.getNumConnections()
    if (numInputNodes === 1 && !input.Get(0).GetMask().isAllZeros()) {
      const sourceData = this._dataManager.getOutputValueForReading(
        this._dataManager.getDataHandle(input.Get(0).getSourceOutput().getId()),
        mask)
      TF_AXIOM(sourceData, 'sourceData')

      value.assign(sourceData)
    }
  }
}
