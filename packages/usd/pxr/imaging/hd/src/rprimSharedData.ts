// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rprimSharedData.cpp,
//  pxr/imaging/hd/rprimSharedData.h, pxr/imaging/hd/bufferArrayRange.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/rprimSharedData.h and the HdBufferArrayRangeContainer
// from pxr/imaging/hd/bufferArrayRange.h.
//
// HdRprimSharedData is an assortment of data shared across HdReprs, owned by the
// HdRprim. HdDrawItem holds a const pointer to it. The barContainer maps the
// HdDrawingCoord slots to the actual buffer-array ranges.

import type { HdBufferArrayRange } from './bufferArray.ts'
import { BBox3d as GfBBox3d } from 'typescript-usd/gf'
import type { Token as TfToken } from 'typescript-usd/tf'
import { HdPerfLog } from './perfLog.ts'
import { HdPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

// HdBufferArrayRangeContainer: a vector of (optionally null) ranges indexed by
// the drawing-coord slots. Set() grows the container as needed, mirroring the
// C++ container that resizes on assignment. Each slot is a counted holder of
// its range (PLATFORM-DIVERGENCE(hd-bar-shared-ptr), bufferArrayRange.ts):
// assignment retains the new range and releases the old one, as the
// std::vector<HdBufferArrayRangeSharedPtr> element's copy assignment does;
// destroy() is the destructor.
export class HdBufferArrayRangeContainer {
  private _ranges: (HdBufferArrayRange | null)[]

  constructor(size: number) {
    this._ranges = new Array(Math.max(0, size)).fill(null)
  }

  // Set the range at the given index, resizing the container if necessary.
  // Mirrors HdBufferArrayRangeContainer::Set.
  Set(index: number, range: HdBufferArrayRange | null): void {
    if (index < 0) {
      // Unassigned slot (e.g. HdDrawingCoord::Unassigned); ignore.
      return
    }
    if (index >= this._ranges.length) {
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.bufferArrayRangeContainerResized)
      const grown: (HdBufferArrayRange | null)[] =
        new Array(index + 1).fill(null)
      for (let i = 0; i < this._ranges.length; i++) grown[i] = this._ranges[i]!
      this._ranges = grown
    }
    const old = this._ranges[index] ?? null
    if (old === range) return
    range?._retain()
    this._ranges[index] = range
    old?.release()
  }

  /** bufferArrayRange.cpp:55-70 HdBufferArrayRangeContainer::Resize. */
  resize(size: number): void {
    if (size < 0) {
      TF_CODING_ERROR('Size negative in ' +
        'HdBufferArrayRangeContainer::Resize()')
      return
    }

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.bufferArrayRangeContainerResized)
    for (let i = size; i < this._ranges.length; i++) this._ranges[i]?.release()
    this._ranges.length = size
    for (let i = 0; i < size; i++) this._ranges[i] ??= null
  }

  // Get the range at the given index, or null if unassigned/out of range.
  // Mirrors HdBufferArrayRangeContainer::Get.
  Get(index: number): HdBufferArrayRange | null {
    if (index < 0 || index >= this._ranges.length) return null
    return this._ranges[index] ?? null
  }

  /** The destructor (~std::vector): releases every range. */
  destroy(): void {
    const ranges = this._ranges
    this._ranges = []
    for (const range of ranges) range?.release()
  }
}

// rprimSharedData.h:43: `GfBBox3d bounds`. HdRprimBounds is kept as the
// exported name earlier code used; it is a GfBBox3d.
export class HdRprimBounds extends GfBBox3d {}

/** rprimSharedData.h:22-23: (fvar topology, primvar names) pairs. */
export type TopologyToPrimvarVector = [unknown, TfToken[]][]

export class HdRprimSharedData {
  // BufferArrayRange array.
  barContainer: HdBufferArrayRangeContainer
  // Used for CPU frustum culling.
  bounds = new HdRprimBounds()
  // The number of levels of instancing applied to this rprim.
  instancerLevels = 0
  // Used for authored/delegate visibility.
  visible: boolean
  // The owning Rprim's identifier.
  rprimID = ''
  // rprimSharedData.h:55-56: face-varying topologies and their primvars.
  fvarTopologyToPrimvarVector: TopologyToPrimvarVector = []

  constructor(barContainerSize: number, visible = true) {
    this.barContainer = new HdBufferArrayRangeContainer(barContainerSize)
    this.visible = visible
  }
}
