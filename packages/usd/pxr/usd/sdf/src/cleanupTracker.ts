// Ported from OpenUSD 26.11.1: pxr/usd/sdf/cleanupTracker.cpp,
//  pxr/usd/sdf/cleanupTracker.h, pxr/usd/sdf/cleanupEnabler.cpp,
//  pxr/usd/sdf/cleanupEnabler.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/cleanupTracker.{h,cpp} and cleanupEnabler.{h,cpp}:
// while an SdfCleanupEnabler is open, specs that edits may have left inert
// are collected, and removed if inert when the last enabler closes.

import type { SdfSpec } from './spec.ts'

export class Sdf_CleanupTracker {
  private static readonly _instance = new Sdf_CleanupTracker()
  private _specs: SdfSpec[] = []

  static getInstance(): Sdf_CleanupTracker { return this._instance }

  addSpecIfTracking(spec: SdfSpec): void {
    if (!SdfCleanupEnabler.isCleanupEnabled()) return
    // Avoid the common duplicate of adding the same spec repeatedly.
    const last = this._specs[this._specs.length - 1]
    if (!last || last.isDormant() || !last.equals(spec)) this._specs.push(spec)
  }

  cleanupSpecs(): void {
    // Pop specs one at a time: scheduling a removal may add more.
    while (this._specs.length > 0) {
      const spec = this._specs.pop()!
      if (!spec.isDormant()) spec.getLayer().scheduleRemoveIfInert(spec)
    }
  }
}

// SdfCleanupEnabler: TypeScript has no destructors, so enablers are closed
// explicitly, or opened with sdfCleanupEnabler().
export class SdfCleanupEnabler {
  private static _stackSize = 0
  private _closed = false

  constructor() {
    SdfCleanupEnabler._stackSize++
  }

  close(): void {
    if (this._closed) return
    this._closed = true
    // The last enabler being removed cleans up the collected specs.
    if (SdfCleanupEnabler._stackSize === 1) Sdf_CleanupTracker.getInstance().cleanupSpecs()
    SdfCleanupEnabler._stackSize--
  }

  static isCleanupEnabled(): boolean { return SdfCleanupEnabler._stackSize > 0 }
}

/** Runs fn with an SdfCleanupEnabler open. */
export function sdfCleanupEnabler<T>(fn: () => T): T {
  const enabler = new SdfCleanupEnabler()
  try {
    return fn()
  } finally {
    enabler.close()
  }
}
