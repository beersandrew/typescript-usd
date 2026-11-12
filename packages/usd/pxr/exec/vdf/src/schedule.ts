// Ported from OpenUSD 26.11.1: pxr/exec/vdf/schedule.cpp,
//  pxr/exec/vdf/schedule.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/schedule.h and schedule.cpp.
//
// VdfSchedule keeps the members of the parallel task graph (compute tasks,
// inputs tasks, node invocations, input dependencies) because Clear() and the
// scheduler reset and read them. Only VdfScheduler::_ScheduleTaskGraph fills
// them, and it is not ported (PLATFORM-DIVERGENCE(openexec-parallel)); the
// accessors that only the parallel engine reads fail loudly.
//
// VdfMask values are never mutated in place here: setters store the mask
// they are given, as upstream stores a copy of a value type.

import {
  Debug as TfDebug,
  TF_CODING_ERROR,
  TF_DEV_AXIOM,
  TF_AXIOM,
  TF_VERIFY,
} from 'typescript-usd/tf'
// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'
import { WorkParallelForN } from 'typescript-usd/work'

import { VdfDebugCodes } from './debugCodes.ts'
import { VdfMask } from './mask.ts'
import { VdfNode } from './node.ts'
import { VdfRequest } from './request.ts'
import type { VdfConnection } from './connection.ts'
import type { VdfInput } from './input.ts'
import type { VdfNetwork } from './network.ts'
import type { VdfOutput } from './output.ts'
import { VdfScheduleNode, VdfScheduleOutput, type VdfScheduleInput } from './scheduleNode.ts'
import {
  VdfScheduleTaskIsInvalid,
  type VdfScheduleComputeTask,
  type VdfScheduleInputDependency,
  type VdfScheduleInputDependencyUniqueIndex,
  type VdfScheduleInputsTask,
  type VdfScheduleNodeInvocation,
  type VdfScheduleNodeTasks,
  type VdfScheduleTaskIndex,
} from './scheduleTasks.ts'
import type { VdfScheduledOutputCallback } from './types.ts'

// schedule.cpp:27
const INVALID_NODE_INDEX = -1

/** Fails loudly for task-graph state that only _ScheduleTaskGraph produces. */
function _ParallelOnly(what: string, site: string): never {
  // PLATFORM-DIVERGENCE(openexec-parallel): VdfSchedule task graph accessors
  // (schedule.h:385-470) are read only by the parallel evaluation engine ->
  // port _ScheduleTaskGraph (scheduler.cpp:646-1980) with the parallel engine.
  const message =
    `VdfSchedule::${what} (${site}) reads the parallel task graph, which is ` +
    'not ported (openexec-parallel)'
  TF_CODING_ERROR(message)
  throw new Error(message)
}

/**
 * Minimal iterator range that the schedule returns instances of, in order to
 * facilitate iterating over sub-sections of the internal containers
 * (schedule.h:42-58). Here it is a view of [begin, end) over an array.
 */
export class VdfSchedule_IteratorRange<T> implements Iterable<T> {
  constructor(
    private readonly _items: readonly T[],
    private readonly _begin: number,
    private readonly _end: number,
  ) {}

  /** schedule.h:55 */
  empty(): boolean { return this._begin === this._end }

  /** schedule.h:56 */
  size(): number { return this._end - this._begin }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = this._begin; i < this._end; ++i) {
      yield this._items[i]!
    }
  }
}

/**
 * An OutputId is a small key object that, once obtained for a particular
 * VdfOutput, can be used to query the schedule about that VdfOutput
 * (schedule.h:85-150).
 */
export class VdfSchedule_OutputId {
  /**
   * Upstream's private members, accessed by VdfSchedule and VdfScheduler as
   * friends (schedule.h:146-148). Not for other callers.
   */
  _scheduleNodeIndex: number
  _secondaryIndex: number

  /**
   * Only VdfSchedule constructs instances (schedule.h:136-139); upstream's
   * constructor is private.
   */
  constructor(scheduleNodeIndex: number, secondaryIndex: number) {
    this._scheduleNodeIndex = scheduleNodeIndex
    this._secondaryIndex = secondaryIndex
  }

