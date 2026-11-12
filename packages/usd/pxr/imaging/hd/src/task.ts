// Ported from OpenUSD 26.11.1: pxr/imaging/hd/task.cpp, pxr/imaging/hd/task.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/task.{h,cpp}.

import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import type { HdRenderIndex } from './renderIndex.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { Value as VtValue } from 'typescript-usd/vt'

export type HdTaskContext = Map<string, unknown>

export abstract class HdTask {
  constructor(private readonly _id: string) {}

  getId(): string { return this._id }
  isConverged(): boolean { return true }
  getRenderTags(): readonly string[] { return [] }
  getInitialDirtyBitsMask(): HdDirtyBits {
    return HdChangeTracker.DirtyParams |
      HdChangeTracker.DirtyCollection |
      HdChangeTracker.DirtyRenderTags
  }

  abstract sync(delegate: unknown, context: HdTaskContext, dirtyBits: HdDirtyBits): void
  abstract Prepare(context: HdTaskContext, renderIndex: HdRenderIndex): void
  abstract Execute(context: HdTaskContext): void

  protected static _hasTaskContextData(context: HdTaskContext, id: string): boolean {
    return context.has(id)
  }

  protected static _getTaskContextData<T>(
    context: HdTaskContext,
    id: string,
  ): T | undefined {
    return context.get(id) as T | undefined
  }

  /** task.h:243-262 _GetTaskParams<T>: the params held by the delegate, or
   *  undefined (with a coding error) when they are not a `ctor`. */
  protected _getTaskParams<T>(delegate: HdSceneDelegate,
    ctor: abstract new (...args: never[]) => T): T | undefined {
    const taskId = this.getId()
    const valueVt = delegate.Get(taskId, HdTokens.params)
    const held = valueVt instanceof VtValue && !valueVt.IsEmpty()
      ? valueVt.UncheckedGet<unknown>() : undefined
    if (!(held instanceof ctor)) {
      TF_CODING_ERROR(`Task params for ${taskId} is of unexpected type`)
      return undefined
    }
    return held
  }

  /** task.cpp:60-63 */
  protected _getTaskRenderTags(delegate: HdSceneDelegate): string[] {
    return delegate.getTaskRenderTags(this.getId())
  }

  /** task.h:264-290 _GetDriver<T>: the driver named `driverName` in the
   *  task context's HdDriverVector, or null. */
  protected static _getDriver<T>(context: HdTaskContext, driverName: string): T | null {
    const drivers = context.get(HdTokens.drivers)
    if (Array.isArray(drivers)) {
      for (const hdDriver of drivers as { name: string, driver: unknown }[]) {
        if (hdDriver?.name === driverName) {
          const driver = hdDriver.driver instanceof VtValue
            ? hdDriver.driver.UncheckedGet<unknown>() : hdDriver.driver
          return (driver ?? null) as T | null
        }
      }
    }
    return null
  }
}
