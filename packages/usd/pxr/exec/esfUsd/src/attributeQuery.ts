// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/attributeQuery.cpp,
//  pxr/exec/esfUsd/attributeQuery.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/attributeQuery.h and
// attributeQuery.cpp.
//
// Implementation of EsfAttributeQueryInterface that wraps a UsdAttributeQuery
// (attributeQuery.h:21-42).

import { SdfPath } from 'typescript-usd/sdf/path'
import type { Spline as TsSpline } from 'typescript-usd/ts'
import { AttributeQuery as UsdAttributeQuery, type TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'
import { EsfAttributeQueryInterface } from 'typescript-usd/esf'

export class EsfUsd_AttributeQuery extends EsfAttributeQueryInterface {
  // attributeQuery.h:39
  private _attributeQuery: UsdAttributeQuery

  /** Moves the provided \p attributeQuery into this instance
   *  (attributeQuery.h:27-29). */
  constructor(attributeQuery: UsdAttributeQuery) {
    super()
    this._attributeQuery = attributeQuery
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238):
  // UsdAttributeQuery is immutable once constructed, so the copy shares it.
  override _copyTo(): EsfUsd_AttributeQuery {
    return new EsfUsd_AttributeQuery(this._attributeQuery)
  }

  override _moveTo(): EsfUsd_AttributeQuery {
    return new EsfUsd_AttributeQuery(this._attributeQuery)
  }

  // attributeQuery.cpp:16-20
  protected _isValid(): boolean {
    return this._attributeQuery.isValid()
  }

  // attributeQuery.cpp:22-26
  protected _getPath(): SdfPath {
    const attribute = this._attributeQuery.getAttribute()
    return attribute === undefined
      ? SdfPath.emptyPath
      : SdfPath.fromString(attribute.getPath())
  }

  // attributeQuery.cpp:28-32
  protected _initialize(): void {
    this._attributeQuery = new UsdAttributeQuery(this._attributeQuery.getAttribute())
  }

  // attributeQuery.cpp:33-37: UsdAttributeQuery::Get(VtValue*, time), which
  // returns true when a value resolved.
  protected _get(time: UsdTimeCode): [boolean, VtValue] {
    const value = VtValue.getEmpty()
    const resolved = this._attributeQuery.get(value, time)
    return [resolved, value]
  }

  // attributeQuery.cpp:40-47
  protected _getSpline(): TsSpline | null {
    if (!this._attributeQuery.hasSpline()) {
      return null
    }
    return this._attributeQuery.getSpline() ?? null
  }

  // attributeQuery.cpp:49-53
  protected _valueSourceMightBeTimeVarying(): boolean {
    return this._attributeQuery.valueSourceMightBeTimeVarying()
  }

  // attributeQuery.cpp:55-66
  protected _isTimeVarying(from: UsdTimeCode, to: UsdTimeCode): boolean {
    if (!this._valueSourceMightBeTimeVarying()) {
      return false
    }
    const [, fromValue] = this._get(from)
    const [, toValue] = this._get(to)
    return !fromValue.equals(toValue)
  }
}
