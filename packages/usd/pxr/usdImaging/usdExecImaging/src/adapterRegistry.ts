// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/adapterRegistry.cpp,
//  pxr/usdImaging/usdExecImaging/adapterRegistry.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/adapterRegistry.{h,cpp}
// (OpenUSD 26.11.1).
//
// UsdPrim::IsA<T>() is Prim.isA with the schema's identifier
// (usd/src/prim.ts); importing typescript-usd/usdGeom and
// typescript-usd/execIr registers the schemas, as linking their libraries
// does upstream.

import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import { Xformable as ExecIrXformable } from 'typescript-usd/execIr'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import { UsdExecImaging_GeomXformablePrimAdapter } from './geomXformablePrimAdapter.ts'
import { UsdExecImaging_IrXformablePrimAdapter } from './irXformablePrimAdapter.ts'
import type { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'

/** adapterRegistry.cpp:19-26 */
export const USDEXECIMAGING_ENABLE_USDGEOM_XFORMABLE_ADAPTER = new TfEnvSetting(
  'USDEXECIMAGING_ENABLE_USDGEOM_XFORMABLE_ADAPTER', true,
  'Enables imaging of UsdGeomXformable prims according to their ' +
  'local-to-world transforms, as computed by OpenExec. Note that OpenExec ' +
  'currently computes the local transformation matrix from the ' +
  'xformOp:transform attribute, and ignores other attributes specified in ' +
  'xformOpOrder. Users can disable this setting if they want to keep ' +
  'drawing Xformable prims according to their complete list of xformOps.')

/** The schema identifier of UsdGeomXformable (usdGeom/schema.usda). */
const _UsdGeomXformableSchemaIdentifier = 'Xformable'

let _enableUsdGeomXformableAdapter: boolean | undefined
let _geomXformableAdapter: UsdExecImaging_GeomXformablePrimAdapter | undefined
let _irXformableAdapter: UsdExecImaging_IrXformablePrimAdapter | undefined

/**
 * A singleton class that organizes all registered prim adapters
 * (adapterRegistry.h:17-35).
 *
 * TODO: This class remains largely un-implemented with the exception of a few
 * hard-coded adapter types. This will change in the future when we add the
 * ability to register prim adapters from separate plugins.
 */
export class UsdExecImaging_AdapterRegistry {
  /**
   * Returns the adapter registered to handle the typed schema for prim
   * (adapterRegistry.cpp:28-51).
   *
   * If there is no registered adapter for the type of prim, this returns
   * a null pointer.
   */
  static getPrimAdapter(prim: UsdPrim): UsdExecImagingPrimAdapterInterface | null {
    // TODO: The adapter currently has a few hard-coded adapter types. This
    // will change in the future to generically handle adapters registered in
    // plugins.

    // A function-local static upstream: read once.
    _enableUsdGeomXformableAdapter ??=
      TfGetEnvSetting(USDEXECIMAGING_ENABLE_USDGEOM_XFORMABLE_ADAPTER)

    if (prim.isA(_UsdGeomXformableSchemaIdentifier) && _enableUsdGeomXformableAdapter) {
      return _geomXformableAdapter ??= new UsdExecImaging_GeomXformablePrimAdapter()
    }

    if (prim.isA(ExecIrXformable.typeName)) {
      return _irXformableAdapter ??= new UsdExecImaging_IrXformablePrimAdapter()
    }

    return null
  }
}
