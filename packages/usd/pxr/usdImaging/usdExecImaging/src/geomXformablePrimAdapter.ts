// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/geomXformablePrimAdapter.cpp,
//  pxr/usdImaging/usdExecImaging/geomXformablePrimAdapter.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/geomXformablePrimAdapter.{h,cpp}
// (OpenUSD 26.11.1).

import {
  DataSourceLocator as HdDataSourceLocator, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
  type BoolDataSource as HdBoolDataSource, type ContainerDataSource as HdContainerDataSource,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { ExecGeomXformableTokens } from 'typescript-usd/execGeom'
import { UsdExecImagingComputedTypedSampledDataSource } from './computedDataSource.ts'
import { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
import type { UsdExecImagingRequestAccessorInterfaceSharedPtr } from './requestAccessorInterface.ts'
import type { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
import { UsdExecImagingValueKey } from './valueKey.ts'

let _resetXformStackDataSource: HdBoolDataSource | undefined

/** Get a retained data source that provides the value of xform/resetXformStack.
 *  Our computed transforms are always in world space, so this data source should
 *  always produce a value of true (geomXformablePrimAdapter.cpp:24-32). */
function _GetResetXformStackDataSource(): HdBoolDataSource {
  return _resetXformStackDataSource ??= HdRetainedTypedSampledDataSource.new(true)
}

/**
 * The prim adapter for UsdGeomXformable prims overlays the corresponding hydra
 * prims with the xformable's computed local-to-world transform matrix
 * (geomXformablePrimAdapter.h:17-38).
 */
export class UsdExecImaging_GeomXformablePrimAdapter extends UsdExecImagingPrimAdapterInterface {
  /** geomXformablePrimAdapter.cpp:34-42 */
  buildRequest(prim: UsdPrim, requestBuilder: UsdExecImagingRequestBuilderInterface): void {
    // Add a value key for computing this prim's local-to-world transform.
    requestBuilder.addValueKey(
      prim, ExecGeomXformableTokens.computeLocalToWorldTransform)
  }

  /** geomXformablePrimAdapter.cpp:44-63 */
  getPrimData(
    primPath: string,
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
  ): HdContainerDataSource {
    // Produce a data source conforming to HdXformSchema. The 'matrix' value of
    // the xform schema gets its value from the exec request.
    return HdRetainedContainerDataSource.new(
      [HdXformSchema.getSchemaToken()],
      [new HdXformSchema.Builder()
        .setMatrix(
          UsdExecImagingComputedTypedSampledDataSource.new<GfMatrix4d>(
            VtValueTypes.GfMatrix4d,
            requestAccessor,
            new UsdExecImagingValueKey(
              primPath,
              ExecGeomXformableTokens.computeLocalToWorldTransform)))
        .setResetXformStack(_GetResetXformStackDataSource())
        .build()])
  }

  /** geomXformablePrimAdapter.cpp:65-81 */
  invalidatePrimData(
    primPath: string,
    valueKey: UsdExecImagingValueKey,
    invalidLocators: HdDataSourceLocatorSet,
  ): void {
    const localToWorldTransformValueKey = new UsdExecImagingValueKey(
      primPath, ExecGeomXformableTokens.computeLocalToWorldTransform)

    // If the invalidated value key is for computeLocalToWorldTransform on this
    // prim, then this prim's xform/matrix data source is invalid.
    if (valueKey.Equals(localToWorldTransformValueKey)) {
      invalidLocators.append(new HdDataSourceLocator(
        HdXformSchemaTokens.xform,
        HdXformSchemaTokens.matrix))
    }
  }
}
