// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/valueKey.cpp,
//  pxr/exec/execUsd/valueKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/valueKey.h and valueKey.cpp.
//
// The std::variant member `_key` (valueKey.h:76-80) is a discriminated union
// of the three key structs, each tagged with its struct name. Upstream's
// friends ExecUsd_VisitValueKey (visitValueKey.ts) and ExecUsd_ExpireValueKey
// (requestImpl.ts) reach `_key` through the @internal field.
//
// Upstream's constructor overloads are told apart at run time: a UsdPrim
// provider (typescript-usd/usd Prim) makes a prim computation key, a
// UsdAttribute provider an attribute computation key.

import type { SdfPath } from 'typescript-usd/sdf/path'
import { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import { ExecBuiltinComputations } from 'typescript-usd/exec'

/** valueKey.h:28-32 */
export interface ExecUsd_ExpiredValueKey {
  readonly kind: 'ExecUsd_ExpiredValueKey'
  path: SdfPath
  computation: string
}

/** valueKey.h:34-38 */
export interface ExecUsd_AttributeComputationValueKey {
  readonly kind: 'ExecUsd_AttributeComputationValueKey'
  provider: UsdAttribute
  computation: string
}

/** valueKey.h:40-44 */
export interface ExecUsd_PrimComputationValueKey {
  readonly kind: 'ExecUsd_PrimComputationValueKey'
  provider: UsdPrim
  computation: string
}

/** The alternatives of ExecUsdValueKey::_key (valueKey.h:76-80). */
export type ExecUsd_ValueKeyVariant =
  | ExecUsd_ExpiredValueKey
  | ExecUsd_AttributeComputationValueKey
  | ExecUsd_PrimComputationValueKey

/**
 * Specifies a computed value (valueKey.h:46-83).
 *
 * Clients identify computations to evaluate using a USD object that provides
 * computations and the name of the computation.
 */
export class ExecUsdValueKey {
  /** @internal valueKey.h:76-80; accessed by the upstream friends only. */
  _key: ExecUsd_ValueKeyVariant

  /**
   * Constructs a value key that computes the builtin computeValue attribute
   * computation (valueKey.h:49-53, valueKey.cpp:20-23).
   */
  constructor(provider: UsdAttribute)
  /**
   * Constructs a value key representing an attribute computation
   * (valueKey.h:55-57, valueKey.cpp:25-28).
   */
  constructor(provider: UsdAttribute, computation: string)
  /**
   * Constructs a value key representing a prim computation
   * (valueKey.h:59-61, valueKey.cpp:30-33).
   */
  constructor(provider: UsdPrim, computation: string)
  constructor(provider: UsdAttribute | UsdPrim, computation?: string) {
    if (provider instanceof UsdPrim) {
      if (computation === undefined) {
        throw new TypeError(
          'ExecUsdValueKey(UsdPrim) requires a computation name (valueKey.h:59-61)')
      }
      this._key = {
        kind: 'ExecUsd_PrimComputationValueKey', provider, computation,
      }
    } else if (provider instanceof UsdAttribute) {
      this._key = {
        kind: 'ExecUsd_AttributeComputationValueKey',
        provider,
        computation: computation ?? ExecBuiltinComputations.computeValue,
      }
    } else {
      throw new TypeError(
        'ExecUsdValueKey provider must be a UsdAttribute or a UsdPrim (valueKey.h:49-61)')
    }
  }
}