  /**
   * Returns whether this OutputId can be used to make queries about an
   * output's scheduling (schedule.h:92-94).
   */
  isValid(): boolean {
    return this._scheduleNodeIndex >= 0 && this._secondaryIndex >= 0
  }

  /**
   * Increment this OutputId to refer to the next scheduled output on the
   * current output's node (schedule.h:103-106, operator++).
   */
  increment(): this {
    this._secondaryIndex++
    return this
  }

  /** schedule.h:110-113 */
  Equals(rhs: VdfSchedule_OutputId): boolean {
    return this._scheduleNodeIndex === rhs._scheduleNodeIndex &&
      this._secondaryIndex === rhs._secondaryIndex
  }

  /** schedule.h:115-117 */
  notEquals(rhs: VdfSchedule_OutputId): boolean {
    return !this.Equals(rhs)
  }

  /** Copy (OutputId is a value type). */
  Clone(): VdfSchedule_OutputId {
    return new VdfSchedule_OutputId(this._scheduleNodeIndex, this._secondaryIndex)
  }
}

/**
 * Contains a specification of how to execute a particular VdfNetwork
 * (schedule.h:36).
 */
export class VdfSchedule {
  static readonly OutputId = VdfSchedule_OutputId
  static readonly IteratorRange = VdfSchedule_IteratorRange

  // The total list of nodes that we have to execute.
  /** @internal VdfScheduler is a friend (schedule.h:576). */
  _nodes: VdfScheduleNode[] = []

  // The request for this schedule.
  private _request: VdfRequest = new VdfRequest()

  // This is a vector that maps VdfNodes to VdfScheduleNode index in _nodes.
  /** @internal VdfScheduler is a friend (schedule.h:576). */
  _nodesToIndexMap: number[] = []

  // The network that we are registered with.
  private _network: VdfNetwork | null = null

  // Bits are set for each schedule node's index.
  private _scheduledNodes: TfBits = new TfBits()

  // Flag as to whether or not the schedule is valid.
  private _isValid = false

  /** @internal VdfScheduler is a friend (schedule.h:576). */
  _isSmallSchedule = false

  // This flag indicates whether this schedule participates in sparse mung
  // buffer locking.
  private _hasSMBL = false

  /** @internal VdfScheduler is a friend (schedule.h:576). */
  _numUniqueInputDeps = 0

  // The scheduled tasks for parallel evaluation.
  /** @internal VdfScheduler is a friend (schedule.h:576). */
  _computeTasks: VdfScheduleComputeTask[] = []
  /** @internal */
  _inputsTasks: VdfScheduleInputsTask[] = []
  /** @internal */
  _numKeepTasks = 0
  /** @internal */
  _numPrepTasks = 0

  // Scheduled node invocations for nodes with multiple invocations.
  /** @internal */
  _nodeInvocations: VdfScheduleNodeInvocation[] = []

  // The array of input dependencies used to orchestrate task synchronization.
  /** @internal */
  _inputDeps: VdfScheduleInputDependency[] = []

  // Arrays that map from the scheduled node index to the scheduled tasks
  // corresponding to that node.
  /** @internal */
  _nodesToComputeTasks: VdfScheduleNodeTasks[] = []
  /** @internal */
  _nodesToKeepTasks: VdfScheduleTaskIndex[] = []

  /** Constructs an empty schedule (schedule.cpp:29-36). */
  constructor() {}

  /**
   * Clears the schedule. This marks the schedule as invalid and is no longer
   * suitable for execution (schedule.cpp:43-80).
   */
  clear(): void {
    // Avoid debug output if nothing is scheduled. This happens during initial
    // scheduling.
    if (this._nodes.length !== 0) {
      // Upstream prints the schedule's address (%p); JS has none.
      TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
        `[Vdf] Clearing schedule with ${this._nodes.length} nodes, ` +
        `_isSmallSchedule= ${this._isSmallSchedule ? 1 : 0}\n`)
    }

