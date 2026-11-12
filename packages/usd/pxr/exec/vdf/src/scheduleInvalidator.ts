// Ported from OpenUSD 26.11.1: pxr/exec/vdf/scheduleInvalidator.cpp,
//  pxr/exec/vdf/scheduleInvalidator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/scheduleInvalidator.h and
// scheduleInvalidator.cpp.
//
// Single-threaded: the tbb concurrent map and vector become a Map and an
// array, the atomics plain fields, and the spin mutexes are dropped. The
// tombstoning of unregistered entries is kept, since it is observable through
// the entry count in the debug output.

import { Debug as TfDebug, TF_VERIFY } from 'typescript-usd/tf'
// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfDebugCodes } from './debugCodes.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { VDF_FOR_EACH_SCHEDULED_OUTPUT_ID, type VdfSchedule } from './schedule.ts'
import { VdfScheduler } from './scheduler.ts'

// scheduleInvalidator.cpp:22-26
function _IsNodeInSet(set: TfBits, node: VdfNode): boolean {
  const index = VdfNode.getIndexFromId(node.getId())
  return index < set.getSize() && set.isSet(index)
}

// Represents a schedule entry in the map (scheduleInvalidator.h:102-121).
interface _ScheduleEntry {
  // Indicates whether the entry is alive in the map. If this is false, the
  // schedule must not be used.
  alive: boolean

  // A copy of the bitset that indicates which nodes in the network are
  // included in the schedule.
  scheduledNodes: TfBits
}

/**
 * Collects schedules and invalidates them when relevant changes to the
 * topology of the VdfNetwork are made (scheduleInvalidator.h:38).
 *
 * Schedules must first be registered with this invalidator before they
 * receive invalidation. The VdfNetwork is on the hook for calling the
 * notification methods on this class when relevant network edits are made.
 */
export class Vdf_ScheduleInvalidator {
  // Holds a prefilter that lets us know if we have any schedule that could be
  // affected by the node at the corresponding index.
  private _nodeFilter: number[] = []

  // The map of all existing schedules that reference this network.
  private readonly _schedules = new Map<VdfSchedule, _ScheduleEntry>()

  /**
   * All the registered schedules are invalidated when the manager is
   * destructed (scheduleInvalidator.cpp:28-31). The owning network calls this
   * where upstream runs the destructor.
   * @internal
   */
  _destruct(): void {
    this.invalidateAll()
  }

  /**
   * Invalidates (i.e., calls Clear() on) all registered schedules
   * (scheduleInvalidator.cpp:33-55).
   */
  invalidateAll(): void {
    // Early bail out if the schedules are already clear.
    if (this._schedules.size === 0) {
      return
    }

    TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
      `[Vdf] Clearing all ${this._schedules.size} schedules.\n`)

    this._nodeFilter = []

