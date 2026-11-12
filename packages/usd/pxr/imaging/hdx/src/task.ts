// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/task.cpp,
//  pxr/imaging/hdx/task.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/task.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HdTask::Sync takes the dirty bits by value (hd/src/task.ts; the render
//   index clears them after Sync). HdxTask::Sync is not `final` in
//   TypeScript; derived classes override _Sync only.
// - std::swap of the two task context VtValues (task.cpp:93-101) swaps the
//   two map entries; a missing entry is the empty VtValue (undefined).

import {
  AovTokens as HdAovTokens,
  Task as HdTask,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { HdxAovTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** task.h:18-82. Base class for (some) tasks in Hdx that provides common
 *  progressive rendering and Hgi functionality.
 *
 *  Tasks that require neither progressive rendering nor Hgi can continue to
 *  derive directly from HdTask. */
export abstract class HdxTask extends HdTask {
  private _hgi: Hgi | null = null

  /** task.cpp:16-20 */
  constructor(id: string) {
    super(id)
  }

  /** task.cpp:24-43. Are all tasks at taskPaths in the render index
   *  converged? */
  static areTasksConverged(renderIndex: HdRenderIndex, taskPaths: readonly string[]): boolean {
    // This needs to reach into the render index to work.
    for (const taskPath of taskPaths) {
      const progressiveTask = renderIndex.getTask(taskPath)
      if (progressiveTask instanceof HdxTask) {
        if (!progressiveTask.isConverged()) {
          return false
        }
      }
    }
    return true
  }

  /** task.cpp:45-62. Derived classes override _Sync, which this calls after
   *  finding Hgi. */
  sync(delegate: unknown, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    // Hgi is pushed is provided by the application and pushed into the
    // task context by hydra.
    // We only have to find the Hgi driver once as it should not change.
    // All gpu resources (in tasks and Storm) are created with a specific
    // Hgi device so we (correctly) assume Hgi* will not change during a
    // Hydra session. Not all tasks need Hgi, so we do not consider it an
    // error here to not find Hgi.
    if (!this._hgi) {
      this._hgi = HdTask._getDriver<Hgi>(ctx, HgiTokens.renderDriver)
    }

    // Proceeed with the Sync Phase
    this._sync(delegate as HdSceneDelegate, ctx, dirtyBits)
  }

  /** task.h:44-50. This is called during the hydra Sync Phase via
   *  HdxTask::Sync. */
  protected abstract _sync(delegate: HdSceneDelegate, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void

  /** task.cpp:64-75. Swaps the color target and colorIntermediate target.
   *  This is used when a task wishes to read from the color and also write
   *  to it. We use two color targets and ping-pong between them. */
  protected _toggleRenderTarget(ctx: HdTaskContext): void {
    if (!HdTask._hasTaskContextData(ctx, HdAovTokens.color)) {
      return
    }

    if (HdTask._hasTaskContextData(ctx, HdxAovTokens.colorIntermediate)) {
      this._swapTextures(ctx, HdAovTokens.color, HdxAovTokens.colorIntermediate)
    }
  }

  /** task.cpp:77-88. Swaps the depth target and depthIntermediate target. */
  protected _toggleDepthTarget(ctx: HdTaskContext): void {
    if (!HdTask._hasTaskContextData(ctx, HdAovTokens.depth)) {
      return
    }

    if (HdTask._hasTaskContextData(ctx, HdxAovTokens.depthIntermediate)) {
      this._swapTextures(ctx, HdAovTokens.depth, HdxAovTokens.depthIntermediate)
    }
  }

  /** task.cpp:90-99. Helper function to facilitate texture ping-ponging. */
  protected _swapTextures(ctx: HdTaskContext, textureToken: string,
    textureIntermediateToken: string): void {
    const texture = ctx.get(textureToken)
    const textureIntermediate = ctx.get(textureIntermediateToken)
    ctx.set(textureToken, textureIntermediate)
    ctx.set(textureIntermediateToken, texture)
  }

  /** task.cpp:101-108. Return the Hydra Graphics Interface. */
  protected _getHgi(): Hgi {
    if (!this._hgi) {
      TF_CODING_ERROR('Hgi driver missing. See HdxTask::Sync.')
    }
    return this._hgi!
  }
}
