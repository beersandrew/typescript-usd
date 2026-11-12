// Ported from OpenUSD 26.11.1: pxr/exec/vdf/scheduler.cpp,
//  pxr/exec/vdf/scheduler.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/scheduler.h and scheduler.cpp.
//
// VdfScheduler::Schedule is complete for the serial engine. The task graph
// for the parallel engine (_GenerateTasks, _ScheduleTaskGraph and their
// helpers, scheduler.cpp:646-1980) runs only when
// VdfIsParallelEvaluationEnabled(), whose TS default is false; asking for it
// fails loudly (PLATFORM-DIVERGENCE(openexec-parallel)).

import {
  TF_CODING_ERROR,
  TF_DEV_AXIOM,
  TF_VERIFY,
  TfCompressedBits,
} from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VDF_FATAL_ERROR } from './error.ts'
import { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfNetwork } from './network.ts'
import { VdfGetAssociatedSourceOutput } from './networkUtil.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput, type VdfPoolChainIndex } from './poolChainIndex.ts'
import type { VdfRequest } from './request.ts'
import { VdfRootNode } from './rootNode.ts'
import type { VdfSchedule, VdfSchedule_OutputId } from './schedule.ts'
import type { VdfScheduleNode } from './scheduleNode.ts'
import {
  VdfIsParallelEvaluationEnabled,
  type VdfConnectionAndMaskVector,
} from './types.ts'

// Threshold for # of outputs on a node to use the
// ComputeInputDependencyRequest() API (scheduler.cpp:43).
const NODE_OUTPUT_THRESHOLD = 100

/** VdfMask::SetOrAppend (mask.h:385-392), without mutating `lhs`. */
function _SetOrAppend(lhs: VdfMask, rhs: VdfMask): VdfMask {
  return lhs.IsEmpty() ? rhs : lhs.or(rhs)
}

/**
 * The poolOutputQueue: std::map<VdfPoolChainIndex, VdfMaskedOutput,
 * std::greater<VdfPoolChainIndex>> (scheduler.cpp:46-48). Entries are kept in
 * descending pool chain index order, so the first entry is the output
 * furthest down the pool chain.
 */
class _IndexToMaskedOutputMap {
  private readonly _entries: Array<[VdfPoolChainIndex, VdfMaskedOutput]> = []

  empty(): boolean {
    return this._entries.length === 0
  }

  /**
   * std::map::try_emplace: inserts unless the key exists. Returns the entry's
   * masked output and whether it was inserted.
   */
  try_emplace(key: VdfPoolChainIndex, value: VdfMaskedOutput): [VdfMaskedOutput, boolean] {
    // Binary search for the first entry whose key is not greater than `key`.
    let lo = 0
    let hi = this._entries.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (key.lessThan(this._entries[mid]![0])) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    const found = this._entries[lo]
    if (found && found[0].Equals(key)) {
      return [found[1], false]
    }
    this._entries.splice(lo, 0, [key, value])
    return [value, true]
  }

  /** begin() followed by erase(begin()): removes and returns the first entry. */
  popFront(): VdfMaskedOutput {
    return this._entries.shift()![1]
  }
}

/** The pool outputs scheduled with request masks (scheduler.h:39-41). */
export type VdfScheduler_PoolPriorityVector = Array<[VdfPoolChainIndex, VdfOutput]>

/**
 * A map from VdfNode to VdfMaskedOutputVector (scheduler.h:44-45). Upstream
 * iterates this TfHashMap in hash order; here iteration is in insertion
 * order.
 */
export type VdfScheduler_NodeToRequestMap = Map<VdfNode, VdfMaskedOutput[]>

/**
 * _AppendToMask (scheduler.cpp:169-176): assigns `input` to an empty `out`,
 * otherwise ORs it in.
 */
function _AppendToMask(out: TfCompressedBits, input: TfCompressedBits): void {
  if (out.getSize() === 0) {
    out.assign(input)
  } else {
    out.orAssign(input)
  }
}

/**
 * _IsTargetOutputRequested (scheduler.cpp:178-208). The dependencyMask
 * out-parameter becomes the second element of the returned tuple.
 */
function _IsTargetOutputRequested(
  schedule: VdfSchedule,
  output: VdfOutput,
  inputConnection: VdfConnection,
): [boolean, TfCompressedBits] {
  // Only care about passing through to target node outputs that are also
  // scheduled.
  const outputId = schedule.getOutputId(output)
  if (!outputId.isValid()) {
    return [false, new TfCompressedBits()]
  }

  // If the target node output has an empty request mask, skip it.
  const requestMask = schedule.getRequestMask(outputId)
  if (requestMask.IsEmpty() || requestMask.isAllZeros()) {
    return [false, new TfCompressedBits()]
  }

  // If the output has no dependency on the input connection, skip it.
  const dependencyMask = inputConnection.getTargetNode().computeInputDependencyMask(
    new VdfMaskedOutput(output, requestMask), inputConnection)

  if (dependencyMask.areAllUnset()) {
    return [false, dependencyMask]
  }

  return [true, dependencyMask]
}

/**
 * Make sure that all read/write outputs are requested on all scheduled nodes
 * (scheduler.cpp:210-259).
 *
 * Even if a read/write output has not been requested through the supplied
 * VdfMaskedOutputVector, we need to make sure to provide a read/write buffer
 * for the output. The node callback itself has no knowledge of what has been
 * requested and may want to write a value to the read/write output. Thus, we
 * mark it as requested.
 */
