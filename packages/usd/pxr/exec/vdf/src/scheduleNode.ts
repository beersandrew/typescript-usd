// Ported from OpenUSD 26.11.1: pxr/exec/vdf/scheduleNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/scheduleNode.h.

import { VdfMask } from './mask.ts'
import type { VdfInput } from './input.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import {
  VdfScheduleTaskInvalid,
  type VdfScheduleInputDependencyUniqueIndex,
} from './scheduleTasks.ts'

/**
 * This class contains scheduling information for an output. A
 * VdfScheduleNode contains a list of these (scheduleNode.h:30).
 */
export class VdfScheduleOutput {
  /** The output (never null upstream: every construction site passes one). */
  output: VdfOutput

  /** The request mask for this output. */
  requestMask: VdfMask

  /** The request mask ANDed with the affects mask (if any). */
  affectsMask: VdfMask = new VdfMask()

  /** The output to pass a buffer to. */
  passToOutput: VdfOutput | null = null

  /** The output to get our buffer from. */
  fromBufferOutput: VdfOutput | null = null

  /**
   * The mask of the data this output is supposed to keep after it passes its
   * buffer to passToOutput.
   */
  keepMask: VdfMask = new VdfMask()

  /** The unique index assigned to this output, if it passes its buffer. */
  uniqueIndex: VdfScheduleInputDependencyUniqueIndex = VdfScheduleTaskInvalid

  // scheduleNode.h:33-36
  constructor(o: VdfOutput, m: VdfMask) {
    this.output = o
    this.requestMask = m
  }
}

/**
 * This class contains scheduling information for an input. A VdfScheduleNode
 * contains a list of these (scheduleNode.h:70).
 */
export interface VdfScheduleInput {
  /**
   * The output from which the scheduled input sources its values. Upstream
   * nulls this pointer while deduplicating (schedule.cpp:181), hence nullable.
   */
  source: VdfOutput | null

  /**
   * The dependency mask, indicating which elements of the source output value
   * this input depends on.
   */
  mask: VdfMask

  /** The input corresponding to this scheduled input. */
  input: VdfInput
}

/**
 * This class contains scheduling information necessary to run a single
 * VdfNode (scheduleNode.h:93).
 */
export class VdfScheduleNode {
  /** The node being scheduled. */
  readonly node: VdfNode

  /**
   * An output whose temporary buffer can be deallocated as soon as this
   * schedule node has finished executing.
   */
  outputToClear: VdfOutput | null = null

  /**
   * Whether this node, as scheduled, is affective, meaning it cannot be
   * ignored as an optimization while a buffer is passed from an input to its
   * associated output.
   */
  affective = false

  /** The list of outputs that are being scheduled for this node. */
  readonly outputs: VdfScheduleOutput[] = []

  /** The list of inputs scheduled for this node. */
  inputs: VdfScheduleInput[] = []

  // scheduleNode.h:96-97
  constructor(n: VdfNode) {
    this.node = n
  }

  /**
   * Returns the index of `output` in the `outputs` array, or -1 if it does
   * not exist (scheduleNode.h:102-111).
   */
  getOutputIndex(output: VdfOutput): number {
    const size = this.outputs.length
    for (let i = 0; i < size; ++i) {
      if (this.outputs[i]!.output === output) {
        return i
      }
    }
    return -1
  }
}
