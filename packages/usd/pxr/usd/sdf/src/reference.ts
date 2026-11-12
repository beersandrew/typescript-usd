// Ported from OpenUSD 26.11.1: pxr/usd/sdf/reference.cpp,
//  pxr/usd/sdf/reference.h, pxr/usd/sdf/payload.cpp, pxr/usd/sdf/payload.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/sdf/reference.{h,cpp} and payload.{h,cpp}: the value
// types of reference and payload list ops. Their fields have the same shape
// the file formats read and write, so stored items of either form compare
// equal.

import { SdfAssetPath } from './assetPath.ts'
import { sdfLayerOffsetLessThan } from './layerOffset.ts'
import { SdfPath } from './path.ts'

export interface SdfLayerOffsetValue {
  readonly offset: number
  readonly scale: number
}

const IDENTITY_OFFSET: SdfLayerOffsetValue = Object.freeze({ offset: 0, scale: 1 })

// Pass through SdfAssetPath() to issue an error if `assetPath` contains
// invalid characters (reference.cpp:32-34, payload.cpp:29-31).
function validatedAssetPath(assetPath: string): string {
  return new SdfAssetPath(assetPath).getAssetPath()
}

function offsetsEqualOrdered(a: SdfLayerOffsetValue, b: SdfLayerOffsetValue): boolean {
  return !sdfLayerOffsetLessThan(a, b) && !sdfLayerOffsetLessThan(b, a)
}

function pathString(path: string | SdfPath | undefined): string {
  return path instanceof SdfPath ? path.pathString : path ?? ''
}

function offsetsEqual(a: SdfLayerOffsetValue | undefined, b: SdfLayerOffsetValue | undefined): boolean {
  return (a?.offset ?? 0) === (b?.offset ?? 0) && (a?.scale ?? 1) === (b?.scale ?? 1)
}

function dictionariesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

export class SdfReference {
  readonly assetPath: string
  readonly primPath: string
  readonly layerOffset: SdfLayerOffsetValue
  declare readonly customData?: Readonly<Record<string, unknown>>

  constructor(
    assetPath = '', primPath: string | SdfPath = '',
    layerOffset: SdfLayerOffsetValue = IDENTITY_OFFSET,
    customData: Readonly<Record<string, unknown>> = {},
  ) {
    this.assetPath = validatedAssetPath(assetPath)
    this.primPath = pathString(primPath)
    this.layerOffset = Object.freeze({ offset: layerOffset.offset, scale: layerOffset.scale })
    // Stored only when authored, as the file formats read it.
    if (Object.keys(customData).length > 0) {
      Object.defineProperty(this, 'customData', { value: customData, enumerable: true })
    }
    // A value type: its fields are read-only.
    Object.freeze(this)
  }

  /** @internal A reference from a stored reference list op item. */
  static _from(item: unknown): SdfReference {
    if (item instanceof SdfReference) return item
    const raw = (item ?? {}) as {
      assetPath?: string; primPath?: string | SdfPath; layerOffset?: SdfLayerOffsetValue
      customData?: Record<string, unknown>
    }
    return new SdfReference(raw.assetPath ?? '', raw.primPath ?? '',
      raw.layerOffset ?? IDENTITY_OFFSET, raw.customData ?? {})
  }

  getAssetPath(): string { return this.assetPath }
  getPrimPath(): SdfPath { return SdfPath.fromString(this.primPath) }
  getLayerOffset(): SdfLayerOffsetValue { return this.layerOffset }
  getCustomData(): Readonly<Record<string, unknown>> { return this.customData ?? {} }

  // SdfReference::IsInternal: a reference to a prim in the same layer stack.
  isInternal(): boolean { return this.assetPath === '' }

  // SdfReference::operator< (reference.cpp:67-78).
  lessThan(rhs: SdfReference): boolean {
    const lp = this.getPrimPath(), rp = rhs.getPrimPath()
    return this.assetPath < rhs.assetPath || (this.assetPath === rhs.assetPath &&
      (SdfPath.compare(lp, rp) < 0 || (lp.equals(rp) &&
      (sdfLayerOffsetLessThan(this.layerOffset, rhs.layerOffset) ||
      (offsetsEqualOrdered(this.layerOffset, rhs.layerOffset) &&
      Object.keys(this.getCustomData()).length < Object.keys(rhs.getCustomData()).length)))))
  }

  equals(other: unknown): boolean {
    if (!other || typeof other !== 'object') return false
    const rhs = other as SdfReference
    return this.assetPath === (rhs.assetPath ?? '') &&
      this.primPath === pathString(rhs.primPath) &&
      offsetsEqual(this.layerOffset, rhs.layerOffset) &&
      dictionariesEqual(this.customData, rhs.customData)
  }
}

export class SdfPayload {
  readonly assetPath: string
  readonly primPath: string
  readonly layerOffset: SdfLayerOffsetValue

  constructor(
    assetPath = '', primPath: string | SdfPath = '',
    layerOffset: SdfLayerOffsetValue = IDENTITY_OFFSET,
  ) {
    this.assetPath = validatedAssetPath(assetPath)
    this.primPath = pathString(primPath)
    this.layerOffset = Object.freeze({ offset: layerOffset.offset, scale: layerOffset.scale })
    // A value type: its fields are read-only.
    Object.freeze(this)
  }

  /** @internal A payload from a stored payload list op item. */
  static _from(item: unknown): SdfPayload {
    if (item instanceof SdfPayload) return item
    const raw = (item ?? {}) as {
      assetPath?: string; primPath?: string | SdfPath; layerOffset?: SdfLayerOffsetValue
    }
    return new SdfPayload(raw.assetPath ?? '', raw.primPath ?? '', raw.layerOffset ?? IDENTITY_OFFSET)
  }

  getAssetPath(): string { return this.assetPath }
  getPrimPath(): SdfPath { return SdfPath.fromString(this.primPath) }
  getLayerOffset(): SdfLayerOffsetValue { return this.layerOffset }

  // SdfPayload::operator< (payload.cpp:45-51).
  lessThan(rhs: SdfPayload): boolean {
    const lp = this.getPrimPath(), rp = rhs.getPrimPath()
    return this.assetPath < rhs.assetPath || (this.assetPath === rhs.assetPath &&
      (SdfPath.compare(lp, rp) < 0 || (lp.equals(rp) &&
      sdfLayerOffsetLessThan(this.layerOffset, rhs.layerOffset))))
  }

  equals(other: unknown): boolean {
    if (!other || typeof other !== 'object') return false
    const rhs = other as SdfPayload
    return this.assetPath === (rhs.assetPath ?? '') &&
      this.primPath === pathString(rhs.primPath) &&
      offsetsEqual(this.layerOffset, rhs.layerOffset)
  }
}