function _ScheduleUnrequestedReadWrites(schedNode: VdfScheduleNode, schedule: VdfSchedule): void {
  // Already have all outputs on this node scheduled?
  if (schedNode.outputs.length === schedNode.node.getNumOutputs()) {
    return
  }

  // Iterate over all the outputs on the node, including the ones that have
  // not been scheduled.
  for (const [, output] of schedNode.node.getOutputsIterator()) {
    const ai = output.getAssociatedInput()

    // Ignore outputs without associated inputs or unconnected associated
    // inputs.
    if (!ai || !ai.getNumConnections()) {
      continue
    }

    const oid = schedule.getOrCreateOutputId(output)

    // If this output is already requested, we can skip it.
    if (!schedule.getRequestMask(oid).IsEmpty()) {
      continue
    }

    // Build a request mask from all the input connection masks.
    let requestMask: VdfMask = new VdfMask()
    for (const c of ai.getConnections()) {
      requestMask = _SetOrAppend(requestMask, c.GetMask())
    }
    TF_VERIFY(!requestMask.IsEmpty(), '!requestMask.IsEmpty()')

    // Mark the output as requested.
    schedule.setRequestMask(oid, requestMask)
  }
}

/**
 * Computes the passToOutput and keepMask for each output of `schedNode`
 * (scheduler.cpp:261-400).
 */
function _SetBufferPassDataForOutputs(schedNode: VdfScheduleNode, schedule: VdfSchedule): void {
  // If the node does not support buffer passing, because it manages its own
  // buffers, we can return early.
  if (VdfRootNode.isARootNode(schedNode.node)) {
    return
  }

  for (const o of schedNode.outputs) {
    // If the output is not requested, there is no need to compute the keep
    // mask.
    if (o.requestMask.IsEmpty()) {
      continue
    }

    let currMaxPopCount = 0
    let currMaxConnection: VdfConnection | null = null

    // Find the connection whose mask's population count is bigger than the
    // mask on any other connection.
    for (const c of o.output.getConnections()) {
      // Only care about passing through to read/writes.
      const assocOutput = c.getTargetInput().getAssociatedOutput()
      if (!assocOutput) {
        continue
      }

      // Only care about passing through to outputs that are requested.
      const [isTargetOutputRequested] = _IsTargetOutputRequested(schedule, assocOutput, c)

      if (!isTargetOutputRequested) {
        continue
      }

      // XXX: The code below makes it so that we pass the data along the
      //      connection with the biggest connection mask. This is not ideal,
      //      since we really should be passing the data along the connection
      //      with the most data requested! This way, we can also avoid
      //      keeping redundant data at this output. Unfortunately, doing so
      //      resulted in a few regressions.
      const numSet = c.GetMask().getNumSet()
      if (numSet > currMaxPopCount) {
        currMaxConnection = c
        currMaxPopCount = numSet
      }
    }

    // No connection found, this output doesn't pass its buffer, move on.
    if (currMaxPopCount === 0 || currMaxConnection === null) {
      continue
    }

    // Run through again gathering a union mask of all but the
    // currMaxConnection.
    const unionBits = new TfCompressedBits(o.requestMask.getSize())
    for (const c of o.output.getConnections()) {
      if (c !== currMaxConnection) {
        const targetNode = c.getTargetNode()

        // Skip speculation nodes.
        //
        // Accumulating the keep mask for a speculation node has worst-case
        // cubic time complexity. Because speculation nodes are used to
        // resolve topological cycles, they do not read from their inputs like
        // typical nodes and do not need to contribute to the keep mask at all.
        if (targetNode.isSpeculationNode()) {
          continue
        }

        // Iterate over all outputs on the target node to determine the which
        // data on the input connection the target output depends on.
        for (const [, output] of targetNode.getOutputsIterator()) {
          // Determine whether the target output is requested and obtain its
          // dependency mask based on the incoming connection.
          const [isTargetOutputRequested, inputDependencyMask] =
            _IsTargetOutputRequested(schedule, output, c)

          // The keep mask will need to be appended with the bits of the
          // dependency mask, i.e. the data that the input connection supplies
          // and that contributes to the the requested output we are currently
          // looking at.
          if (isTargetOutputRequested) {
            _AppendToMask(unionBits, inputDependencyMask)
          }
        }
      }
    }

    // Now AND that with the our scheduled mask, and that becomes the subset
    // mask to copy.
    if (TF_VERIFY(currMaxConnection, 'currMaxConnection')) {
      // We are only interested in bits overlapping with the request mask.
      unionBits.andAssign(o.requestMask.getBits())

      // If what we are keeping is the entirety of the request mask, there is
      // no point in first passing the data, and then copying all of it back to
      // the source output. Instead, prevent it from being passed down in the
      // first place.
      if (unionBits.Equals(o.requestMask.getBits())) {
        continue
      }

      // Assign the union of the kept bits to the keep mask.
      o.keepMask = unionBits.isAnySet()
        ? new VdfMask(unionBits)
        : new VdfMask()

      o.passToOutput = currMaxConnection.getTargetInput().getAssociatedOutput()
    }
  }
}

/**
 * Finds the first source output that feeds into `output` that has any affect
 * in the current request (scheduler.cpp:441-536).
 */
