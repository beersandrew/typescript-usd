// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceLegacyTaskPrim.cpp,
//  pxr/imaging/hd/dataSourceLegacyTaskPrim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dataSourceLegacyTaskPrim.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences: SdfPath ids are path strings. VtValue::IsHolding<T> for
// HdRprimCollection and TfTokenVector is a runtime check of the held object
// (an HdRprimCollection instance / a plain array of tokens, the std::vector;
// a VtArray<TfToken> is a different type, as upstream).

import { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { HdContainerDataSource, type HdDataSourceBase } from './dataSource.ts'
import {
  HdRetainedSampledDataSource, HdRetainedTypedSampledDataSource,
} from './retainedDataSource.ts'
import { HdLegacyTaskSchemaTokens } from './legacyTaskSchema.ts'
import type { HdLegacyTaskFactory } from './legacyTaskFactory.ts'
import { HdRprimCollection } from './rprimCollection.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdTokens } from './tokens.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** dataSourceLegacyTaskPrim.cpp:16-102 */
class _LegacyTaskSchemaDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _id: string,
    private readonly _sceneDelegate: HdSceneDelegate,
    private readonly _factory: HdLegacyTaskFactory | undefined,
  ) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate,
    factory: HdLegacyTaskFactory | undefined): _LegacyTaskSchemaDataSource {
    return new _LegacyTaskSchemaDataSource(id, sceneDelegate, factory)
  }

  getNames(): TfToken[] {
    return [
      HdLegacyTaskSchemaTokens.factory,
      HdLegacyTaskSchemaTokens.parameters,
      HdLegacyTaskSchemaTokens.collection,
      HdLegacyTaskSchemaTokens.renderTags,
    ]
  }

  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (name === HdLegacyTaskSchemaTokens.factory) {
      return _LegacyTaskSchemaDataSource._toTypedDataSource(this._factory)
    }

    if (name === HdLegacyTaskSchemaTokens.parameters) {
      return HdRetainedSampledDataSource.new(
        this._sceneDelegate.Get(this._id, HdTokens.params))
    }

    if (name === HdLegacyTaskSchemaTokens.collection) {
      return this._get(HdTokens.collection,
        (held): held is HdRprimCollection => held instanceof HdRprimCollection)
    }

    if (name === HdLegacyTaskSchemaTokens.renderTags) {
      return this._get(HdTokens.renderTags,
        (held): held is TfToken[] => Array.isArray(held) &&
          held.every(t => typeof t === 'string'))
    }

    return undefined
  }

  private static _toTypedDataSource<T>(v: T): HdDataSourceBase {
    return HdRetainedTypedSampledDataSource.new(v)
  }

  // dataSourceLegacyTaskPrim.cpp:84-93 _Get<T>(key).
  private _get<T>(key: TfToken, isHolding: (held: unknown) => held is T):
    HdDataSourceBase | undefined {
    const value = this._sceneDelegate.Get(this._id, key)
    if (!(value instanceof VtValue) || value.IsEmpty()) {
      return undefined
    }
    const held = value.UncheckedGet<unknown>()
    if (!isHolding(held)) {
      return undefined
    }
    return _LegacyTaskSchemaDataSource._toTypedDataSource(held)
  }
}

/** dataSourceLegacyTaskPrim.h:24-46 */
export class HdDataSourceLegacyTaskPrim extends HdContainerDataSource {
  /** dataSourceLegacyTaskPrim.cpp:106-115 */
  private constructor(
    private readonly _id: string,
    private readonly _sceneDelegate: HdSceneDelegate,
    private readonly _factory: HdLegacyTaskFactory | undefined,
  ) {
    super()
  }

  static new(id: string, sceneDelegate: HdSceneDelegate,
    factory: HdLegacyTaskFactory | undefined): HdDataSourceLegacyTaskPrim {
    return new HdDataSourceLegacyTaskPrim(id, sceneDelegate, factory)
  }

  static cast(ds: HdDataSourceBase | undefined): HdDataSourceLegacyTaskPrim | undefined {
    return ds instanceof HdDataSourceLegacyTaskPrim ? ds : undefined
  }

  /** dataSourceLegacyTaskPrim.cpp:119-126 */
  getNames(): TfToken[] {
    return [
      HdLegacyTaskSchemaTokens.task,
    ]
  }

  /** dataSourceLegacyTaskPrim.cpp:128-141 */
  Get(name: TfToken | string): HdDataSourceBase | undefined {
    if (!TF_VERIFY(this._sceneDelegate)) {
      return undefined
    }

    if (name === HdLegacyTaskSchemaTokens.task) {
      return _LegacyTaskSchemaDataSource.new(this._id, this._sceneDelegate, this._factory)
    }

    return undefined
  }
}
