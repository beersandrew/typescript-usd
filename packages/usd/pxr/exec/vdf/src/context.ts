// Ported from OpenUSD 26.11.1: pxr/exec/vdf/context.cpp,
//  pxr/exec/vdf/context.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/context.h and context.cpp.
//
// Templates: `GetInputValue<T>(name)` is `GetInputValue<T>(type, name)`, the
// TfType standing in for the template argument. SetOutput deduces `T` from
// its argument upstream, so here it takes only the value; the value type is
// the output spec's type.

import { TF_CODING_ERROR, TF_DEV_AXIOM, TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'

import { VDF_FATAL_ERROR } from './error.ts'
import type { VdfEvaluationState } from './evaluationState.ts'
import { VdfExecutionTypeRegistry } from './executionTypeRegistry.ts'
import type { VdfExecutorErrorLogger } from './executorErrorLogger.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import { VdfGrapher } from './grapher.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import type { VdfSchedule } from './schedule.ts'
import {
  VdfScheduleTaskInvalid,
  VdfScheduleTaskIsInvalid,
  type VdfScheduleTaskIndex,
} from './scheduleTasks.ts'
import type { VdfVector } from './vector.ts'

/**
 * Stores `value` in `vector` (VdfVector::Set, deduced `T` upstream). The type
 * is the output spec's value type.
 */
function _SetVectorValue(vector: VdfVector, output: VdfOutput, value: unknown): void {
  const type: TfType = output.getSpec().getType()
  vector.Set(type, value)
}

/**
 * A context is the parameter bundle passed to callbacks of computations. It
 * is the only API through which functions have access to their inputs
 * (context.h:37).
 */
export class VdfContext {
  // The evaluation state.
  private readonly _state: VdfEvaluationState

  // The node this context has been built for.
  private readonly _node: VdfNode

  // The current node invocation index. If this context is not for a node with
  // multiple invocations, this will be set to VdfScheduleTaskInvalid.
  private readonly _invocation: VdfScheduleTaskIndex

  /**
   * Constructs a VdfContext for the given `node` (and node `invocation`) with
   * the current evaluation `state` (context.h:47-63).
   */
  constructor(
    state: VdfEvaluationState,
    node: VdfNode,
    invocation: VdfScheduleTaskIndex = VdfScheduleTaskInvalid,
  ) {
    this._state = state
    this._node = node
    this._invocation = invocation
  }

  /**
   * Returns a value from the input named `name` of type `T`. This method
   * assumes that the caller expects only a single value to exist on its input
   * (context.h:302-319).
   */
  getInputValue<T>(type: TfType, name: string): T {
    // Calling this API means that the client expects there to be one and only
    // one value, so we always return the first one here if there are any.
    const value = this._getFirstInputValue<T>(type, name)
    if (value !== null) {
      return value
    }

    TF_CODING_ERROR(
      `No input value for token '${name}' on node '${this.getNodeDebugName()}'`)

    // Ask the type registry for the fallback value to use.
    return VdfExecutionTypeRegistry.GetInstance().getFallback<T>(type)
  }

  /**
   * Returns the value from the input named `name` if the input has a valid
   * value, otherwise returns `defPtr`, which defaults to null
   * (context.h:321-335).
   */
  getInputValuePtr<T>(type: TfType, name: string, defPtr: T | null = null): T | null {
    const value = this._getFirstInputValue<T>(type, name)
    return value !== null ? value : defPtr
  }

  /**
   * Returns true if there are input values from the input named `name`
   * (context.cpp:171-198).
   */
  hasInputValue(name: string): boolean {
    // The implementation here is similar to what _GetFirstInputValue does, and
    // to what VdfReadIterator does.
    const input = this._getNode().getInput(name)
    if (!input) {
      return false
    }

    for (const connection of input.getConnections()) {
      const mask = connection.GetMask()
      if (mask.isAllZeros()) {
        continue
      }

      // The connection has a mask on it, return true if there's a value.
      const vector = this._getExecutor()._getInputValue(connection, mask)
      if (vector) {
        if (vector.getNumStoredElements() > 0) {
          return true
        }
      }
    }

    // No values on any of the connections.
    return false
  }

  /**
   * Returns true if the output named `outputName` is requested by at least
   * one downstream node (context.cpp:200-207).
   */
  isOutputRequested(outputName: string): boolean {
    // Look up the output for outputName and use the private method to return
    // its requested-ness.
    const output = this._node.GetOutput(outputName)
    return !!output && this._isRequiredOutput(output)
  }

  /**
   * Sets the value of the only output (`SetOutput(value)`, context.h:390-418)
   * or of the output named `outputName` (`SetOutput(outputName, value)`,
   * context.h:375-388 and 420-433). The copy and move overloads are the same
   * here.
   */
  setOutput(value: unknown): void
  setOutput(outputName: string, value: unknown): void
  setOutput(...args: [unknown] | [string, unknown]): void {
    if (args.length === 1) {
      // GetOutput emits an error if it returns NULL. Note that there is no
      // need to check _IsRequiredOutput: By virtue of the owning node being
      // scheduled, we can conclude that its only output is therefore
      // scheduled.
      const output = this._node.GetOutput()
      if (output) {
        const v = this._getExecutor()._getOutputValueForWriting(output)
        if (v) {
          _SetVectorValue(v, output, args[0])
        }
      }
      return
    }

    // GetOutput emits an error if it returns NULL.
    const [outputName, value] = args
    const output = this._node.GetOutput(outputName)
    if (output && this._isRequiredOutput(output)) {
      const v = this._getExecutor()._getOutputValueForWriting(output)
      if (v) {
        _SetVectorValue(v, output, value)
      }
    }
  }

  /**
   * Sets an empty value on the only output (context.cpp:18-37), or on the
   * output named `outputName` (context.cpp:39-57).
   */
  setEmptyOutput(outputName?: string): void {
    let output: VdfOutput | null
    if (outputName === undefined) {
      // GetOutput emits an error if it returns null. Note that there is no
      // need to check _IsRequiredOutput: By virtue of the owning node being
      // scheduled, we can conclude that its only output is therefore
      // scheduled.
      output = this._node.GetOutput()
      if (!output) {
        return
      }
    } else {
      // GetOutput emits an error if it returns null.
      output = this._node.GetOutput(outputName)
      if (!(output && this._isRequiredOutput(output))) {
        return
      }
    }

    if (!TF_VERIFY(!output.getAssociatedInput(), '!output->GetAssociatedInput()',
      `Attempt to set an empty value on associated output '${output.getDebugName()}'`)) {
      return
    }

    const vector = this._getExecutor()._getOutputValueForWriting(output)
    if (!vector) {
      VDF_FATAL_ERROR(this._getNode(), "Couldn't get output vector.")
    }

    vector.clear()
  }

  /**
   * Sets the one and only output to have the same output value as the value
   * on the output connected to input `inputName` (context.cpp:59-108).
   */
  setOutputToReferenceInput(inputName: string): void {
    const input = this._node.getInput(inputName)
    const output = this._node.GetOutput()

    if (!input) {
      TF_CODING_ERROR(`Invalid input name '${inputName}' specified.`)
      return
    }

    if (input.getNumConnections() !== 1) {
      TF_CODING_ERROR(`Invalid number of inputs on '${inputName}'.`)
      return
    }

    if (!output) {
      TF_CODING_ERROR(`Invalid output for node '${this._node.getDebugName()}'.`)
      return
    }

    // See if we can apply the reference optimization. We can't do this if the
    // output is connected to an r/w input.
    let needCopy = false
    for (const wc of output.getConnections()) {
      if (wc.getTargetInput().getAssociatedOutput()) {
        needCopy = true
        break
      }
    }

    const c = input.getConnections()[0]!
    const sourceMask = c.GetMask()

    if (needCopy) {
      // Our output feeds into a r/w, need to make a copy.
      const rd = this._getExecutor()._getInputValue(c, sourceMask)
      const wr = this._getExecutor()._getOutputValueForWriting(output)
      if (wr) {
        // `*wr = *rd`: upstream dereferences rd unchecked.
        TF_DEV_AXIOM(rd, 'rd')
        wr.assign(rd)
      }
      return
    }

    // XXX: Need to type check?
    this._getExecutor()._setReferenceOutputValue(output, c.getSourceOutput(), sourceMask)
  }

  /**
   * Reports a warning to the system that was encountered at runtime
   * (context.cpp:111-118). Upstream formats printf-style; callers pass the
   * formatted message.
   */
  warn(message: string): void {
    this._state.LogWarning(this._node, message)
  }

  /** Returns the debug name for the node for this context (context.cpp:120-124). */
  getNodeDebugName(): string {
    return this._node.getDebugName()
  }

  /**
   * Invokes a coding error with an error message and a graph around the node
   * that this context is currently referencing (context.cpp:135-143).
   */
  CodingError(message: string): void {
    VdfGrapher.graphNodeNeighborhood(this._node, 5, 5)
    TF_CODING_ERROR(message)
  }

  /**
   * Returns the first input value on the given input, or null, if no such
   * value exists (context.h:337-375).
   */
  private _getFirstInputValue<T>(type: TfType, name: string): T | null {
    // We need to implement code fairly similar to what the VdfReadIterator has
    // to do. The up side is that we can implement a more specific semantic
    // (namely that we return nullptr when the input is connected but not
    // executed, whereas the read iterator will error out). The downside is
    // that we have to make sure that whenever we return true, that the read
    // iterator can reasonably provide a value. So the code must be kept at
    // least somewhat in sync.
    const input = this._getNode().getInput(name)
    if (!input) {
      return null
    }

    for (const connection of input.getConnections()) {
      const mask = connection.GetMask()
      const firstIndex = mask.getFirstSet()
      if (firstIndex < mask.getSize()) {
        // The connection has a mask on it, make sure there's a value present.

        // Get the output to read the value from.
        const value = this._getExecutor()._getInputValue(connection, mask)

        if (value) {
          const accessor = value.getReadAccessor<T>(type)
          if (firstIndex < accessor.getNumValues()) {
            return accessor.Get(firstIndex)
          }
        }
      }
    }

    // No values on any of the connections.
    return null
  }

  /**
   * Retrieves the request and affects mask of the requested output, if
   * available (context.cpp:136-169). Returns [true, requestMask, affectsMask]
   * if the output is scheduled, and [false, null, null] otherwise; upstream
   * returns the masks through pointer out-parameters.
   *
   * Note, output must be an output on the current node! VdfIterator is a
   * friend.
   * @internal
   */
  _getOutputMasks(output: VdfOutput): [boolean, VdfMask | null, VdfMask | null] {
    TF_DEV_AXIOM(output.getNode() === this._getNode(), '&output.GetNode() == &_GetNode()')

    const schedule = this._getSchedule()
    if (!VdfScheduleTaskIsInvalid(this._invocation)) {
      const [requestMask, affectsMask] = schedule.getRequestAndAffectsMask(this._invocation)
      return [true, requestMask, affectsMask]
    }

    const outputId = schedule.getOutputId(output)
    if (outputId.isValid()) {
      const [requestMask, affectsMask] = schedule.getRequestAndAffectsMask(outputId)
      return [true, requestMask, affectsMask]
    }

    // Note that this is not an error and can readily happen when a node with
    // multiple outputs gets executed and sets all its outputs at once. Some of
    // these outputs are not necessarily scheduled. The caller then is
    // responsible for checking the return value, and skipping outputs that are
    // not scheduled.
    return [false, null, null]
  }

  /**
   * Returns true when the output is scheduled and required, and false
   * otherwise (context.cpp:209-214). VdfIterator is a friend.
   * @internal
   */
  _isRequiredOutput(output: VdfOutput): boolean {
    const outputId = this._getSchedule().getOutputId(output)
    return outputId.isValid()
  }

  /**
   * Returns the request mask of `output`, if the output has been scheduled
   * and null otherwise (context.cpp:216-226). VdfIterator is a friend.
   * @internal
   */
  _getRequestMask(output: VdfOutput): VdfMask | null {
    const outputId = this._getSchedule().getOutputId(output)
    // If the output is not even scheduled, there is no request mask.
    if (outputId.isValid()) {
      return this._getSchedule().getRequestMask(outputId)
    }

    return null
  }

  /** Returns the current node (context.h:270). @internal */
  _getNode(): VdfNode { return this._node }

  /**
   * Returns the executor for this context (context.h:274). VdfIterator and
   * VdfSpeculationNode are friends.
   * @internal
   */
  _getExecutor(): VdfExecutorInterface { return this._state.getExecutor() }

  /** Returns the schedule for this context (context.h:278). @internal */
  _getSchedule(): VdfSchedule { return this._state.getSchedule() }

  /** Returns the error logger for this context (context.h:282-284). @internal */
  _getErrorLogger(): VdfExecutorErrorLogger | null {
    return this._state.getErrorLogger()
  }
}