function _FindPrevAffectiveOutput(
  output: VdfOutput | null,
  visitedOutputs: Set<VdfOutput>,
  schedule: VdfSchedule,
): VdfOutput | null {
  // Traverse until we find an affective (or a terminal) node.
  while (output) {
    // The current output should always be valid in the schedule.
    const currentOutputId = schedule.getOutputId(output)
    if (!TF_VERIFY(currentOutputId.isValid(), 'currentOutputId.IsValid()')) {
      return null
    }

    // If the current output does not have an associated input, i.e. it won't
    // have its data passed down, it is always considered affective.
    const assocInput = output.getAssociatedInput()
    if (!assocInput) {
      return output
    }

    // If there are no more input connections to traverse, we consider this
    // node affective, because this is as far as we can seek up while passing
    // through.
    const hasInputConnection = assocInput.getConnections().length === 1
    if (!hasInputConnection) {
      return output
    }

    // If the only incoming connection has an all-zeros mask, bail here. We are
    // not going to pass a buffer at all, in this case.
    const assocConnection = assocInput.getConnections()[0]!
    if (assocConnection.GetMask().isAllZeros()) {
      return output
    }

    // If the current output has an affects mask, it is obviously affective,
    // so return the current output.
    const affectsMask = schedule.getAffectsMask(currentOutputId)
    if (affectsMask.isAnySet()) {
      return output
    }

    // If there are any scheduled reads connected to this output, we cannot
    // simply pass through it, because we need to copy the kept bits back to
    // this output. If this is the case, we consider the current output
    // affective.
    const keepMask = schedule.getKeepMask(currentOutputId)
    if (!keepMask.IsEmpty() ||
      schedule.getPassToOutput(currentOutputId) === null) {
      return output
    }

    // Lastly, we can seek ahead to the next associated output to figure out
    // if it has more than one read/write connection. If this is the case, we
    // found an output where multiple branches of the pool converge, as it is
    // the case with nodes just above parallel movers. We cannot pass through
    // nodes where the pool converges, unless we copy (keep) the entire buffer,
    // which we try to avoid here.
    const nextOutput = assocConnection.getSourceOutput()

    // Count the number of connected read/writes.
    const connections = nextOutput.getConnections()
    if (connections.length > 1) {
      let numNextReadWrites = 0
      for (const c of connections) {
        if (c.getTargetInput().getAssociatedOutput()) {
          ++numNextReadWrites
        }

        // More than one connected read/write? Cannot pass through the current
        // output.
        if (numNextReadWrites > 1) {
          return output
        }
      }
    }

    // The current output has been cleared for pass through, so we can add it
    // to the set of visited outputs.
    if (visitedOutputs.has(output)) {
      return output
    }
    visitedOutputs.add(output)

    // Continue the traversal in the input direction by setting the output to
    // the source output on the connection.
    output = nextOutput
  }

  // No more outputs.
  return output
}

/** Helper for _ScheduleForPassThroughs (scheduler.cpp:538-608). */
function _SchedulePassThroughForOutput(
  output: VdfOutput | null,
  visitedOutputs: Set<VdfOutput>,
  schedule: VdfSchedule,
): void {
  while (output) {
    // If this output has already been visited, bail out.
    if (visitedOutputs.has(output)) {
      return
    }
    visitedOutputs.add(output)

    // Retrieve the current output's id from the schedule.
    const outputId = schedule.getOutputId(output)
    if (!outputId.isValid()) {
      return
    }

    // Find the output directly above.
    const immediateOutput = VdfGetAssociatedSourceOutput(output)
    if (!immediateOutput) {
      return
    }

    // Never pass through all-zeros connection masks.
    if (output.getAssociatedInput()!.getConnections()[0]!.GetMask().isAllZeros()) {
      return
    }

    // Retrieve the immediate output's id from the schedule.
    const immediateOutputId = schedule.getOutputId(immediateOutput)
    if (!immediateOutputId.isValid()) {
      return
    }

    // For this node, find the output to pass from.
    const passFromOutput = _FindPrevAffectiveOutput(immediateOutput, visitedOutputs, schedule)
    if (passFromOutput && passFromOutput !== immediateOutput) {
      // Get output id for the pass-from output.
      const passFromOutputId = schedule.getOutputId(passFromOutput)

      // We can only schedule pass-throughs for unaffective nodes. The executor
      // engines do not (yet) support passing to an affective node.
      if (TF_VERIFY(immediateOutputId.isValid(), 'immediateOutputId.IsValid()') &&
        TF_VERIFY(passFromOutputId.isValid(), 'passFromOutputId.IsValid()')) {
        // Tell the source output to get its buffer from the first output that
        // we've found that will provide an affected value.
        schedule.setFromBufferOutput(immediateOutputId, passFromOutput)

        // For the passFromOutput, make sure to set the pass-to-output to the
        // immediate output that we will be passing to, now.
        if (schedule.getPassToOutput(passFromOutputId)) {
          schedule.setPassToOutput(passFromOutputId, immediateOutput)
        }
      }
    }

    // Move on to the next output in the chain, which is the output we are
    // passing from.
    output = passFromOutput
  }
}

/**
 * _AssignLockMaskForOutput (scheduler.cpp:1981-2057): sets up the lock mask
 * for sparse mung buffer locking at `output`. Returns true if data was
 * locked.
 */
function _AssignLockMaskForOutput(output: VdfOutput, schedule: VdfSchedule): boolean {
  // If the output is not part of the schedule, or not requested, then there is
  // no point in assigning a lock mask for sparse mung buffer locking. If the
  // output is not affective, bail out.
  const outputId = schedule.getOutputId(output)
  if (!outputId.isValid() ||
    !schedule.isAffective(outputId)) {
    return false
  }

  // Retrieve the output's affects mask from the schedule. We use it do
  // determine which bits in the mask have become un-affective at the next
  // output. Note, that the affects mask in the schedule is already a subset of
  // the request mask.
  const affectsMask = schedule.getAffectsMask(outputId)

  // Initialize an empty mask with the size of the affects mask at the current
  // output. Eventually, we will set all the bits affected at the output, so
  // that we can determine which bits to lock at this output.
  let affectedAtNext: VdfMask = new VdfMask(affectsMask.getSize())

  // Find the next affective output, which this output will be passing its
  // data to. If there is no next affective output, we will not add any bits
  // to the affectedAtNext mask and simply lock all bits at the current output.
  // Doing so allows us to lock the data at the requested outputs.
  let nextAffectedOutput: VdfOutput | null = output
  let nextAffectedId: VdfSchedule_OutputId = outputId
  while (nextAffectedOutput) {
    // If this output is not passing its data, bail out and lock everything.
    nextAffectedOutput = schedule.getPassToOutput(nextAffectedId)
    if (!nextAffectedOutput) {
      break
    }

    // If the next output is affective, store its affects mask and bail out,
    // otherwise continue searching for the next affective output.
    nextAffectedId = schedule.getOutputId(nextAffectedOutput)
    if (TF_VERIFY(nextAffectedId.isValid(), 'nextAffectedId.IsValid()') &&
      schedule.isAffective(nextAffectedId)) {
      affectedAtNext = schedule.getAffectsMask(nextAffectedId)
      break
    }
  }

  // If the next output is on a mover with more than one output, we must lock
  // everything in order to guarantee that no incorrect data ever flows into
  // this next mover. The reason is that the non-pool output may depend on any
  // bits of the associated pool input, i.e. all of the incoming data must be
  // correct.
  // XXX: Currently we do not expect any mover with more than one output!
  if (nextAffectedOutput &&
    !TF_VERIFY(nextAffectedOutput.getNode().getNumOutputs() === 1,
      'nextAffectedOutput->GetNode().GetNumOutputs() == 1')) {
    affectedAtNext = new VdfMask(affectsMask.getSize())
  }

  // Compute the lock mask by taking the affects mask at the current output,
  // and leaving any bits turned one, which are no longer affected at the
  // target output.
  const lockMask = affectsMask.subtract(affectedAtNext)

  // Add the locked bits to the keep mask.
  if (lockMask.isAnySet()) {
    const keepMask = _SetOrAppend(schedule.getKeepMask(outputId), lockMask)
    schedule.setKeepMask(outputId, keepMask)

    // Locked some data.
    return true
  }

  // Did not lock any data.
  return false
}

