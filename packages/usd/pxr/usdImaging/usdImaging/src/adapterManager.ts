// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/adapterManager.cpp,
//  pxr/usdImaging/usdImaging/adapterManager.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/adapterManager.{h,cpp}
// (OpenUSD 26.11.1).

import type { ContainerDataSource as HdContainerDataSource, DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import { SchemaRegistry as UsdSchemaRegistry, type Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingAdapterRegistry } from './adapterRegistry.ts'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

type UsdPrimTypeInfo = ReturnType<UsdPrim['getPrimTypeInfo']>

/** adapterManager.cpp:25-70: wraps a prim adapter as an API schema adapter. */
class _PrimAdapterAPISchemaAdapter extends UsdImagingAPISchemaAdapter {
  constructor(private readonly _primAdapter: UsdImagingPrimAdapter) { super() }

  override getImagingSubprims(prim: UsdPrim, _appliedInstanceName: string): string[] {
    return this._primAdapter.getImagingSubprims(prim)
  }

  override getImagingSubprimType(prim: UsdPrim, subprim: string, _appliedInstanceName: string): string {
    return this._primAdapter.getImagingSubprimType(prim, subprim)
  }

  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, _appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    return this._primAdapter.getImagingSubprimData(prim, subprim, stageGlobals)
  }

  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, _appliedInstanceName: string,
    properties: readonly string[], invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return this._primAdapter.invalidateImagingSubprim(prim, subprim, properties, invalidationType)
  }
}

/** adapterManager.cpp:72-102: the API schema adapter for prims with no prim
 *  adapter (typeless prims and prim types without an adapter). */
class _BasePrimAdapterAPISchemaAdapter extends UsdImagingAPISchemaAdapter {
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, _appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourcePrim.new(prim.path, prim, stageGlobals)
    }
    return undefined
  }

  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, _appliedInstanceName: string,
    properties: readonly string[], invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    return UsdImagingDataSourcePrim.invalidate(prim, subprim, properties, invalidationType)
  }
}

/** adapterManager.h:34-54 */
export interface UsdImaging_AdapterEntry {
  adapter: UsdImagingAPISchemaAdapter
  appliedInstanceName: string
}

/** adapterManager.h:57-65 */
export interface UsdImaging_AdaptersEntry {
  /** All adapters: keyless API schema adapters, the prim adapter (wrapped)
   *  and the adapters of the applied API schemas. */
  allAdapters: UsdImaging_AdapterEntry[]
  /** The prim adapter, if any. */
  primAdapter: UsdImagingPrimAdapter | undefined
}

interface _WrappedPrimAdapterEntry {
  primAdapter: UsdImagingPrimAdapter | undefined
  apiSchemaAdapter: UsdImagingAPISchemaAdapter
}

let _basePrimAdapter: UsdImagingAPISchemaAdapter | undefined

/** adapterManager.h:24-115: computes and caches the prim and API schema
 *  adapters of a prim, keyed by its UsdPrimTypeInfo. */
export class UsdImaging_AdapterManager {
  private readonly _keylessAPISchemaAdapters: UsdImaging_AdapterEntry[]
  private readonly _primTypeToWrappedPrimAdapterEntry = new Map<string, _WrappedPrimAdapterEntry>()
  private readonly _schemaNameToAPISchemaAdapter = new Map<string, UsdImagingAPISchemaAdapter | undefined>()
  private readonly _typeInfoToAdaptersEntry = new Map<UsdPrimTypeInfo, UsdImaging_AdaptersEntry>()

  private static readonly _empty: UsdImaging_AdaptersEntry = { allAdapters: [], primAdapter: undefined }

  /** adapterManager.cpp:106-112 */
  constructor() {
    this._keylessAPISchemaAdapters = UsdImagingAdapterRegistry.GetInstance()
      .constructKeylessAPISchemaAdapters()
      .map(adapter => ({ adapter, appliedInstanceName: '' }))
  }

  /** adapterManager.cpp:114-119 */
  Reset(): void {
    this._primTypeToWrappedPrimAdapterEntry.clear()
    this._schemaNameToAPISchemaAdapter.clear()
    this._typeInfoToAdaptersEntry.clear()
  }

  /** adapterManager.cpp:120-129 */
  lookupAdapters(prim: UsdPrim | undefined): UsdImaging_AdaptersEntry {
    if (!prim) {
      return UsdImaging_AdapterManager._empty
    }
    return this._lookupAdapters(prim.getPrimTypeInfo())
  }

  /** adapterManager.cpp:131-147 */
  private _lookupAdapters(typeInfo: UsdPrimTypeInfo): UsdImaging_AdaptersEntry {
    const it = this._typeInfoToAdaptersEntry.get(typeInfo)
    if (it) return it
    const entry = this._computeAdapters(typeInfo)
    this._typeInfoToAdaptersEntry.set(typeInfo, entry)
    return entry
  }

  /** adapterManager.cpp:149-186 */
  private _computeAdapters(typeInfo: UsdPrimTypeInfo): UsdImaging_AdaptersEntry {
    const result: UsdImaging_AdaptersEntry = { allAdapters: [], primAdapter: undefined }

    // Compute all applied API schemas, including the built-in ones.
    const appliedSchemas = typeInfo.getPrimDefinition().getAppliedAPISchemas()

    // Keyless API schema adapters first.
    result.allAdapters.push(...this._keylessAPISchemaAdapters)

    // Then the (wrapped) prim adapter.
    const entry = this._lookupWrappedPrimAdapter(typeInfo.getSchemaTypeName())
    result.primAdapter = entry.primAdapter
    result.allAdapters.push({ adapter: entry.apiSchemaAdapter, appliedInstanceName: '' })

    // Then the API schema adapters for each applied API schema.
    for (const schemaToken of appliedSchemas) {
      const [typeName, instanceName] = UsdSchemaRegistry.getTypeNameAndInstance(schemaToken)
      const a = this._lookupAPISchemaAdapter(typeName)
      if (a) {
        result.allAdapters.push({ adapter: a, appliedInstanceName: instanceName })
      }
    }

    return result
  }

  /** adapterManager.cpp:188-203 */
  private _lookupWrappedPrimAdapter(primType: string): _WrappedPrimAdapterEntry {
    const it = this._primTypeToWrappedPrimAdapterEntry.get(primType)
    if (it) return it
    const entry = this._computeWrappedPrimAdapter(primType)
    this._primTypeToWrappedPrimAdapterEntry.set(primType, entry)
    return entry
  }

  /** adapterManager.cpp:205-226 */
  private _computeWrappedPrimAdapter(schemaName: string): _WrappedPrimAdapterEntry {
    const reg = UsdImagingAdapterRegistry.GetInstance()
    const primAdapter = reg.constructAdapter(schemaName)
    if (primAdapter) {
      return { primAdapter, apiSchemaAdapter: new _PrimAdapterAPISchemaAdapter(primAdapter) }
    }
    return { primAdapter: undefined, apiSchemaAdapter: _basePrimAdapter ??= new _BasePrimAdapterAPISchemaAdapter() }
  }

  /** adapterManager.cpp:228-244 */
  private _lookupAPISchemaAdapter(schemaName: string): UsdImagingAPISchemaAdapter | undefined {
    if (this._schemaNameToAPISchemaAdapter.has(schemaName)) {
      return this._schemaNameToAPISchemaAdapter.get(schemaName)
    }
    const adapter = UsdImagingAdapterRegistry.GetInstance().constructAPISchemaAdapter(schemaName)
    this._schemaNameToAPISchemaAdapter.set(schemaName, adapter)
    return adapter
  }
}
