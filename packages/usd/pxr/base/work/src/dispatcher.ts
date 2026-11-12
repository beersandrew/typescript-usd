// Ported from OpenUSD 26.11.1: pxr/base/work/dispatcher.cpp,
//  pxr/base/work/dispatcher.h, pxr/base/work/workTBB/dispatcher_impl.h
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/base/work/dispatcher.{h,cpp} (OpenUSD 26.11.1) and the TBB
// implementation it wraps (pxr/base/work/workTBB/dispatcher_impl.h).
//
// With one thread a dispatcher is a task list that Wait() drains. TBB's
// task_group, which WorkImpl_Dispatcher uses, runs the tasks a thread spawned
// most recent first when that thread waits, so Wait() takes tasks LIFO,
// including tasks that running tasks add. Diagnostics need no transport: tasks
// run on the waiting thread and post directly (dispatcher.cpp:30-46).

export type WorkTask = () => void

export class WorkDispatcher {
  private readonly _tasks: WorkTask[] = []
  private _isCancelled = false
  private _waiting = false

  /** Work_Dispatcher::Run (dispatcher.h:58-85). */
  run(task: WorkTask): void {
    if (this._isCancelled) return
    this._tasks.push(task)
  }

  /**
   * Work_Dispatcher::Wait (dispatcher.cpp:30-46): run every task, including
   * those added while waiting, then reset the cancellation state. A Wait
   * nested inside a running task drains the same list.
   */
  Wait(): void {
    const outer = !this._waiting
    this._waiting = true
    try {
      for (let task = this._tasks.pop(); task; task = this._tasks.pop()) {
        if (!this._isCancelled) task()
      }
    } finally {
      if (outer) {
        this._waiting = false
        this._tasks.length = 0
        this._isCancelled = false
      }
    }
  }

  /** Work_Dispatcher::Cancel (dispatcher.cpp:55-60): pending tasks are dropped. */
  cancel(): void {
    this._isCancelled = true
  }

  /** Work_Dispatcher::IsCancelled (dispatcher.cpp:48-53). */
  isCancelled(): boolean {
    return this._isCancelled
  }
}

/**
 * WorkIsolatingDispatcher (isolatingDispatcher.h): a dispatcher whose waits
 * do not steal unrelated tasks. A JS dispatcher only runs its own tasks.
 */
export class WorkIsolatingDispatcher extends WorkDispatcher {}