/** _FindInputs for one masked output (scheduler.cpp:2237-2277). */
function _FindInputsForMaskedOutput(maskedOutput: VdfMaskedOutput): VdfConnectionAndMaskVector {
  let dependencies: VdfConnectionAndMaskVector = []

  // Gather up all the read inputs, but only if the output is affective as
  // determined by the affects mask (or lack thereof).
  const output = maskedOutput.GetOutput()!
  const mask = maskedOutput.GetMask()
  const affectsMask = output.getAffectsMask()
  if (!affectsMask || affectsMask.overlaps(mask)) {
    // Upstream returns the vector by value; copy it before appending.
    dependencies = [...output.getNode().computeInputDependencyMasks(
      maskedOutput, /* skipAssociatedInputs = */ true)]
  }

  // Add associated inputs with the full request mask (ignoring sparse
  // dependencies) so that we have buffers to write into.
  const associatedInput = output.getAssociatedInput()
  if (associatedInput) {
    const connections = associatedInput.getConnections()

    // If there is more than one node connected on the input, something went
    // horribly wrong. We do not support this case.
    if (connections.length > 1) {
      VDF_FATAL_ERROR(
        output.getNode(),
        'Multiple inputs found on ' + associatedInput.getDebugName() +
        ' associated with output ' + output.getDebugName() +
        '.  The system doesn\'t know how to pass the data through.')
    }

    else if (connections.length !== 0) {
      const c = connections[0]!
      if (c.GetMask().isAnySet()) {
        dependencies.push([c, mask])
      }
    }
  }

  return dependencies
}

/** _FindInputs for the masked outputs of one node (scheduler.cpp:2279-2288). */
function _FindInputsForMaskedOutputs(maskedOutputs: VdfMaskedOutput[]): VdfConnectionAndMaskVector {
  if (maskedOutputs.length === 0) {
    return []
  }

  const node = maskedOutputs[0]!.GetOutput()!.getNode()
  return node.computeInputDependencyRequest(maskedOutputs)
}

/** _AddInputs (scheduler.cpp:2290-2310). */
function _AddInputs(
  dependencies: VdfConnectionAndMaskVector,
  schedule: VdfSchedule,
  stack: VdfMaskedOutput[],
): void {
  // The read/write outputs appear last in the dependencies array, and we also
  // want to traverse those last. Consequently, we need to push them onto the
  // stack first. Iterate in reverse order to do just that.
  for (let i = dependencies.length - 1; i >= 0; --i) {
    const [connection, mask] = dependencies[i]!
    schedule.addInput(connection, mask)
    stack.push(new VdfMaskedOutput(connection.getNonConstSourceOutput(), mask))
  }
}

/** _SetRequestMask (scheduler.cpp:2312-2335). Returns whether new bits were added. */
function _SetRequestMask(
  schedule: VdfSchedule,
  outputId: VdfSchedule_OutputId,
  newMask: VdfMask,
): boolean {
  let addedNewBits = false

  const requestMask = schedule.getRequestMask(outputId)

  if (requestMask.IsEmpty()) {
    schedule.setRequestMask(outputId, newMask)
    addedNewBits = true
  } else if (TF_VERIFY(!newMask.IsEmpty(), '!newMask.IsEmpty()')) {
    // If the existing mask has all of its bits already set in the currently
    // accumulated mask, then there is no new information added.
    addedNewBits = !requestMask.contains(newMask)
    // Mask already exists, or the new request mask in.
    if (addedNewBits) {
      schedule.setRequestMask(outputId, requestMask.or(newMask))
    }
  }
  return addedNewBits
}

