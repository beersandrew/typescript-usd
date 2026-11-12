// Ported from OpenUSD 26.11.1: pxr/imaging/hd/resourceRegistry.cpp,
//  pxr/imaging/hd/resourceRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/resourceRegistry.{h,cpp} (OpenUSD 26.11.1).
//
// The base is a template-method shell: Commit()/GarbageCollect() are the
// public entry points the render index drives, and they delegate to the
// subclass hooks _Commit/_GarbageCollect.

import { HdPerfLog } from './perfLog.ts'
import { HdPerfTokens } from './tokens.ts'
import { Dictionary as VtDictionary } from 'typescript-usd/vt'

/** resourceRegistry.h:33-94 */
export abstract class HdResourceRegistry {
  /** resourceRegistry.cpp:33-41 */
  commit(): void { this._commit() }

  /** resourceRegistry.cpp:21-31 */
  garbageCollect(): void {
    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.garbageCollected)
    this._garbageCollect()
  }

  /** resourceRegistry.cpp:43-47 */
  invalidateShaderRegistry(): void {
    // Derived classes that hold shaders will override this,
    // but the base registry has nothing to do.
  }

  /** resourceRegistry.cpp:49-54 */
  reloadResource(_resourceType: string, _path: string): void {}

  /** resourceRegistry.cpp:56-60 */
  getResourceAllocation(): VtDictionary {
    return new VtDictionary()
  }

  /** resourceRegistry.cpp:62-66 */
  getDetailedResourceAllocation(): VtDictionary {
    return this.getResourceAllocation()
  }

  /** resourceRegistry.cpp:68-71 */
  protected _commit(): void {}

  /** resourceRegistry.cpp:73-76 */
  protected _garbageCollect(): void {}
}