    for (const [schedule, entry] of this._schedules) {
      if (entry.alive) {
        // Clear calls Unregister()
        schedule.clear()
      }
    }
    this._schedules.clear()
  }

  /**
   * Invalidates (i.e., calls Clear() on) all the registered schedules that
   * contain `node` (scheduleInvalidator.cpp:57-91).
   */
  invalidateContainingNode(node: VdfNode): void {
    // Early bail out if the schedules are already clear.
    if (this._schedules.size === 0) {
      return
    }

    // Filter out nodes that can't affect any schedules.
    if (!this._isNodeInAnySchedule(node)) {
      return
    }

    let numCleared = 0
    for (const [schedule, entry] of this._schedules) {
      if (!entry.alive || !_IsNodeInSet(entry.scheduledNodes, node)) {
        continue
      }

      if (entry.alive) {
        // Clear calls Unregister(), which sets `alive = false`
        schedule.clear()
        ++numCleared
      }
    }

    if (numCleared && TfDebug.isEnabled(VdfDebugCodes.VDF_SCHEDULING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
        `[Vdf] InvalidateContainingNode: ${node.getDebugName()}\n` +
        `[Vdf] ... cleared ${numCleared} schedules, have ${this._schedules.size} entries.\n`)
    }
  }

  /**
   * Updates schedules that contain `output` for an affects mask change. Will
   * invalidate and clear schedules, if this can't be done
   * (scheduleInvalidator.cpp:93-133).
   */
  updateForAffectsMaskChange(output: VdfOutput): void {
    // Early bail out if the schedules are already clear.
    if (this._schedules.size === 0) {
      return
    }

    // Filter out nodes that can't affect any schedules.
    const node = output.getNode()
    if (!this._isNodeInAnySchedule(node)) {
      return
    }

    let numCleared = 0
    for (const [schedule, entry] of this._schedules) {
      if (!entry.alive || !_IsNodeInSet(entry.scheduledNodes, node)) {
        continue
      }

      if (!entry.alive) {
        continue
      }

      if (!VdfScheduler.updateAffectsMaskForOutput(schedule, output)) {
        // Clear calls Unregister(), which set `alive = false`
        schedule.clear()
        ++numCleared
      }
    }

    if (numCleared && TfDebug.isEnabled(VdfDebugCodes.VDF_SCHEDULING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
        `[Vdf] UpdateSchedulesForAffectsMaskChange: ${output.getDebugName()}\n` +
        `[Vdf] ... cleared ${numCleared} schedules, have ${this._schedules.size} entries.\n`)
    }
  }

  /**
   * Updates schedules that contain `connection` for an added or removed
   * connection. Will invalidate and clear schedules, if this can't be done
   * (scheduleInvalidator.cpp:135-189).
   */
  updateForConnectionChange(connection: VdfConnection): void {
    // Early bail out if the schedules are already clear.
    if (this._schedules.size === 0) {
      return
    }

    const targetNode = connection.getTargetNode()
    if (!this._isNodeInAnySchedule(targetNode)) {
      return
    }

    let numCleared = 0
    for (const [schedule, entry] of this._schedules) {
      if (!entry.alive ||
        !_IsNodeInSet(entry.scheduledNodes, targetNode)) {
        continue
      }

      if (!entry.alive) {
        continue
      }

      for (const oid of VDF_FOR_EACH_SCHEDULED_OUTPUT_ID(schedule, targetNode)) {
        if (!TF_VERIFY(oid.isValid(), 'oid.IsValid()')) {
          continue
        }

        const output = schedule.GetOutput(oid)
        const requestMask = schedule.getRequestMask(oid)
        const dependencyMask = targetNode.computeInputDependencyMask(
          new VdfMaskedOutput(output, requestMask), connection)

        if (!dependencyMask.areAllUnset()) {
          // Clear calls Unregister(), which set `alive = false`
          schedule.clear()
          ++numCleared
          break
        }
      }
    }

    if (numCleared && TfDebug.isEnabled(VdfDebugCodes.VDF_SCHEDULING)) {
      TfDebug.msg(VdfDebugCodes.VDF_SCHEDULING,
        `[Vdf] UpdateSchedulesForConnectionChange: ${connection.getDebugName()}\n` +
        `[Vdf] ... cleared ${numCleared} schedules, have ${this._schedules.size} entries.\n`)
    }
  }

  /**
   * Adds a schedule to the invalidator, making sure it will receive proper
   * invalidation going forward (scheduleInvalidator.cpp:191-205).
   */
  Register(schedule: VdfSchedule): void {
    let entry = this._schedules.get(schedule)
    if (!entry) {
      entry = { alive: false, scheduledNodes: new TfBits() }
      this._schedules.set(schedule, entry)
    }

    // `if (!alive.exchange(true))`
    const wasAlive = entry.alive
    entry.alive = true
    if (!wasAlive) {
      entry.scheduledNodes = new TfBits(schedule.getScheduledNodeBits())
      this._mergeScheduleIntoNodeFilter(schedule)
    }
  }

  /**
   * Removes the schedule from the invalidator. When this call returns, the
   * provided schedule will not longer receive invalidation
   * (scheduleInvalidator.cpp:207-232).
   */
  unregister(schedule: VdfSchedule): void {
    const entry = this._schedules.get(schedule)
    if (entry === undefined) {
      return
    }

    // Concurrently removing entries from the schedule map is not supported
    // upstream, so the entry is tombstoned instead. If we are the first ones
    // to set `alive = false`, we will also remove the scheduled nodes from the
    // reference counted array.
    const wasAlive = entry.alive
    entry.alive = false
    if (wasAlive) {
      this._removeScheduleFromNodeFilter(schedule)
    }
  }

  /**
   * If needed, grows the _nodeFilter array to accommodate at least newSize
   * entries (scheduleInvalidator.cpp:234-294). New entries are zero.
   */
  private _growNodeFilter(newSize: number): void {
    while (this._nodeFilter.length < newSize) {
      this._nodeFilter.push(0)
    }
  }

  /** Union schedule's nodes into the node filter (scheduleInvalidator.cpp:296-308). */
  private _mergeScheduleIntoNodeFilter(schedule: VdfSchedule): void {
    this._growNodeFilter(schedule.getNetwork()!.getNodeCapacity())

    const scheduledNodeSet = schedule.getScheduledNodeBits()
    for (const i of scheduledNodeSet.getAllSetView()) {
      this._nodeFilter[i] = this._nodeFilter[i]! + 1
    }
  }

  /** Remove schedule's nodes from the node filter (scheduleInvalidator.cpp:310-331). */
  private _removeScheduleFromNodeFilter(schedule: VdfSchedule): void {
    // Exit early when there are no nodes in the filter or if no schedules have
    // actually been removed. This can happen, for example, when
    // Vdf_ScheduleInvalidator::InvalidateAll is called. In that case, both
    // _schedules and _nodeFilter are empty, so there's no need to iterate over
    // the schedule's node set.
    if (this._nodeFilter.length === 0) {
      return
    }

    const scheduledNodeSet = schedule.getScheduledNodeBits()
    for (const i of scheduledNodeSet.getAllSetView()) {
      this._nodeFilter[i] = this._nodeFilter[i]! - 1
    }
  }

  /**
   * Returns true if node is contained in at least one schedule, according to
   * _nodeFilter (scheduleInvalidator.cpp:333-338).
   */
  private _isNodeInAnySchedule(node: VdfNode): boolean {
    const index = VdfNode.getIndexFromId(node.getId())
    return index < this._nodeFilter.length && this._nodeFilter[index] !== 0
  }
}