/** _ProcessImmediateStack (scheduler.cpp:2337-2442). */
function _ProcessImmediateStack(
  stack: VdfMaskedOutput[],
  schedule: VdfSchedule,
  poolOutputQueue: _IndexToMaskedOutputMap,
  poolOutputs: VdfScheduler_PoolPriorityVector,
  deferredInputsToAdd: VdfScheduler_NodeToRequestMap,
): void {
  TF_DEV_AXIOM(deferredInputsToAdd, 'deferredInputsToAdd')

  // Process all the outputs that don't need to wait (i.e. those which are not
  // pool).
  while (stack.length !== 0) {
    const maskedOutput = stack.pop()!

    const output = maskedOutput.GetOutput()!
    const node = output.getNode()

    // If we encounter an output that has an affects mask, move it to the
    // poolOutputQueue for later processing.
    if (Vdf_IsPoolOutput(output)) {
      // The poolOutputQueue is a priority queue such that nodes further down
      // the pool chain are processed first. We achieve this by ordering with
      // greater-than on the pool chain index.
      const poolChainIndex = node.getNetwork().getPoolChainIndex(output)

      const [affectsMaskedOutput, inserted] =
        poolOutputQueue.try_emplace(poolChainIndex, maskedOutput)

      if (inserted) {
        // Add the output to the poolOutputs vector. Later in this function,
        // the vector will be sorted by pool chain index, i.e. downstream
        // outputs will be on the front of the vector.
        poolOutputs.push([poolChainIndex, output])
      } else {
        // We've already seen this output in this traversal. Grab the mask at
        // the previous point and OR it in to our current position, and update
        // the index. Doing this will make it so that the first time this
        // output is popped off for processing, we will process it with a
        // fuller mask, reducing the need for multiple traversals.
        const mask = affectsMaskedOutput.GetMask().or(maskedOutput.GetMask())

        TF_DEV_AXIOM(affectsMaskedOutput.GetOutput() === maskedOutput.GetOutput(),
          'affectsMaskedOutput.GetOutput() == maskedOutput.GetOutput()')

        affectsMaskedOutput.setMask(mask)
      }
    } else {
      const outputId = schedule.getOrCreateOutputId(output)
      TF_DEV_AXIOM(outputId.isValid(), 'outputId.IsValid()')

      // Append to our current request mask and note if we added any new
      // entries.
      const addedNewRequest = _SetRequestMask(schedule, outputId, maskedOutput.GetMask())

      // Skip speculation nodes, they cause cycles and do their own scheduling.
      if (node.isSpeculationNode()) {
        continue
      }

      // If we've added new entries, we need to do some further processing.
      // Otherwise, we're done.
      if (addedNewRequest) {
        // If the node has multiple outputs and the output in question is not
        // associated and doesn't have an affects mask we queue it up for
        // later vectorized processing. This helps cases like sharing nodes to
        // schedule quickly (those nodes can have thousands of outputs).
        //
        // XXX: We need to be careful what we actually add to the delayed
        //      deferredInputsToAdd map. This is because if we add too much, we
        //      might offsets we gain from the pool ordering optimizations.
        const addInputsVectorized =
          node.getNumOutputs() > NODE_OUTPUT_THRESHOLD &&
          !output.getAffectsMask() &&
          !output.getAssociatedInput()

        if (addInputsVectorized) {
          let deferred = deferredInputsToAdd.get(node)
          if (!deferred) {
            deferred = []
            deferredInputsToAdd.set(node, deferred)
          }
          deferred.push(maskedOutput)
        } else {
          _AddInputs(_FindInputsForMaskedOutput(maskedOutput), schedule, stack)
        }
      }
    }
  }
}

/** _TopologicallySort (scheduler.cpp:2594-2641). */
function _TopologicallySort(request: VdfRequest, schedule: VdfSchedule): void {
  // Prime the working stack with the given requested outputs.
  const stack: Array<[VdfOutput, boolean]> = []
  for (const mo of request) {
    stack.push([mo.GetOutput()!, false])
  }

  // Process the stack.
  while (stack.length !== 0) {
    const top = stack[stack.length - 1]!
    const output = top[0]
    const node = output.getNode()

    // Append this output to the sorted result immediately if we've already
    // processed all its dependencies.
    if (top[1] || schedule.isScheduled(node)) {
      schedule.getOrCreateOutputId(output)
      stack.pop()
      continue
    }

    // Before traversing the top output's dependencies, mark that when we
    // return to this point in the stack, we need to process the output
    // itself.
    top[1] = true

    // If this is a speculation node, do not traverse its inputs.
    if (node.isSpeculationNode()) {
      continue
    }

    // Traverse the inputs.
    for (const [, input] of node.getInputsIterator()) {
      const connections = input.getConnections()
      for (const c of connections) {
        const sourceOutput = c.getSourceOutput()
        stack.push([sourceOutput, false])
      }
    }
  }
}

/** Fails loudly for the parallel task graph (scheduler.cpp:646-1980). */
function _TaskGraphNotPorted(what: string, site: string): never {
  // PLATFORM-DIVERGENCE(openexec-parallel): the scheduled task graph for the
  // parallel evaluation engine (scheduler.cpp:646-1980: invocations,
  // compute/inputs/keep/prep tasks, input dependencies) -> port it with the
  // parallel engine, when VDF_ENABLE_PARALLEL_EVALUATION_ENGINE can be true.
  const message =
    `VdfScheduler::${what} (${site}) builds the task graph of the parallel ` +
    'evaluation engine, which is not ported (openexec-parallel)'
  TF_CODING_ERROR(message)
  throw new Error(message)
}

/** Used to make a VdfSchedule (scheduler.h:32). */
export class VdfScheduler {
  /**
   * Generates a schedule (scheduler.cpp:2643-2700).
   */
  static schedule(request: VdfRequest, schedule: VdfSchedule, topologicallySort: boolean): void {
    schedule.clear()

    // It's a valid schedule, it's just empty.
    if (request.IsEmpty()) {
      VdfScheduler._setScheduleValid(schedule, null)
      return
    }

    // Initialize the size of the network we're dealing with.
    const network = request.getNetwork()!
    schedule.initializeFromNetwork(network)

    // If we've been asked to schedule in topological order, sort the nodes
    // before we start scheduling.
    if (topologicallySort) {
      _TopologicallySort(request, schedule)
    }

    // Initialize all the request masks.
    const poolOutputs: VdfScheduler_PoolPriorityVector = []
    VdfScheduler._initializeRequestMasks(request, schedule, poolOutputs)

    // Schedule the buffer-passing.
    VdfScheduler._scheduleBufferPasses(request, schedule)

    // Set the affects masks so that they only affect the things in the
    // request.
    VdfScheduler._applyAffectsMasks(schedule)

    // This call fills in the passToOutput to speed up the passing of buffers
    // by skipping all the outputs in between that have no effect. This needs
    // to happen AFTER all the keep masks have been set up correctly.
    VdfScheduler._scheduleForPassThroughs(request, schedule, poolOutputs)

    // Schedule node tasks.
    if (VdfIsParallelEvaluationEnabled()) {
      VdfScheduler._scheduleTaskGraph(schedule, poolOutputs)
    }

    // Determine if this is a small schedule.
    VdfScheduler._markSmallSchedule(schedule)

    // Set the request.
    schedule.setRequest(request)

    // The schedule is done and is now valid.
    VdfScheduler._setScheduleValid(schedule, network)
  }

