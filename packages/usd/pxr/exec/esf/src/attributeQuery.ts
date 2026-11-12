// Ported from OpenUSD 26.11.1: pxr/exec/esf/attributeQuery.cpp,
//  pxr/exec/esf/attributeQuery.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/attributeQuery.h and
// attributeQuery.cpp.
//
// Attribute query abstraction for scene adapter implementations
// (attributeQuery.h:24-32). The abstraction closely resembles
// UsdAttributeQuery. The public methods are called during initialization of
// inputs to the execution network and during authored value invalidation.
//
// Mapping choices (openexec-x1.md 4.1, rule 6): `bool Get(VtValue *value,
// UsdTimeCode time)` returns a [found, value] tuple; std::optional<TsSpline>
// is `TsSpline | null`.

import type { SdfPath } from 'typescript-usd/sdf/path'
import type { Spline as TsSpline } from 'typescript-usd/ts'
import type { TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import type { Value as VtValue } from 'typescript-usd/vt'
import {
  EsfFixedSizePolymorphicBase, EsfFixedSizePolymorphicHolder,
} from './fixedSizePolymorphicHolder.ts'

export abstract class EsfAttributeQueryInterface extends EsfFixedSizePolymorphicBase {
  /** This constructor may only be called by the scene adapter implementation
   *  (attributeQuery.h:110-111). */
  protected constructor() {
    super()
  }

  /** Returns `true` if the query object is valid (attributeQuery.h:37-44).
   *  \see UsdAttributeQuery::IsValid */
  isValid(): boolean {
    return this._isValid()
  }

  /** Returns the path of the attribute that is being queried
   *  (attributeQuery.h:46-49). */
  getPath(): SdfPath {
    return this._getPath()
  }

  /**
   * Reinitialize the query object from the attribute it was initially
   * constructed with (attributeQuery.h:51-60). This enables clients to
   * "revive" the query object after changes that affect value resolution
   * previously invalidated it.
   */
  initialize(): void {
    this._initialize()
  }

  /**
   * Gets the resolved value of the attribute at a given time
   * (attributeQuery.h:62-69): [true, value] when a value was resolved.
   * \see UsdAttribute::Get
   */
  Get(time: UsdTimeCode): [boolean, VtValue] {
    return this._get(time)
  }

  /** Gets the authored spline if the strongest opinion is a spline
   *  (attributeQuery.h:71-78). \see UsdAttribute::GetSpline */
  getSpline(): TsSpline | null {
    return this._getSpline()
  }

  /**
   * Returns `true` if the attribute value might be varying over time, and
   * `false` if the value is *definitely* not varying over time
   * (attributeQuery.h:80-91). This includes the possible effect of changing
   * between a numeric time and the default time.
   * \see UsdAttributeQuery::ValueSourceMightBeTimeVarying
   */
  valueSourceMightBeTimeVarying(): boolean {
    return this._valueSourceMightBeTimeVarying()
  }

  /**
   * Returns `true` if the resolved value of the attribute is different on
   * time \p from and time \p to (attributeQuery.h:93-104). This does *not*
   * examine times between \p from and \p to.
   */
  isTimeVarying(from: UsdTimeCode, to: UsdTimeCode): boolean {
    return this._isTimeVarying(from, to)
  }

  // These methods must be implemented by the scene adapter implementation
  // (attributeQuery.h:113-121).
  protected abstract _isValid(): boolean
  protected abstract _getPath(): SdfPath
  protected abstract _initialize(): void
  protected abstract _get(time: UsdTimeCode): [boolean, VtValue]
  protected abstract _getSpline(): TsSpline | null
  protected abstract _valueSourceMightBeTimeVarying(): boolean
  protected abstract _isTimeVarying(from: UsdTimeCode, to: UsdTimeCode): boolean
}

/**
 * Holds an implementation of EsfAttributeQueryInterface
 * (attributeQuery.h:124-137). Upstream reserves a 176-byte buffer, large
 * enough for an implementation that wraps a UsdAttributeQuery.
 */
export class EsfAttributeQuery
  extends EsfFixedSizePolymorphicHolder<EsfAttributeQueryInterface> {}
