// Ported from OpenUSD 26.11.1: pxr/exec/exec/compilerTaskSyncBase.cpp,
//  pxr/exec/exec/compilerTaskSyncBase.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compilerTaskSyncBase.h and
// compilerTaskSyncBase.cpp.
//
// Single-threaded: the atomic state byte and the lock-free waiting queue head
// are plain fields, a compare-and-swap is a compare and an assignment, and
// _AtomicBackoff (compilerTaskSyncBase.cpp:25-55) has nothing to back off from
// because a CAS cannot fail. The waiting queue keeps upstream's shape: a
// singly linked list pushed at the head and closed with a sentinel.

import { TF_VERIFY } from 'typescript-usd/tf'
import type { WorkDispatcher } from 'typescript-usd/work'

import type { Exec_CompilationTask } from './compilationTask.ts'

// The various states a task can be in (compilerTaskSyncBase.h:132-137).
const enum _TaskState {
  Unclaimed,
  Claimed,
  Done,
}

// compilerTaskSyncBase.cpp:57-66
interface _WaitlistNode {
  // The waiting task.
  task: Exec_CompilationTask
  // The next node in the queue.
  next: _WaitlistNode | null
}

// A sentinel used to plug a waiting queue. The presence of this tag signals
// that the list is closed, and that all the waiting tasks have been notified
// (compilerTaskSyncBase.cpp:19-21).
const _NotifiedTag: unique symbol = Symbol('Exec_CompilerTaskSyncBase::_NotifiedTag')

type _WaitlistHead = _WaitlistNode | typeof _NotifiedTag | null

/**
 * A base class that implements all non-template functionality common to each
 * template instantiation of Exec_CompilerTaskSync
 * (compilerTaskSyncBase.h:22-151).
 */
export abstract class Exec_CompilerTaskSyncBase {
  // Work dispatcher for running tasks that have all their dependencies
  // fulfilled.
  private readonly _dispatcher: WorkDispatcher

  /** compilerTaskSyncBase.cpp:68-70 */
  protected constructor(dispatcher: WorkDispatcher) {
    this._dispatcher = dispatcher
  }

  /**
   * Attempts to claim the `waitlist`, and returns whether the attempt was
   * successful (compilerTaskSyncBase.cpp:74-100).
   */
  protected _claim(
    waitlist: Exec_CompilerTaskSyncBase._Waitlist,
    task: Exec_CompilationTask,
  ): Exec_CompilerTaskSyncBase.ClaimResult {
    // If the task associated with this waitlist is already done, return here.
    const state = waitlist.state
    if (state === _TaskState.Done) {
      return Exec_CompilerTaskSyncBase.ClaimResult.Done
    }

    // If the task has not been claimed yet, claim it and return the result.
    // Note if the caller claims this key, then the provided task is *not*
    // added to the waitlist.
    if (state === _TaskState.Unclaimed) {
      waitlist.state = _TaskState.Claimed
      return Exec_CompilerTaskSyncBase.ClaimResult.Claimed
    }

    // If we get here, the task has already been claimed. In this case, wait
    // on the task completion. If we fail to wait on the task, it completed
    // just as we were about to wait and we can consider it done!
    return this._waitOnHead(waitlist, task)
      ? Exec_CompilerTaskSyncBase.ClaimResult.Wait
      : Exec_CompilerTaskSyncBase.ClaimResult.Done
  }

  /**
   * Establishes that `task` depends on the task associated with `waitlist`
   * (compilerTaskSyncBase.cpp:102-118).
   */
  protected _waitOn(
    waitlist: Exec_CompilerTaskSyncBase._Waitlist,
    task: Exec_CompilationTask,
  ): Exec_CompilerTaskSyncBase.WaitResult {
    // If the task associated with this waitlist is already done, return here.
    if (waitlist.state === _TaskState.Done) {
      return Exec_CompilerTaskSyncBase.WaitResult.Done
    }

    // Add task to the waitlist, or return Done if the waitlist has been
    // closed.
    return this._waitOnHead(waitlist, task)
      ? Exec_CompilerTaskSyncBase.WaitResult.Wait
      : Exec_CompilerTaskSyncBase.WaitResult.Done
  }