  /**
   * Update `schedule` after the affects mask changed on `output`
   * (scheduler.cpp:2702-2782). Returns false if the schedule must be rebuilt.
   */
  static updateAffectsMaskForOutput(schedule: VdfSchedule, output: VdfOutput): boolean {
    if (!TF_VERIFY(
      output.getAssociatedInput() &&
      output.getAffectsMask(),
      'output.GetAssociatedInput() && output.GetAffectsMask()')) {
      return true
    }

    // If the output is not scheduled, we don't need to update anything.
    const outputId = schedule.getOutputId(output)
    if (!outputId.isValid()) {
      return true
    }

    // If the affects mask does not overlap with the request mask in the
    // schedule, we don't need to update anything.
    const requestMask = schedule.getRequestMask(outputId)
    const isAffective = output.getAffectsMask()!.overlaps(requestMask)
    if (!isAffective) {
      return true
    }

    // Find all the outputs connected to the input dependencies.
    const dependencies = _FindInputsForMaskedOutput(new VdfMaskedOutput(output, requestMask))

    // Check if the dependencies are already all scheduled. The dependencies
    // may have changed, since they are dependent on the affects mask.
    for (const [connection, mask] of dependencies) {
      const sourceOutput = connection.getSourceOutput()
      const dependencyOutputId = schedule.getOutputId(sourceOutput)

      // Already scheduled. We can update the schedule as long as the request
      // mask already contains the dependency.
      if (dependencyOutputId.isValid()) {
        const dependencyRequestMask = schedule.getRequestMask(dependencyOutputId)
        if (!dependencyRequestMask.contains(mask)) {
          return false
        }
      }

      // Not scheduled. We can't update the schedule and need to rebuild it
      // instead.
      else {
        return false
      }
    }

    // We cannot update the schedule, if the owning node is not included in
    // the schedule (i.e. it is a trivial node.) In that case, the state of
    // affective-ness has changed for sure.
    const scheduleNodeIdx = schedule._getScheduleNodeIndex(output.getNode())
    if (scheduleNodeIdx < 0) {
      return false
    }

    // Retrieve the schedule node.
    const scheduleNode = schedule.getScheduleNodeVector()[scheduleNodeIdx]!

    // Update the affects masks for the node.
    if (!VdfScheduler._updateAffectsMasksForNode(schedule, scheduleNode)) {
      return false
    }

    // Update the lock masks for the node.
    if (schedule.hasSMBL()) {
      VdfScheduler._updateLockMaskForNode(schedule, scheduleNode)
    }

    // We were able to successfully update the schedule. There is no need for
    // it to be rebuilt.
    return true
  }

  /**
   * Method to signal that a `schedule` is done being built and that it is now
   * valid for the given `network` (scheduler.cpp:2784-2790).
   */
  protected static _setScheduleValid(schedule: VdfSchedule, network: VdfNetwork | null): void {
    TF_DEV_AXIOM(schedule, 'schedule')
    schedule._setIsValidForNetwork(network)
  }

