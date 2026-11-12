// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/irXformablePrimAdapter.cpp,
//  pxr/usdImaging/usdExecImaging/irXformablePrimAdapter.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/irXformablePrimAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// UsdPrim::GetAttribute returns an invalid UsdAttribute for a missing
// property; Prim.getAttr in this port always returns an attribute object for
// the property path, as upstream's does.

import {
  DataSourceLocator as HdDataSourceLocator, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
  type ContainerDataSource as HdContainerDataSource, type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import { ExecBuiltinComputations } from 'typescript-usd/exec'
import { ExecIrTokens } from 'typescript-usd/execIr'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdExecImagingComputedTypedSampledDataSource } from './computedDataSource.ts'
import { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
import type { UsdExecImagingRequestAccessorInterfaceSharedPtr } from './requestAccessorInterface.ts'
import type { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
import { UsdExecImagingValueKey } from './valueKey.ts'

/** SdfPath::AppendProperty for a prim path string. */
const _AppendProperty = (primPath: string, name: string): string => `${primPath}.${name}`

/**
 * The UsdExecImaging prim adapter for IrXformable prims provides data sources
 * for computed values (irXformablePrimAdapter.h:17-44).
 *
 * Namely, it provides data sources that extract the computed value of
 * posed:space for the adapted prims. These data sources overlay on top of the
 * data sources provided by the UsdImaging prim adapter, which inserts subprims
 * for guide geometry.
 */
export class UsdExecImaging_IrXformablePrimAdapter extends UsdExecImagingPrimAdapterInterface {
  /** irXformablePrimAdapter.cpp:23-30 */
  buildRequest(prim: UsdPrim, requestBuilder: UsdExecImagingRequestBuilderInterface): void {
    requestBuilder.addValueKey(
      prim.getAttr(ExecIrTokens.posedSpace)!)
  }

  /** irXformablePrimAdapter.cpp:32-51 */
  getPrimData(
    primPath: string,
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new(
      [HdXformSchema.getSchemaToken()],
      [new HdXformSchema.Builder()
        .setResetXformStack(
          HdRetainedTypedSampledDataSource.new(true))
        .setMatrix(
          UsdExecImagingComputedTypedSampledDataSource.new<GfMatrix4d>(
            VtValueTypes.GfMatrix4d,
            requestAccessor,
            new UsdExecImagingValueKey(
              _AppendProperty(primPath, ExecIrTokens.posedSpace),
              ExecBuiltinComputations.computeValue)))
        .build()])
  }

  /** irXformablePrimAdapter.cpp:53-70 */
  invalidatePrimData(
    primPath: string,
    valueKey: UsdExecImagingValueKey,
    invalidLocators: HdDataSourceLocatorSet,
  ): void {
    const posedSpaceValueKey = new UsdExecImagingValueKey(
      _AppendProperty(primPath, ExecIrTokens.posedSpace),
      ExecBuiltinComputations.computeValue)

    // If the invalidated value key is for this prim's posed:space computeValue,
    // then this prim's xform/matrix data source is invalid.
    if (valueKey.Equals(posedSpaceValueKey)) {
      invalidLocators.append(new HdDataSourceLocator(
        HdXformSchema.getSchemaToken(),
        HdXformSchemaTokens.matrix))
    }
  }
}
