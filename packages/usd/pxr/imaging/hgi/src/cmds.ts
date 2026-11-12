// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/cmds.cpp,
//  pxr/imaging/hgi/cmds.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/cmds.{h,cpp} (OpenUSD 26.11.1).

import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import type { HgiSubmitWaitType } from './enums.ts'
import type { Hgi } from './hgi.ts'

/** cmds.h:28-67. Graphics commands are recorded in 'cmds' objects which are
 *  later submitted to hgi. */
export abstract class HgiCmds {
  private _submitted = false

  /** cmds.cpp:11-13 */
  protected constructor() {}

  /** cmds.cpp:17-21: returns true if the HgiCmds object has been submitted
   *  to GPU. */
  isSubmitted(): boolean {
    return this._submitted
  }

  /** cmds.cpp:23-27. Submit can be called inside of Hgi::SubmitCmds to
   *  commit the command buffer to the GPU. Returns true if work was
   *  committed. The default implementation returns false.
   *
   *  WebGPU adaptation: a backend commits its work synchronously here (so
   *  submission order is call order) and may return a promise that settles
   *  once HgiSubmitWaitTypeWaitUntilCompleted work and its GPU-to-CPU copies
   *  are done, because a browser cannot block the calling thread. */
  _submit(_hgi: Hgi, _wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    return false
  }

  /** cmds.cpp:29-33: flags the HgiCmds object as 'submitted' to GPU. */
  _setSubmitted(): void {
    this._submitted = true
  }

  /** cmds.h:54-61 */
  static readonly s_computeDebugColor = new GfVec4f(0.855, 0.161, 0.11, 1.0)
  static readonly s_graphicsDebugColor = new GfVec4f(0, 0.639, 0.878, 1.0)
  static readonly s_blitDebugColor = new GfVec4f(0.99607843137, 0.87450980392, 0.0, 1.0)
  static readonly s_markerDebugColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
}

/** cmds.h:20 */
export type HgiCmdsUniquePtr = HgiCmds
