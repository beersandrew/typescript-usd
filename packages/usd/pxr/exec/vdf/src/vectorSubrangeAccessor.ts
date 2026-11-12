// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorSubrangeAccessor.cpp,
//  pxr/exec/vdf/vectorSubrangeAccessor.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorSubrangeAccessor.h and
// vectorSubrangeAccessor.cpp.
//
// Specialized vector accessor for read access to boxed containers
// (vectorSubrangeAccessor.h:32-84). Only VdfSubrangeView uses its methods
// (C++ friendship); they are public here.

import { TF_FATAL_ERROR, type Type as TfType } from 'typescript-usd/tf'
import type { Vdf_BoxedContainer, Vdf_BoxedRanges } from './boxedContainer.ts'
import {
  Vdf_VectorDataInfoLayout, type Vdf_VectorData, type Vdf_VectorDataInfo,
} from './vectorData.ts'

/**
 * Post a TF_FATAL_ERROR on behalf of Vdf_VectorSubrangeAccessor when a
 * type-mismatch is detected (vectorSubrangeAccessor.cpp:14-28).
 */
export function Vdf_VectorSubrangeAccessorPostFatalError(haveType: TfType, wantType: TfType): never {
  return TF_FATAL_ERROR(
    `Invalid type.  Vector is holding ${haveType.getTypeName()}, ` +
    `tried to use as ${wantType.getTypeName()}`)
}

/** Vdf_VectorSubrangeAccessor (vectorSubrangeAccessor.h:32-84). */
export class Vdf_VectorSubrangeAccessor<T> {
  _boxedRanges: Vdf_BoxedRanges | null = null

  /** Constructor (vectorSubrangeAccessor.h:38-56). */
  constructor(type: TfType, data: Vdf_VectorData, info: Vdf_VectorDataInfo) {
    const haveType = data.getTypeInfo()
    if (haveType !== type) {
      Vdf_VectorSubrangeAccessorPostFatalError(haveType, type)
    }
    if (info.layout === Vdf_VectorDataInfoLayout.Boxed) {
      const boxedContainer = info.data as Vdf_BoxedContainer<T>
      this._boxedRanges = boxedContainer.getRanges()
    }
  }

  /** Returns true if the vector is holding boxed values (vectorSubrangeAccessor.h:63-67). */
  isBoxed(): boolean {
    return this._boxedRanges !== null
  }

  /**
   * Returns the boxed container ranges. Clients must ensure that IsBoxed()
   * returns true first (vectorSubrangeAccessor.h:69-77).
   */
  getBoxedRanges(): Vdf_BoxedRanges {
    return this._boxedRanges!
  }
}