  /**
   * Initializes the request masks for all the outputs that will be computed
   * as a result of `request` (scheduler.cpp:2453-2574). `poolOutputs`
   * receives the pool outputs scheduled with request masks, sorted in reverse
   * order of pool chain index.
   */
  protected static _initializeRequestMasks(
    request: VdfRequest,
    schedule: VdfSchedule,
    poolOutputs: VdfScheduler_PoolPriorityVector,
  ): void {
    if (!TF_VERIFY(!request.IsEmpty(), '!request.IsEmpty()')) {
      return
    }

    // Stack to contain the outputs that need processing before the outputs
    // with an affects mask.
    const stack: VdfMaskedOutput[] = []

    // The outputs that have affects mask and need to be processed after all
    // the nodes under them (contained in 'stack'). The poolOutputQueue is a
    // priority queue with the priority being the index returned by the
    // VdfPoolChainIndexer.
    const poolOutputQueue = new _IndexToMaskedOutputMap()

    // Initialize the stack with the outputs from the request. Verify that all
    // requested outputs come from the same network. The masked outputs are
    // copied, as upstream copies them onto the stack, because the queue
    // updates their masks.
    const network = request.getNetwork()
    for (const i of request) {
      if (TF_VERIFY(i.GetOutput()!.getNode().getNetwork() === network,
        '&i->GetOutput()->GetNode().GetNetwork() == network')) {
        stack.push(new VdfMaskedOutput(i.GetOutput(), i.GetMask()))
      }
    }

    // A map from node to request, used when multiple outputs are requested
    // from a node in one go.
    const deferredInputsToAdd: VdfScheduler_NodeToRequestMap = new Map()

    // Now process all the remaining outputs before we process another output
    // with an affects mask.
    _ProcessImmediateStack(stack, schedule, poolOutputQueue, poolOutputs, deferredInputsToAdd)

    while (deferredInputsToAdd.size !== 0 || !poolOutputQueue.empty()) {
      while (!poolOutputQueue.empty()) {
        // Get the first item of the poolOutputQueue which will be the item
        // with the lowest point pool index.
        const maskedOutput = poolOutputQueue.popFront()

        const output = maskedOutput.GetOutput()!
        const outputId = schedule.getOrCreateOutputId(output)
        if (!TF_VERIFY(outputId.isValid(), 'outputId.IsValid()')) {
          continue
        }

        // Add the current mask to the request and note if the request has
        // changed at all.
        const addedNewRequest = _SetRequestMask(schedule, outputId, maskedOutput.GetMask())

        // The pool is never output from a VdfSpeculationNode.
        if (!TF_VERIFY(!output.getNode().isSpeculationNode(),
          '!output.GetNode().IsSpeculationNode()')) {
          continue
        }

        // We only have work to do when we added new bits to the request mask.
        if (addedNewRequest) {
          // Now add our inputs to be processed.
          _AddInputs(_FindInputsForMaskedOutput(maskedOutput), schedule, stack)
        }

        // Now process all the remaining outputs before we process another
        // output with an affects mask.
        _ProcessImmediateStack(stack, schedule, poolOutputQueue, poolOutputs, deferredInputsToAdd)
      }

      if (deferredInputsToAdd.size !== 0) {
        // Use the vectorized API to compute all inputs dependencies for all
        // scheduled outputs of the given node in one single call. This helps
        // if the node can provide those dependencies quickly (like the
        // Mf_ExecSharingNode).
        //
        // Upstream iterates the TfHashMap in hash order; this iterates in
        // insertion order.
        for (const [, maskedOutputs] of deferredInputsToAdd) {
          _AddInputs(_FindInputsForMaskedOutputs(maskedOutputs), schedule, stack)
        }
        deferredInputsToAdd.clear()

        // Now process all the remaining outputs before we process another node
        // with multiple outputs.
        _ProcessImmediateStack(stack, schedule, poolOutputQueue, poolOutputs, deferredInputsToAdd)
      }
    }

    // Calls to _AddInputs in the traversal above collect scheduled inputs
    // without checking for duplicates or merging masks. We defer this
    // deduplication because, even though merging immediately in
    // VdfSchedule::AddInput is efficient for nodes with few inputs, deferred
    // sorting and merging is an overall gain when sharing nodes are involved
    // because they can have thousands of scheduled inputs.
    schedule.deduplicateInputs()

    // Sort using greater-than so that outputs further down in the network
    // appear at the front of the vector. Clients expect pool outputs in
    // bottom-up order (_PoolChainIndexGreaterThan, scheduler.cpp:2445-2451).
    poolOutputs.sort((lhs, rhs) =>
      rhs[0].lessThan(lhs[0]) ? -1 : lhs[0].lessThan(rhs[0]) ? 1 : 0)

    // std::unique: remove consecutive equal pairs.
    let write = 0
    for (let read = 0; read < poolOutputs.length; ++read) {
      const entry = poolOutputs[read]!
      const prev = write > 0 ? poolOutputs[write - 1]! : undefined
      if (prev && prev[0].Equals(entry[0]) && prev[1] === entry[1]) {
        continue
      }
      poolOutputs[write++] = entry
    }
    poolOutputs.length = write
  }

  /** Marks the schedule as small if it is indeed small (scheduler.cpp:2576-2592). */
  protected static _markSmallSchedule(schedule: VdfSchedule): void {
    // If we have a small schedule, just remove the _nodesToIndexMap, flag it,
    // and call it a day.
    const smallScheduleSize = 32
    if (schedule._nodes.length <= smallScheduleSize) {
      schedule._isSmallSchedule = true
      schedule._nodesToIndexMap = []
    } else if (!TF_VERIFY(!schedule._isSmallSchedule, '!schedule->_isSmallSchedule')) {
      // Schedule isSmallSchedule should already have been set to false. We
      // shouldn't hit this.
      schedule._isSmallSchedule = false
    }
  }

  /**
   * Method to schedule the buffer passes and the "keep" masks for the
   * scheduled nodes (scheduler.cpp:402-438).
   */
  protected static _scheduleBufferPasses(request: VdfRequest, schedule: VdfSchedule): void {
    // Make sure that all read/writes on each scheduled node are requested.
    // Upstream iterates the vector with TF_FOR_ALL, which reads the size once
    // per step; GetOrCreateOutputId adds outputs, not schedule nodes.
    for (const node of schedule.getScheduleNodeVector()) {
      _ScheduleUnrequestedReadWrites(node, schedule)
    }

    // Make sure that information for buffer passing and keeping is set up.
    for (const node of schedule.getScheduleNodeVector()) {
      _SetBufferPassDataForOutputs(node, schedule)
    }

    // In order to avoid passing buffers for outputs, which are requested, we
    // set the keep mask to include the whole request mask at each output in
    // the request. Instead, we could just set the keep mask to the mask in the
    // request, meaning that we would only keep what's really been requested at
    // that output. If a subsequent request, with a new schedule, however, asks
    // for the same output again, keeping the whole request mask increases our
    // chances of being able to re-use that output cache!
    for (const i of request) {
      const outputId = schedule.getOutputId(i.GetOutput()!)
      TF_DEV_AXIOM(outputId.isValid(), 'outputId.IsValid()')
      schedule.setKeepMask(outputId, schedule.getRequestMask(outputId))
    }
  }

  /**
   * Schedule the outputs from which buffers should be passed
   * (scheduler.cpp:610-639). `sortedPoolOutputs` must be in descending order
   * of pool chain index.
   */
  protected static _scheduleForPassThroughs(
    _request: VdfRequest,
    schedule: VdfSchedule,
    sortedPoolOutputs: VdfScheduler_PoolPriorityVector,
  ): void {
    // Visited outputs for cycle detection. Using this hash set, we can also
    // make sure to schedule every pool chain branch exactly once. There may be
    // multiple entry points into the pool, but since we start with the lowest
    // entry, every subsequent, higher entry will already be added to the set
    // of visited outputs.
    const visitedOutputs = new Set<VdfOutput>()

    // Process the queue of point pool outputs, starting with the lowest pool
    // output (which has the greatest pool chain index; pool outputs must
    // already be sorted!)
    for (const [, output] of sortedPoolOutputs) {
      // Schedule pass throughs for the point pool branch as identified by the
      // point pool output retrieved from the queue. The function below will
      // bail out early, if the branch has already been scheduled for pass
      // throughs.
      _SchedulePassThroughForOutput(output, visitedOutputs, schedule)
    }
  }

