// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/extentsHintSchema.cpp,
//  pxr/usdImaging/usdImaging/extentsHintSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/extentsHintSchema.{h,cpp}
// (OpenUSD 26.11.1). This schema is hand-written upstream (not generated
// from hdSchemaDefs.py).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  ExtentSchema as HdExtentSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  Schema as HdSchema,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'

/** extentsHintSchema.h:19-23 TF_DECLARE_PUBLIC_TOKENS(UsdImagingExtentsHintSchemaTokens) */
export const UsdImagingExtentsHintSchemaTokens = TfMakeTokens({
  extentsHint: 'extentsHint',
})

/** extentsHintSchema.h:25-55: the extentsHint of a prim, keyed by (hydra)
 *  purpose, each an HdExtentSchema. */
export class UsdImagingExtentsHintSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** extentsHintSchema.cpp:31-35 */
  getExtent(purpose: string): HdExtentSchema {
    return new HdExtentSchema(this._getContainerDataSource(purpose))
  }

  /** extentsHintSchema.cpp:37-45 */
  static buildRetained(
    count: number,
    names: readonly string[],
    values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new(names.slice(0, count), values.slice(0, count))
  }

  /** extentsHintSchema.cpp:47-57 */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingExtentsHintSchema {
    const ds = fromParentContainer?.Get(UsdImagingExtentsHintSchema.getSchemaToken())
    return new UsdImagingExtentsHintSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** extentsHintSchema.cpp:59-64 */
  static getSchemaToken(): TfToken {
    return UsdImagingExtentsHintSchemaTokens.extentsHint
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  /** extentsHintSchema.cpp:66-74 */
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingExtentsHintSchema._defaultLocator ??=
      new HdDataSourceLocator(UsdImagingExtentsHintSchemaTokens.extentsHint)
  }
}
