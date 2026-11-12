// Ported from OpenUSD 26.11.1: pxr/imaging/hd/schema.cpp,
//  pxr/imaging/hd/schema.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/schema.{h,cpp} (OpenUSD 26.11.1).

import {
  HdContainerDataSource,
  HdDataSourceBase,
  HdRetainedContainerDataSource,
  HdSampledDataSource,
  HdVectorDataSource,
} from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'

/**
 * schema.h:21-61. Base class for container-backed schemas.
 *
 * Divergence: upstream `_GetTypedDataSource<T>` is `T::Cast` (a dynamic cast
 * to the data source type). TypeScript type parameters do not exist at run
 * time, so the typed helpers below check only the data source *kind*:
 * typed sampled members (HdIntDataSource, HdMatrixDataSource, ...) accept any
 * HdSampledDataSource, container members any HdContainerDataSource, vector
 * members any HdVectorDataSource. The element type T is a compile-time hint.
 */
export class HdSchema {
  /** schema.h:46 `using UnderlyingDataSource = HdContainerDataSource;` */
  static readonly UnderlyingDataSource: abstract new (...args: never[]) => HdDataSourceBase =
    HdContainerDataSource

  constructor(protected readonly _container?: HdContainerDataSource | undefined) {}

  /** schema.cpp:12-16 */
  getContainer(): HdContainerDataSource | undefined { return this._container }

  /** schema.cpp:18-25 */
  isDefined(): boolean { return this._container !== undefined }

  /** schema.h:52-56 for T = a typed sampled data source. */
  protected _getTypedDataSource<T extends HdSampledDataSource = HdSampledDataSource>(
    name: string,
  ): T | undefined {
    const ds = this._container?.Get(name)
    return ds instanceof HdSampledDataSource ? ds as T : undefined
  }

  /** schema.h:52-56 for T = HdContainerDataSource. */
  protected _getContainerDataSource(name: string): HdContainerDataSource | undefined {
    const ds = this._container?.Get(name)
    return ds instanceof HdContainerDataSource ? ds : undefined
  }

  /** schema.h:52-56 for T = HdVectorDataSource. */
  protected _getVectorDataSource(name: string): HdVectorDataSource | undefined {
    const ds = this._container?.Get(name)
    return ds instanceof HdVectorDataSource ? ds : undefined
  }

  /** schema.h:52-56 for T = HdDataSourceBase (no cast needed). */
  protected _getDataSourceBase(name: string): HdDataSourceBase | undefined {
    return this._container?.Get(name) ?? undefined
  }
}

/**
 * Constructor shape of a schema class, used by HdContainerOfSchemasSchema /
 * HdVectorOfSchemasSchema (the C++ template parameter `Schema`, with
 * `Schema::UnderlyingDataSource`).
 */
export interface HdSchemaClass<S> {
  new (ds: never): S
  readonly UnderlyingDataSource: abstract new (...args: never[]) => HdDataSourceBase
}

/** Construct a schema of class `schemaClass` from `ds` if `ds` has the
 * schema's underlying data source kind (`Schema(T::Cast(ds))`). */
export function _HdMakeSchema<S>(
  schemaClass: HdSchemaClass<S>, ds: HdDataSourceBase | undefined,
): S {
  const ctor = schemaClass as unknown as new (ds: HdDataSourceBase | undefined) => S
  return new ctor(ds instanceof schemaClass.UnderlyingDataSource ? ds : undefined)
}

// ---- Helpers kept from the earlier hand-written schemas of this port ----

export function _HdSchemaFromParent(
  parent: HdContainerDataSource | undefined,
  token: string,
): HdContainerDataSource | undefined {
  const child = parent?.Get(token)
  return child instanceof HdContainerDataSource ? child : undefined
}

export function _HdBuildRetained(
  fields: Record<string, HdDataSourceBase | undefined>,
): HdContainerDataSource {
  const entries = Object.entries(fields).filter(
    (entry): entry is [string, HdDataSourceBase] => entry[1] !== undefined)
  return HdRetainedContainerDataSource.new(
    entries.map(([name]) => name),
    entries.map(([, value]) => value),
  )
}

export function _HdLocator(schema: string, member?: string): HdDataSourceLocator {
  return member
    ? new HdDataSourceLocator(schema, member)
    : new HdDataSourceLocator(schema)
}