  /**
   * Generate tasks for the scheduled task graph, used by the parallel
   * evaluation engine (scheduler.cpp:1795-1932). Not ported.
   */
  protected static _generateTasks(
    _schedule: VdfSchedule,
    _sortedPoolOutputs: VdfScheduler_PoolPriorityVector,
  ): void {
    _TaskGraphNotPorted('_GenerateTasks', 'scheduler.cpp:1795')
  }

  /**
   * Schedule the task graph for multi-threaded munging
   * (scheduler.cpp:1934-1979). Not ported.
   */
  protected static _scheduleTaskGraph(
    _schedule: VdfSchedule,
    _sortedPoolOutputs: VdfScheduler_PoolPriorityVector,
  ): void {
    _TaskGraphNotPorted('_ScheduleTaskGraph', 'scheduler.cpp:1937')
  }

  /**
   * Setup the lock masks required for sparse mung buffer locking for all the
   * outputs in the pool chain (scheduler.cpp:2059-2077).
   */
  protected static _computeLockMasks(
    _request: VdfRequest,
    schedule: VdfSchedule,
    sortedPoolOutputs: VdfScheduler_PoolPriorityVector,
  ): void {
    // Enable Sparse Mung Buffer Locking (SMBL) in the schedule?
    let enableSMBL = false

    // For each pool output found, assign the lock masks.
    for (const [, output] of sortedPoolOutputs) {
      enableSMBL = _AssignLockMaskForOutput(output, schedule) || enableSMBL
    }

    // Enable sparse mung buffer locking if data has been locked.
    schedule.setHasSMBL(enableSMBL)
  }

  /** Applies the affects mask to the schedule (scheduler.cpp:2079-2087). */
  protected static _applyAffectsMasks(schedule: VdfSchedule): void {
    for (const so of schedule.getScheduleNodeVector()) {
      VdfScheduler._applyAffectsMasksForNode(so)
    }
  }

  /**
   * Applies the affects masks to the scheduled node (scheduler.cpp:2089-2128).
   * Returns false, if there was any change in state that requires full
   * re-scheduling.
   */
  protected static _applyAffectsMasksForNode(node: VdfScheduleNode): boolean {
    const wasAffective = node.affective

    node.affective = false

    // If the node manages its own buffers we leave 'affective' at false which
    // will result in the node not being run (while the outputs are still
    // scheduled).
    if (VdfRootNode.isARootNode(node.node)) {
      return !wasAffective
    }

    for (const so of node.outputs) {
      // For outputs that have an associated input connector, and for those
      // where an affects mask has been set, AND the affects mask with the
      // request mask.
      const output = so.output
      if (output.getAssociatedInput()) {
        const affectsMask = output.getAffectsMask()
        so.affectsMask = affectsMask && !so.requestMask.IsEmpty()
          ? so.requestMask.and(affectsMask)
          : so.requestMask
      }

      // Given the affects masks, mark each scheduled node as "affective" or
      // not. Note that if an output has no associated input (unlike the .pool
      // outputs on movers), it is said to be "affective."
      node.affective = node.affective ||
        !output.getAssociatedInput() || so.affectsMask.isAnySet()
    }

    // Return false, if there was any change in state that requires full
    // re-scheduling.
    return wasAffective === node.affective
  }

  /**
   * Updates the affects mask on an existing scheduled node invocation
   * (scheduler.cpp:2130-2194).
   */
  protected static _updateAffectsMaskForInvocation(
    _schedule: VdfSchedule,
    _node: VdfScheduleNode,
  ): void {
    // With parallel evaluation disabled, we can bail out.
    if (!VdfIsParallelEvaluationEnabled()) {
      return
    }

    // Node invocations exist only in the task graph.
    _TaskGraphNotPorted('_UpdateAffectsMaskForInvocation', 'scheduler.cpp:2141')
  }

  /**
   * Updates schedule for `node` if affects mask changed
   * (scheduler.cpp:2196-2212).
   */
  protected static _updateAffectsMasksForNode(
    schedule: VdfSchedule,
    node: VdfScheduleNode,
  ): boolean {
    // Apply the new affects masks to the node, but if this does not succeed
    // indicate that the schedule cannot be updated.
    if (!VdfScheduler._applyAffectsMasksForNode(node)) {
      return false
    }

    // Update affects masks for any node invocations, if they exist.
    VdfScheduler._updateAffectsMaskForInvocation(schedule, node)

    // We were able to successfully update the schedule.
    return true
  }

  /** Updates schedule for `node` if the lock mask changed (scheduler.cpp:2214-2235). */
  protected static _updateLockMaskForNode(schedule: VdfSchedule, node: VdfScheduleNode): void {
    // Find the pool output and re-assign the lock mask.
    for (const o of node.outputs) {
      if (Vdf_IsPoolOutput(o.output)) {
        // Update the lock mask for the output.
        _AssignLockMaskForOutput(o.output, schedule)

        // Find the output, which will be passing its data to this output. We
        // also need to update the lock mask there. This is because the lock
        // mask at that output depends on the affects mask at the pass-to
        // output, which has just been modified.
        if (o.fromBufferOutput) {
          // Now, update the lock mask for the from-buffer output.
          _AssignLockMaskForOutput(o.fromBufferOutput, schedule)
        }
      }
    }
  }
}

export declare namespace VdfScheduler {
  type PoolPriorityVector = VdfScheduler_PoolPriorityVector
  type NodeToRequestMap = VdfScheduler_NodeToRequestMap
}
