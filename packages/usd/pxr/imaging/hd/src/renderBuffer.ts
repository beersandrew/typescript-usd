// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderBuffer.cpp,
//  pxr/imaging/hd/renderBuffer.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderBuffer.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: dimensions are the [x, y, z] triple HdRenderBufferDescriptor
// carries here (aov.ts) rather than a GfVec3i. Map() returns the mapped
// bytes or null.

import type { Value as VtValue } from 'typescript-usd/vt'
import { HdBprim } from './bprim.ts'
import type { HdDirtyBits } from './changeTracker.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import type { HdFormat } from './types.ts'

/** renderBuffer.h:29-161. A block of memory to be rendered into. */
export abstract class HdRenderBuffer extends HdBprim {
  /** renderBuffer.h:35-39 */
  static readonly Clean = 0
  static readonly DirtyDescription = 1 << 0
  static readonly AllDirty = HdRenderBuffer.DirtyDescription

  /** renderBuffer.cpp:12-15 */
  constructor(id: string) {
    super(id)
  }

  /** renderBuffer.cpp:19-24 */
  getInitialDirtyBitsMask(): HdDirtyBits {
    return HdRenderBuffer.AllDirty
  }

  /** renderBuffer.cpp:26-46 */
  sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    _renderParam: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    const sceneDelegate = sceneDelegateOrPrim as HdSceneDelegate
    if (!dirtyBits) return
    if (dirtyBits.value & HdRenderBuffer.DirtyDescription) {
      const desc = sceneDelegate.getRenderBufferDescriptor(this.getId())
      if (!(desc.dimensions[0] >= 0 &&
        desc.dimensions[1] >= 0 &&
        desc.dimensions[2] >= 0)) {
        TF_CODING_ERROR(`Bad dimensions for render buffer ${this.getId()}`)
        return
      }
      this.allocate(desc.dimensions, desc.format, desc.multiSampled)
    }
    dirtyBits.value &= ~HdRenderBuffer.AllDirty
  }

  /** renderBuffer.cpp:48-53 */
  finalize(_renderParam?: HdRenderParam | null): void {
    this._deallocate()
  }

  /** renderBuffer.h:72-74 */
  abstract allocate(dimensions: readonly [number, number, number], format: HdFormat,
    multiSampled: boolean): boolean

  /** renderBuffer.h:78-90 */
  abstract getWidth(): number
  abstract getHeight(): number
  abstract getDepth(): number
  abstract GetFormat(): HdFormat
  abstract isMultiSampled(): boolean

  /** renderBuffer.h:104-117 */
  abstract Map(): ArrayBufferView | null
  abstract unmap(): void
  abstract isMapped(): boolean

  /** renderBuffer.h:122-130 */
  abstract resolve(): void
  abstract isConverged(): boolean

  /** renderBuffer.h:139-142. The empty VtValue is `undefined`. */
  getResource(_multiSampled: boolean): VtValue | unknown {
    return undefined
  }

  /** renderBuffer.h:152 */
  protected abstract _deallocate(): void
}
