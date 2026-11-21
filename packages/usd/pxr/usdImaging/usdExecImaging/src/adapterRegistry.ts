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
import { OverlayContainerDataSource as HdOverlayContainerDataSource, type ContainerDataSource as HdContainerDataSource, type DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import 'typescript-usd/usdGeom'
import { UsdExecImaging_GeomXformablePrimAdapter } from './geomXformablePrimAdapter.ts'
import { UsdExecImaging_IrXformablePrimAdapter } from './irXformablePrimAdapter.ts'
import { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
import type { UsdExecImagingRequestAccessorInterfaceSharedPtr } from './requestAccessorInterface.ts'
import type { UsdExecImagingRequestBuilderInterface } from './requestBuilderInterface.ts'
import type { UsdExecImagingValueKey } from './valueKey.ts'

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

    let adapter: UsdExecImagingPrimAdapterInterface | null = null
    if (prim.isA(_UsdGeomXformableSchemaIdentifier) && _enableUsdGeomXformableAdapter) {
      adapter = _geomXformableAdapter ??= new UsdExecImaging_GeomXformablePrimAdapter()
    } else if (prim.isA(ExecIrXformable.typeName)) {
      adapter = _irXformableAdapter ??= new UsdExecImaging_IrXformablePrimAdapter()
    }

    return _WithApiSchemaAdapters(prim, adapter)
  }
}

// FAITHFULNESS-DEBT(usdexecimaging-plugin-adapters): upstream hard-codes its
// adapters (adapterRegistry.cpp:31-33, "TODO: ... handle adapters registered
// in plugins"; adapterRegistry.h:19-23). Until OpenUSD defines that plugin
// mechanism, an applied API schema may register an adapter here; it is layered
// over the prim's typed adapter (its data sources win), so a Mesh keeps its
// computed transform and gains, e.g., computed points. Faithful end state:
// replace this with upstream's plugin adapter registration once it exists.
const _apiSchemaAdapters = new Map<string, UsdExecImagingPrimAdapterInterface>()
const _layeredAdapters = new Map<string, UsdExecImagingPrimAdapterInterface>()

/**
 * Registers `adapter` for prims with the applied single-apply API schema
 * `apiSchemaName` (its schema identifier, as in `apiSchemas`). Interim: see
 * FAITHFULNESS-DEBT(usdexecimaging-plugin-adapters).
 */
export function _interim_UsdExecImagingRegisterApiSchemaAdapter(
  apiSchemaName: string, adapter: UsdExecImagingPrimAdapterInterface,
): void {
  _apiSchemaAdapters.set(apiSchemaName, adapter)
  _layeredAdapters.clear()
}

function _WithApiSchemaAdapters(
  prim: UsdPrim, typed: UsdExecImagingPrimAdapterInterface | null,
): UsdExecImagingPrimAdapterInterface | null {
  if (_apiSchemaAdapters.size === 0) return typed
  const names = prim.getAppliedSchemas().filter(n => _apiSchemaAdapters.has(n))
  if (names.length === 0) return typed
  const parts = [...(typed ? [typed] : []), ...names.map(n => _apiSchemaAdapters.get(n)!)]
  // One shared instance per combination, as upstream shares adapter singletons.
  const key = parts.map(a => a.constructor.name).join('+') + '|' + names.join(',')
  let layered = _layeredAdapters.get(key)
  if (!layered) {
    layered = new _LayeredPrimAdapter(parts)
    _layeredAdapters.set(key, layered)
  }
  return layered
}

/** The typed adapter, then API schema adapters (strongest last). */
class _LayeredPrimAdapter extends UsdExecImagingPrimAdapterInterface {
  constructor(private readonly _parts: readonly UsdExecImagingPrimAdapterInterface[]) { super() }

  buildRequest(prim: UsdPrim, requestBuilder: UsdExecImagingRequestBuilderInterface): void {
    for (const a of this._parts) a.buildRequest(prim, requestBuilder)
  }

  getPrimData(
    primPath: string, requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
  ): HdContainerDataSource {
    // HdOverlayContainerDataSource: earlier inputs are stronger.
    const sources = this._parts.map(a => a.getPrimData(primPath, requestAccessor)).reverse()
    return HdOverlayContainerDataSource.new(...sources)
  }

  invalidatePrimData(
    primPath: string, valueKey: UsdExecImagingValueKey, invalidLocators: HdDataSourceLocatorSet,
  ): void {
    for (const a of this._parts) a.invalidatePrimData(primPath, valueKey, invalidLocators)
  }
}
