// Ported from OpenUSD 26.11.1: pxr/imaging/hd/vectorSchema.cpp,
//  pxr/imaging/hd/vectorSchema.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/vectorSchema.{h,cpp} (OpenUSD 26.11.1).

import {
  HdDataSourceBase,
  HdRetainedSmallVectorDataSource,
  HdSampledDataSource,
  HdVectorDataSource,
} from './dataSource.ts'
import { _HdMakeSchema, type HdSchemaClass } from './schema.ts'

/** vectorSchema.h:24-55. Base class for a schema backed by a vector data
 * source. */
export class HdVectorSchema {
  /** vectorSchema.h:43 `using UnderlyingDataSource = HdVectorDataSource;` */
  static readonly UnderlyingDataSource: abstract new (...args: never[]) => HdDataSourceBase =
    HdVectorDataSource

  constructor(protected readonly _vector?: HdVectorDataSource | undefined) {}

  /** vectorSchema.cpp:12-19 (count implied by the array length). */
  static buildRetained(values: readonly HdDataSourceBase[]): HdVectorDataSource {
    return HdRetainedSmallVectorDataSource.new([...values])
  }

  /** vectorSchema.cpp:21-25 */
  getVector(): HdVectorDataSource | undefined { return this._vector }

  /** vectorSchema.cpp:27-34 */
  isDefined(): boolean { return this._vector !== undefined }

  /** vectorSchema.cpp:36-43 */
  getNumElements(): number { return this._vector?.getNumElements() ?? 0 }

  /** vectorSchema.h:46-51 for typed sampled T (kind check only, see schema.ts). */
  protected _getTypedSampled<T extends HdSampledDataSource>(element: number): T | undefined {
    const ds = this._vector?.getElement(element)
    return ds instanceof HdSampledDataSource ? ds as T : undefined
  }
}

/** vectorSchema.h:57-73 */
export class HdVectorOfTypedSampledDataSourcesSchema<
  T extends HdSampledDataSource = HdSampledDataSource,
> extends HdVectorSchema {
  getElement(element: number): T | undefined {
    return this._getTypedSampled<T>(element)
  }
}

/** vectorSchema.h:75-76 */
export const HdTypedVectorSchema = HdVectorOfTypedSampledDataSourcesSchema
export type HdTypedVectorSchema<T extends HdSampledDataSource = HdSampledDataSource> =
  HdVectorOfTypedSampledDataSourcesSchema<T>

/** vectorSchema.h:78-95. The schema class is passed explicitly (C++ template
 * argument). */
export class HdVectorOfSchemasSchema<S> extends HdVectorSchema {
  constructor(
    vector: HdVectorDataSource | undefined,
    private readonly _schemaClass: HdSchemaClass<S>,
  ) { super(vector) }

  getElement(element: number): S {
    return _HdMakeSchema(this._schemaClass, this._vector?.getElement(element))
  }
}

/** vectorSchema.h:97-98 */
export const HdSchemaBasedVectorSchema = HdVectorOfSchemasSchema
export type HdSchemaBasedVectorSchema<S> = HdVectorOfSchemasSchema<S>
