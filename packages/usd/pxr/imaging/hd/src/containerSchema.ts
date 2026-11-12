// Ported from OpenUSD 26.11.1: pxr/imaging/hd/containerSchema.cpp,
//  pxr/imaging/hd/containerSchema.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/containerSchema.{h,cpp} (OpenUSD 26.11.1).

import type { Token as TfToken } from 'typescript-usd/tf'
import {
  HdContainerDataSource,
  HdDataSourceBase,
  HdRetainedContainerDataSource,
  HdSampledDataSource,
} from './dataSource.ts'
import { HdSchema, _HdMakeSchema, type HdSchemaClass } from './schema.ts'

/** containerSchema.h:21-44. Base class for a schema backed by a container
 * whose children have arbitrary names. */
export class HdContainerSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** containerSchema.cpp:12-19 */
  getNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  /** containerSchema.cpp:21-29 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}

/** containerSchema.h:46-63. A container whose children are typed sampled data
 * sources (only the HdSampledDataSource kind is checked, see schema.ts). */
export class HdContainerOfTypedSampledDataSourcesSchema<
  T extends HdSampledDataSource = HdSampledDataSource,
> extends HdContainerSchema {
  Get(name: string): T | undefined {
    return this._getTypedDataSource<T>(name)
  }
}

/** containerSchema.h:65-66 */
export const HdTypedContainerSchema = HdContainerOfTypedSampledDataSourcesSchema
export type HdTypedContainerSchema<T extends HdSampledDataSource = HdSampledDataSource> =
  HdContainerOfTypedSampledDataSourcesSchema<T>

/** containerSchema.h:68-87. A container whose children are schemas of class
 * `Schema`; the schema class is passed explicitly (C++ template argument). */
export class HdContainerOfSchemasSchema<S> extends HdContainerSchema {
  constructor(
    container: HdContainerDataSource | undefined,
    private readonly _schemaClass: HdSchemaClass<S>,
  ) { super(container) }

  Get(name: string): S {
    return _HdMakeSchema(this._schemaClass, this._container?.Get(name))
  }
}

/** containerSchema.h:89-90 */
export const HdSchemaBasedContainerSchema = HdContainerOfSchemasSchema
export type HdSchemaBasedContainerSchema<S> = HdContainerOfSchemasSchema<S>