    this._nodes = []
    this._request = new VdfRequest()
    this._nodesToIndexMap = []
    this._isSmallSchedule = false
    this._isValid = false
    this._hasSMBL = false
    if (this._network) {
      this._network._unregisterSchedule(this)
    }
    this._network = null
    // Note that _scheduledNodes must only be cleared *after* it is
    // unregistered from the network.
    this._scheduledNodes.resize(0)
    this._numUniqueInputDeps = 0

    this._computeTasks = []
    this._inputsTasks = []
    this._numKeepTasks = 0
    this._numPrepTasks = 0
    this._nodeInvocations = []
    this._inputDeps = []
    this._nodesToComputeTasks = []
    this._nodesToKeepTasks = []
  }

  /**
   * Returns whether or not this schedule is valid and can be used for
   * execution (schedule.h:168-170).
   */
  isValid(): boolean {
    return this._isValid
  }

  /** Returns the network for this schedule (schedule.h:174). */
  getNetwork(): VdfNetwork | null { return this._network }

  /** Returns whether this schedule includes `node` in any way (schedule.cpp:82-87). */
  isScheduled(node: VdfNode): boolean {
    const index = VdfNode.getIndexFromId(node.getId())
    return index < this._scheduledNodes.getSize() && this._scheduledNodes.isSet(index)
  }

  /**
   * Returns a small, cheap OutputId, which can be passed to other Get*
   * methods (schedule.cpp:89-97).
   */
  getOutputId(output: VdfOutput): VdfSchedule_OutputId {
    const schedNodeIdx = this._getScheduleNodeIndex(output.getNode())
    const schedOutputIdx = schedNodeIdx < 0
      ? schedNodeIdx
      : this._nodes[schedNodeIdx]!.getOutputIndex(output)
    return new VdfSchedule_OutputId(schedNodeIdx, schedOutputIdx)
  }

  /**
   * Similar to GetOutputId, but creates an OutputId if none exists,
   * effectively adding the output to the schedule (schedule.cpp:99-128).
   */
  getOrCreateOutputId(output: VdfOutput): VdfSchedule_OutputId {
    const node = output.getNode()

    TF_DEV_AXIOM(this._nodesToIndexMap.length === node.getNetwork().getNodeCapacity(),
      '_nodesToIndexMap.size() == node.GetNetwork().GetNodeCapacity()')

    const result = this.getOutputId(output)

    // Note that the scheduled node bit set is always updated here. The
    // initialization that occurs inside the (result.IsValid()) block below
    // isn't done when this is a small schedule.
    this._scheduledNodes.Set(VdfNode.getIndexFromId(node.getId()))

    if (!result.isValid()) {
      const schedNodeIndex = this._ensureNodeInSchedule(node)
      const scheduleNode = this._nodes[schedNodeIndex]!
      TF_DEV_AXIOM(scheduleNode.node === node, 'scheduleNode->node == &node')

      // Now make sure we have this scheduled output.
      scheduleNode.outputs.push(new VdfScheduleOutput(output, new VdfMask(0)))

      result._scheduleNodeIndex = schedNodeIndex
      result._secondaryIndex = scheduleNode.outputs.length - 1
    }

    return result
  }

  /**
   * Adds the input targeted by the given `connection` to the schedule. The
   * specified `mask` indicates which data elements the input depends on
   * (schedule.cpp:130-146).
   */
  addInput(connection: VdfConnection, mask: VdfMask): void {
    // Make sure the node is scheduled.
    const node = connection.getTargetNode()
    const schedNodeIndex = this._ensureNodeInSchedule(node)

    // Get the source output and target input.
    const source = connection.getSourceOutput()
    const input = connection.getTargetInput()

    // Append the scheduled input.
    this._nodes[schedNodeIndex]!.inputs.push({ source, mask, input })
  }

  /**
   * Consolidates scheduled input entries added by AddInput
   * (schedule.cpp:203-215). WorkParallelForN runs its serial branch.
   */
  deduplicateInputs(): void {
    const nodes = this._nodes
    WorkParallelForN(nodes.length, (begin: number, end: number) => {
      for (let i = begin; i !== end; ++i) {
        _DeduplicateInputsForNode(nodes[i]!)
      }
    })
  }

  /**
   * Returns the VdfNode that owns the VdfOutput associated with the given
   * `outputId` (schedule.cpp:217-222).
   */
  getNode(outputId: VdfSchedule_OutputId): VdfNode {
    TF_DEV_AXIOM(outputId.isValid(), 'outputId.IsValid()')
    return this._nodes[outputId._scheduleNodeIndex]!.node
  }

  /**
   * Gets an OutputId identifying the first scheduled output for the given
   * `node`, if any (schedule.cpp:224-231).
   */
  getOutputIdsBegin(node: VdfNode): VdfSchedule_OutputId {
    const schedNodeIdx = this._getScheduleNodeIndex(node)
    TF_DEV_AXIOM(schedNodeIdx >= 0 && schedNodeIdx < this._nodes.length,
      'schedNodeIdx >= 0 && static_cast<size_t>(schedNodeIdx) < _nodes.size()')
    return new VdfSchedule_OutputId(schedNodeIdx, 0)
  }

  /**
   * Gets an OutputId identifying the "end" of the scheduled outputs for a node
   * (schedule.cpp:233-240).
   */
  getOutputIdsEnd(node: VdfNode): VdfSchedule_OutputId {
    const schedNodeIdx = this._getScheduleNodeIndex(node)
    TF_DEV_AXIOM(schedNodeIdx >= 0 && schedNodeIdx < this._nodes.length,
      'schedNodeIdx >= 0 && static_cast<size_t>(schedNodeIdx) < _nodes.size()')
    return new VdfSchedule_OutputId(schedNodeIdx, this._nodes[schedNodeIdx]!.outputs.length)
  }

  /**
   * Returns a range of inputs scheduled for the given `node`
   * (schedule.cpp:242-250).
   */
  getInputs(node: VdfNode): VdfSchedule_IteratorRange<VdfScheduleInput> {
    const schedNodeIdx = this._getScheduleNodeIndex(node)
    TF_DEV_AXIOM(schedNodeIdx >= 0 && schedNodeIdx < this._nodes.length,
      'schedNodeIdx >= 0 && static_cast<size_t>(schedNodeIdx) < _nodes.size()')
    const schedNode = this._nodes[schedNodeIdx]!
    return new VdfSchedule_IteratorRange(schedNode.inputs, 0, schedNode.inputs.length)
  }

  /**
   * Returns true if the output is expected to have an effect on its
   * corresponding input (schedule.cpp:252-257).
   */
  isAffective(outputId: VdfSchedule_OutputId): boolean {
    TF_DEV_AXIOM(outputId.isValid(), 'outputId.IsValid()')
    return this._nodes[outputId._scheduleNodeIndex]!.affective
  }

  /** Returns the scheduled VdfOutput for the given OutputId (schedule.cpp:259-265). */
  GetOutput(outputId: VdfSchedule_OutputId): VdfOutput {
    return this._scheduleOutput(outputId).output
  }

  /**
   * Returns the output whose temporary buffer can be immediately deallocated
   * after `node` has finished executing (schedule.cpp:340-347).
   */
  getOutputToClear(node: VdfNode): VdfOutput | null {
    const schedNodeIdx = this._getScheduleNodeIndex(node)
    TF_DEV_AXIOM(schedNodeIdx >= 0 && schedNodeIdx < this._nodes.length,
      'schedNodeIdx >= 0 && static_cast<size_t>(schedNodeIdx) < _nodes.size()')
    return this._nodes[schedNodeIdx]!.outputToClear
  }

  /**
   * Returns the request mask associated with the given OutputId
   * (schedule.cpp:267-273), or for the given node invocation index
   * (schedule.h:307-311).
   */
  getRequestMask(outputIdOrInvocation: VdfSchedule_OutputId | VdfScheduleTaskIndex): VdfMask {
    if (typeof outputIdOrInvocation === 'number') {
      return this._nodeInvocation(outputIdOrInvocation).requestMask
    }
    return this._scheduleOutput(outputIdOrInvocation).requestMask
  }

  /**
   * Returns the request and affects masks simultaneously
   * (schedule.cpp:275-288 for an OutputId, schedule.h:325-332 for a node
   * invocation index). The two pointer out-parameters become the returned
   * tuple [requestMask, affectsMask].
   */
  getRequestAndAffectsMask(
    outputIdOrInvocation: VdfSchedule_OutputId | VdfScheduleTaskIndex,
  ): [VdfMask, VdfMask] {
    if (typeof outputIdOrInvocation === 'number') {
      const invocation = this._nodeInvocation(outputIdOrInvocation)
      return [invocation.requestMask, invocation.affectsMask]
    }
    const schedOutput = this._scheduleOutput(outputIdOrInvocation)
    return [schedOutput.requestMask, schedOutput.affectsMask]
  }

  /** Returns the affects mask associated with the given OutputId (schedule.cpp:290-296). */
  getAffectsMask(outputId: VdfSchedule_OutputId): VdfMask {
    return this._scheduleOutput(outputId).affectsMask
  }

  /**
   * Returns the keep mask associated with the given OutputId
   * (schedule.cpp:298-304), or for the given node invocation index
   * (schedule.h:346-350).
   */
  getKeepMask(outputIdOrInvocation: VdfSchedule_OutputId | VdfScheduleTaskIndex): VdfMask {
    if (typeof outputIdOrInvocation === 'number') {
      return this._nodeInvocation(outputIdOrInvocation).keepMask
    }
    return this._scheduleOutput(outputIdOrInvocation).keepMask
  }

  /** Returns the "pass to" output for the given OutputId (schedule.cpp:306-312). */
  getPassToOutput(outputId: VdfSchedule_OutputId): VdfOutput | null {
    return this._scheduleOutput(outputId).passToOutput
  }

  /** Returns the "from buffer" output for the given OutputId (schedule.cpp:314-320). */
  getFromBufferOutput(outputId: VdfSchedule_OutputId): VdfOutput | null {
    return this._scheduleOutput(outputId).fromBufferOutput
  }

  /**
   * Returns true if this schedule participates in sparse mung buffer locking
   * (schedule.h:367-369).
   */
  hasSMBL(): boolean {
    return this._hasSMBL
  }

  /**
   * Loops over each scheduled output of `node` and calls `callback` with the
   * output and request mask (schedule.cpp:485-496).
   */
  forEachScheduledOutput(node: VdfNode, callback: VdfScheduledOutputCallback): void {
    for (const id of VDF_FOR_EACH_SCHEDULED_OUTPUT_ID(this, node)) {
      if (TF_VERIFY(id.isValid(), 'id.IsValid()')) {
        callback(this.GetOutput(id), this.getRequestMask(id))
      }
    }
  }

  /** schedule.h:385-387 (parallel engine only). */
  getNumUniqueInputDependencies(): number {
    return _ParallelOnly('GetNumUniqueInputDependencies', 'schedule.h:385')
  }

  /** schedule.h:391-393 (parallel engine only). */
  getNumComputeTasks(): number {
    return _ParallelOnly('GetNumComputeTasks', 'schedule.h:391')
  }

  /** schedule.h:397-399 (parallel engine only). */
  getNumInputsTasks(): number {
    return _ParallelOnly('GetNumInputsTasks', 'schedule.h:397')
  }

  /** schedule.h:403-405 (parallel engine only). */
  getNumPrepTasks(): number {
    return _ParallelOnly('GetNumPrepTasks', 'schedule.h:403')
  }

  /** schedule.h:409-411 (parallel engine only). */
  getNumKeepTasks(): number {
    return _ParallelOnly('GetNumKeepTasks', 'schedule.h:409')
  }

  /**
   * Returns a range of ids describing compute tasks associated with the given
   * node, or given an input dependency (schedule.h:416-432; parallel engine
   * only).
   */
  getComputeTaskIds(_nodeOrInput: VdfNode | VdfScheduleInputDependency): Iterable<number> {
    return _ParallelOnly('GetComputeTaskIds', 'schedule.h:416')
  }

  /** schedule.h:436-441 (parallel engine only). */
  getKeepTaskIndex(_node: VdfNode): VdfScheduleTaskIndex {
    return _ParallelOnly('GetKeepTaskIndex', 'schedule.h:436')
  }

  /** schedule.h:445-449 (parallel engine only). */
  getComputeTask(_index: VdfScheduleTaskIndex): VdfScheduleComputeTask {
    return _ParallelOnly('GetComputeTask', 'schedule.h:445')
  }

  /** schedule.h:453-457 (parallel engine only). */
  getInputsTask(_index: VdfScheduleTaskIndex): VdfScheduleInputsTask {
    return _ParallelOnly('GetInputsTask', 'schedule.h:453')
  }

  /** schedule.h:462-467 (parallel engine only). */
  getPrereqInputDependencies(
    _task: VdfScheduleInputsTask,
  ): VdfSchedule_IteratorRange<VdfScheduleInputDependency> {
    return _ParallelOnly('GetPrereqInputDependencies', 'schedule.h:462')
  }

  /** schedule.h:472-477 (parallel engine only). */
  getOptionalInputDependencies(
    _task: VdfScheduleInputsTask,
  ): VdfSchedule_IteratorRange<VdfScheduleInputDependency> {
    return _ParallelOnly('GetOptionalInputDependencies', 'schedule.h:472')
  }

  /** schedule.h:482-487 (parallel engine only). */
  getRequiredInputDependencies(
    _task: VdfScheduleComputeTask,
  ): VdfSchedule_IteratorRange<VdfScheduleInputDependency> {
    return _ParallelOnly('GetRequiredInputDependencies', 'schedule.h:482')
  }

  /**
   * Returns the unique index assigned to the output (schedule.cpp:349-355).
   * Unique indices are assigned by the task graph only.
   */
  getUniqueIndex(_outputId: VdfSchedule_OutputId): VdfScheduleInputDependencyUniqueIndex {
    return _ParallelOnly('GetUniqueIndex', 'schedule.cpp:349')
  }

  /**
   * Returns whether this schedule is small enough to avoid overhead incurred
   * by the _nodesToIndexMap mapping (schedule.h:501).
   */
  isSmallSchedule(): boolean { return this._isSmallSchedule }

  /** Sets the request that was used to make up this schedule (schedule.cpp:410-414). */
  setRequest(request: VdfRequest): void {
    this._request = request
  }

  /** Returns the request for this schedule (schedule.h:510). */
  getRequest(): VdfRequest { return this._request }

  /**
   * Returns the vector of schedule nodes in this schedule. It is never
   * appropriate to access it directly except during scheduling
   * (schedule.h:517-523).
   */
  getScheduleNodeVector(): VdfScheduleNode[] {
    return this._nodes
  }

  /**
   * Returns the node index of the schedule node associated with the given
   * `outputId` (schedule.h:528-530).
   */
  getScheduleNodeIndex(outputId: VdfSchedule_OutputId): number {
    return outputId._scheduleNodeIndex
  }

  /**
   * Returns a set of bits where each set bit's index corresponds to the node
   * index of a node in this schedule (schedule.h:535).
   */
  getScheduledNodeBits(): TfBits { return this._scheduledNodes }

  /** schedule.cpp:357-365 */
  setRequestMask(outputId: VdfSchedule_OutputId, mask: VdfMask): void {
    this._mutableScheduleOutput(outputId).requestMask = mask
  }

  /** schedule.cpp:367-375 */
  setAffectsMask(outputId: VdfSchedule_OutputId, mask: VdfMask): void {
    this._mutableScheduleOutput(outputId).affectsMask = mask
  }

  /** schedule.cpp:377-385 */
  setKeepMask(outputId: VdfSchedule_OutputId, mask: VdfMask): void {
    this._mutableScheduleOutput(outputId).keepMask = mask
  }

  /** schedule.cpp:387-395 */
  setPassToOutput(outputId: VdfSchedule_OutputId, output: VdfOutput | null): void {
    this._mutableScheduleOutput(outputId).passToOutput = output
  }

  /** schedule.cpp:397-406 */
  setFromBufferOutput(outputId: VdfSchedule_OutputId, output: VdfOutput | null): void {
    this._mutableScheduleOutput(outputId).fromBufferOutput = output
  }

  /**
   * Registers an output whose temporary buffer can be eagerly cleared as soon
   * as `node` has finished executing (schedule.cpp:400-408).
   */
  setOutputToClear(node: VdfNode, outputToClear: VdfOutput | null): void {
    const schedNodeIdx = this._getScheduleNodeIndex(node)
    TF_DEV_AXIOM(schedNodeIdx >= 0 && schedNodeIdx < this._nodes.length,
      'schedNodeIdx >= 0 && static_cast<size_t>(schedNodeIdx) < _nodes.size()')
    this._nodes[schedNodeIdx]!.outputToClear = outputToClear
  }

  /** Initializes structures based on the size of the network (schedule.cpp:416-426). */
  initializeFromNetwork(network: VdfNetwork): void {
    if (this._nodesToIndexMap.length === 0) {
      this._nodesToIndexMap = new Array<number>(network.getNodeCapacity()).fill(INVALID_NODE_INDEX)
    }

    this._scheduledNodes.resize(network.getNodeCapacity())
    this._scheduledNodes.clearAll()
    TF_VERIFY(network.getNodeCapacity() === this._nodesToIndexMap.length,
      'network.GetNodeCapacity() == _nodesToIndexMap.size()')
  }

  /** Enables SMBL for this schedule (schedule.h:571-573). */
  setHasSMBL(enable: boolean): void {
    this._hasSMBL = enable
  }

  /**
   * The VdfScheduler calls this method to make sure that this schedule is
   * marked as valid and registered with a particular network
   * (schedule.cpp:428-447). VdfScheduler is a friend.
   * @internal
   */
  _setIsValidForNetwork(network: VdfNetwork | null): void {
    this._isValid = true
    this._network = network

    // We can not have a network in the case that we're a valid empty
    // schedule, so we won't receive any invalidation -- which is fine since we
    // can never be invalid.
    if (this._network) {
      this._network._registerSchedule(this)
    } else {
      // If we don't get a network, we better be empty.
      TF_AXIOM(this._nodes.length === 0, '_nodes.empty()')
    }

    TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
      `[Vdf] Scheduled with ${this._nodes.length} nodes, ` +
      `_isSmallSchedule= ${this._isSmallSchedule ? 1 : 0}\n`)
  }

  /**
   * Returns the index into _nodes that corresponds to the given VdfNode, or a
   * value less than 0 if the node is not scheduled (schedule.cpp:449-470).
   * @internal VdfScheduler is a friend.
   */
  _getScheduleNodeIndex(node: VdfNode): number {
    if (this._isSmallSchedule) {
      for (let i = 0; i < this._nodes.length; i++) {
        if (this._nodes[i]!.node === node) {
          return i
        }
      }
      return INVALID_NODE_INDEX
    }

    const nodeIndex = VdfNode.getIndexFromId(node.getId())
    if (nodeIndex >= this._nodesToIndexMap.length) {
      // It is possible for nodes to be added to a network after scheduling,
      // so this method may be called with a node whose index is outside the
      // range of nodes the schedule knows about. In this case it is correct
      // to say the node is not scheduled.
      return INVALID_NODE_INDEX
    }

    return this._nodesToIndexMap[nodeIndex]!
  }

  /**
   * Ensures that `node` is in the schedule and returns its schedule node
   * index (schedule.cpp:472-487).
   */
  private _ensureNodeInSchedule(node: VdfNode): number {
    const nodeIndex = VdfNode.getIndexFromId(node.getId())
    let schedNodeIndex = this._nodesToIndexMap[nodeIndex]!

    // Make sure we have a schedule node.
    if (schedNodeIndex < 0) {
      schedNodeIndex = this._nodes.length
      this._nodesToIndexMap[nodeIndex] = schedNodeIndex

      this._nodes.push(new VdfScheduleNode(node))
    }

    return schedNodeIndex
  }

  // The getters' common body: TF_DEV_AXIOM(outputId.IsValid()) and the
  // _nodes[...].outputs[...] lookup (schedule.cpp:259-355).
  private _scheduleOutput(outputId: VdfSchedule_OutputId): VdfScheduleOutput {
    TF_DEV_AXIOM(outputId.isValid(), 'outputId.IsValid()')
    return this._nodes[outputId._scheduleNodeIndex]!.outputs[outputId._secondaryIndex]!
  }

  // The setters' common body (schedule.cpp:357-406).
  private _mutableScheduleOutput(outputId: VdfSchedule_OutputId): VdfScheduleOutput {
    TF_DEV_AXIOM(outputId._scheduleNodeIndex >= 0 &&
      outputId._scheduleNodeIndex < this._nodes.length,
    'outputId._scheduleNodeIndex >= 0 && ' +
      'static_cast<size_t>(outputId._scheduleNodeIndex) < _nodes.size()')
    return this._nodes[outputId._scheduleNodeIndex]!.outputs[outputId._secondaryIndex]!
  }

  // schedule.h:307-311, 346-350: _nodeInvocations[invocationIndex].
  private _nodeInvocation(invocationIndex: VdfScheduleTaskIndex): VdfScheduleNodeInvocation {
    TF_DEV_AXIOM(!VdfScheduleTaskIsInvalid(invocationIndex),
      '!VdfScheduleTaskIsInvalid(invocationIndex)')
    const invocation = this._nodeInvocations[invocationIndex]
    TF_DEV_AXIOM(invocation !== undefined, 'invocationIndex < _nodeInvocations.size()')
    return invocation
  }
}

