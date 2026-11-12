// Ported from OpenUSD 26.11.1: pxr/exec/vdf/scheduleTasks.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/scheduleTasks.h.
//
// The task structures describe the scheduled task graph of the parallel
// evaluation engine. The serial engine reads the invocation masks and the
// task counts through VdfSchedule; the structures themselves are populated
// only by VdfScheduler::_ScheduleTaskGraph, which is not ported
// (PLATFORM-DIVERGENCE(openexec-parallel), see scheduler.ts).

import type { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'

/**
 * Type describing a task id. An id is comprised of an index, as well as one
 * bit of additional information (scheduleTasks.h:23).
 */
export type VdfScheduleTaskId = number

/** Type describing a task index (scheduleTasks.h:27). */
export type VdfScheduleTaskIndex = number

/** Type describing a number of task indices or ids (scheduleTasks.h:31). */
export type VdfScheduleTaskNum = number

/**
 * A sentinel value used to describe an invalid task index or id
 * (scheduleTasks.h:35: uint32_t(-1)).
 */
export const VdfScheduleTaskInvalid: number = 0xffffffff

/** Returns true if the given task index or id is invalid (scheduleTasks.h:39). */
export function VdfScheduleTaskIsInvalid(task: number): boolean {
  return task === VdfScheduleTaskInvalid
}

/**
 * A structure describing a range of task ids, beginning at taskId and ending
 * at taskId + taskNum (scheduleTasks.h:46).
 */
export interface VdfScheduleNodeTasks {
  taskId: VdfScheduleTaskId
  taskNum: VdfScheduleTaskNum
}

/**
 * A bit field with additional flags to further describe a
 * VdfScheduleComputeTask (scheduleTasks.h:54).
 */
export interface VdfScheduleComputeTaskFlags {
  /** Is this compute task affective? */
  isAffective: boolean
  /** Does this compute task keep any data? */
  hasKeep: boolean
}

/**
 * A VdfScheduleComputeTask represents a unit of computation for the parallel
 * evaluation engine. Every scheduled node has at least one of these tasks
 * (scheduleTasks.h:62).
 */
export interface VdfScheduleComputeTask {
  /**
   * The index into the VdfScheduleNodeInvocation array. This is an invalid
   * index for nodes with only one compute task.
   */
  invocationIndex: VdfScheduleTaskIndex
  /**
   * The corresponding inputs task. This is an invalid task index for nodes
   * with only one compute task, and without prereqs and reads, which could be
   * run in parallel with read/writes.
   */
  inputsTaskIndex: VdfScheduleTaskIndex
  /**
   * The corresponding node preparation task. Every scheduled node has at most
   * one of these. The task is shared amongst all invocations of that node. An
   * invalid index denotes that node preparation need not be synchronized.
   */
  prepTaskIndex: VdfScheduleTaskIndex
  /**
   * Index into the input dependencies array. The first required input
   * dependency, i.e. read/write or read not dependent on prereqs.
   */
  requiredsIndex: VdfScheduleTaskIndex
  /** The number of required input dependencies. */
  requiredsNum: VdfScheduleTaskNum
  /** Additional bit flags. */
  flags: VdfScheduleComputeTaskFlags
}

/**
 * Further describes every invocation of a single node. Note, that nodes with
 * invocations always have exactly one output, and the data in this structure
 * is relevant to that single output (scheduleTasks.h:94).
 */
export interface VdfScheduleNodeInvocation {
  requestMask: VdfMask
  affectsMask: VdfMask
  keepMask: VdfMask
}

/**
 * Structure describing an additional task used to run prereqs and reads
 * concurrently with read/write input dependencies (scheduleTasks.h:103).
 */
export interface VdfScheduleInputsTask {
  inputDepIndex: VdfScheduleTaskIndex
  prereqsNum: VdfScheduleTaskNum
  optionalsNum: VdfScheduleTaskNum
}

/**
 * A sequential index assigned to the unique output and mask combination of a
 * VdfScheduleInputDependency instance (scheduleTasks.h:114).
 */
export type VdfScheduleInputDependencyUniqueIndex = number

/**
 * Describes a single input dependency, i.e. the output and mask to be used to
 * check for a cache hit, as well as the compute task id and number of compute
 * tasks (or a single keep task) to invoke on cache misses
 * (scheduleTasks.h:120).
 */
export interface VdfScheduleInputDependency {
  /** A unique index for the output and mask combination of this dependency. */
  uniqueIndex: VdfScheduleInputDependencyUniqueIndex
  /** The requested output at the source end of the input dependency. */
  readonly output: VdfOutput
  /** The requested mask at the source end of the input dependency. */
  mask: VdfMask
  /**
   * The compute task id of the first task to be invoked to fulfill this input
   * dependency. Note, this can be a compute task id, or a keep task index. If
   * this is a keep task index, computeTaskNum shall be set to 0.
   */
  computeOrKeepTaskId: VdfScheduleTaskId
  /**
   * The number of compute task ids to be invoked to fulfill this input
   * dependency. If this is 0, the input dependency is for a keep task.
   */
  computeTaskNum: VdfScheduleTaskNum
}