  /**
   * Marks the task associated with `waitlist` as done
   * (compilerTaskSyncBase.cpp:120-134). Returns true if this call marked the
   * waitlist done; false if the waitlist was already marked done.
   */
  protected _markDone(waitlist: Exec_CompilerTaskSyncBase._Waitlist): boolean {
    // Set the state to done.
    const previousState = waitlist.state
    waitlist.state = _TaskState.Done
    if (previousState === _TaskState.Done) {
      return false
    }

    // Close the waiting queue and notify all waiting tasks. We expect to be
    // the first to close the queue.
    const closed = this._closeAndNotify(waitlist)
    TF_VERIFY(closed, 'closed')
    return true
  }

  // The private overload _WaitOn(std::atomic<_WaitlistNode*> *headPtr, task)
  // (compilerTaskSyncBase.cpp:136-181). Registers `task` as waiting on the
  // list. Returns false if the list is already closed and the task does not
  // need to wait.
  private _waitOnHead(
    waitlist: Exec_CompilerTaskSyncBase._Waitlist,
    task: Exec_CompilationTask,
  ): boolean {
    // Get the head of the waiting queue.
    const headNode = waitlist.waiting

    // If the dependent is done, we can return immediately.
    if (headNode === _NotifiedTag) {
      return false
    }

    // Increment the dependency count of the task to indicate that it has one
    // more unfulfilled dependency.
    task.addDependency()

    // Allocate a new node and set it as the head of the queue. The CAS loop
    // of upstream cannot fail without other threads.
    waitlist.waiting = this._allocateNode(task, headNode)

    // Task is now successfully waiting.
    return true
  }

  // Closes the list, and notifies any tasks that are waiting on it. Returns
  // false if the list had already been closed (compilerTaskSyncBase.cpp:
  // 183-210).
  private _closeAndNotify(waitlist: Exec_CompilerTaskSyncBase._Waitlist): boolean {
    // Get the head of the waiting queue and replace it with the notified tag
    // to indicate that this queue is now closed.
    let headNode = waitlist.waiting
    waitlist.waiting = _NotifiedTag

    // If the queue was already closed, return false.
    if (headNode === _NotifiedTag) {
      return false
    }

    // Iterate over all the entries in the queue to notify the waiting tasks.
    while (headNode) {
      // Spawn the waiting task if its dependency count reaches 0. If the
      // dependency count is greater than 0, the task still has unfulfilled
      // dependencies and will be spawned later when the last dependency has
      // been fulfilled.
      const task = headNode.task
      if (task.removeDependency() === 0) {
        this._dispatcher.run(() => task.call())
      }

      // Move on to the next node in the waitlist.
      headNode = headNode.next
    }

    return true
  }

  // Allocate a new node for a waiting queue (compilerTaskSyncBase.cpp:
  // 212-218). The scratch allocator vector is not needed with GC.
  private _allocateNode(
    task: Exec_CompilationTask,
    next: _WaitlistNode | null,
  ): _WaitlistNode {
    return { task, next }
  }
}

export namespace Exec_CompilerTaskSyncBase {
  /** The different results for claiming a key (compilerTaskSyncBase.h:28-40). */
  export enum ClaimResult {
    /** The task is already done. */
    Done,
    /**
     * Another task is currently processing the key and the claimant will be
     * notified once it is done.
     */
    Wait,
    /**
     * The key has been successfully claimed, and the claimant is on the hook
     * for completing the work.
     */
    Claimed,
  }

  /** The different results for waiting on a key (compilerTaskSyncBase.h:42-49). */
  export enum WaitResult {
    /** The task is already done. */
    Done,
    /** The task is not yet marked done. */
    Wait,
  }

  /**
   * Entries in the map always begin life as unclaimed tasks with no nodes on
   * their waitlist (compilerTaskSyncBase.h:65-76).
   */
  export class _Waitlist {
    /** @internal */
    state: number = _TaskState.Unclaimed
    /** @internal */
    waiting: _WaitlistHead = null
  }
}