export declare namespace VdfSchedule {
  type OutputId = VdfSchedule_OutputId
  type IteratorRange<T> = VdfSchedule_IteratorRange<T>
  /** schedule.h:65 */
  type ScheduleNodeVector = VdfScheduleNode[]
  /** schedule.h:75-76 */
  type InputDependencyRange = VdfSchedule_IteratorRange<VdfScheduleInputDependency>
  /** schedule.h:80-81 */
  type InputsRange = VdfSchedule_IteratorRange<VdfScheduleInput>
}

/**
 * Consolidate masks for scheduled inputs that were added multiple times
 * (schedule.cpp:166-201). The robin set keyed by (source, input) becomes a
 * two-level Map; the input order is preserved as upstream preserves it.
 */
function _DeduplicateInputsForNode(node: VdfScheduleNode): void {
  const inputs = node.inputs
  if (inputs.length <= 1) {
    return
  }

  const uniqueInputs = new Map<VdfOutput, Map<VdfInput, VdfScheduleInput>>()
  for (const input of inputs) {
    const source = input.source!
    let bySource = uniqueInputs.get(source)
    if (!bySource) {
      bySource = new Map()
      uniqueInputs.set(source, bySource)
    }
    const existing = bySource.get(input.input)
    if (existing === undefined) {
      bySource.set(input.input, input)
    } else {
      existing.mask = existing.mask.or(input.mask)
      input.source = null
    }
  }

  node.inputs = inputs.filter((input) => input.source !== null)
}

/**
 * VDF_FOR_EACH_SCHEDULED_OUTPUT_ID (schedule.h:647-651): the scheduled output
 * ids of `node`, from GetOutputIdsBegin up to GetOutputIdsEnd. The macro's
 * for loop becomes `for (const id of VDF_FOR_EACH_SCHEDULED_OUTPUT_ID(...))`.
 */
export function* VDF_FOR_EACH_SCHEDULED_OUTPUT_ID(
  schedule: VdfSchedule,
  node: VdfNode,
): Generator<VdfSchedule_OutputId> {
  const endId = schedule.getOutputIdsEnd(node)
  for (const id = schedule.getOutputIdsBegin(node); id.notEquals(endId); id.increment()) {
    yield id.Clone()
  }
}
