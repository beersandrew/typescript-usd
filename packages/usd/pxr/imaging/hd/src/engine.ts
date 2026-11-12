// Ported from OpenUSD 26.11.1: pxr/imaging/hd/engine.cpp,
//  pxr/imaging/hd/engine.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/engine.{h,cpp}.

import type { HdRenderIndex } from './renderIndex.ts'
import type { HdTask, HdTaskContext } from './task.ts'

export class HdEngine {
  private _taskContext: HdTaskContext = new Map()

  setTaskContextData(id: string, data: unknown): void { this._taskContext.set(id, data) }
  getTaskContextData(id: string): unknown { return this._taskContext.get(id) }
  removeTaskContextData(id: string): void { this._taskContext.delete(id) }
  clearTaskContextData(): void { this._taskContext.clear() }

  Execute(index: HdRenderIndex, tasksOrPaths: HdTask[] | string[]): void {
    const tasks = tasksOrPaths.map(task =>
      typeof task === 'string' ? index.getTask(task) : task)
      .filter((task): task is HdTask => task !== undefined)
    this._taskContext.set('drivers', index.getDrivers())
    // engine.cpp:97: data discovery (bprims, sprims, tasks, rprims).
    index.SyncAll(tasks, this._taskContext)
    for (const task of tasks) task.Prepare(this._taskContext, index)
    index.CommitResources()
    for (const task of tasks) task.Execute(this._taskContext)
  }

  areTasksConverged(index: HdRenderIndex, taskPaths: string[]): boolean {
    return taskPaths.every(path => index.getTask(path)?.isConverged() ?? true)
  }
}
