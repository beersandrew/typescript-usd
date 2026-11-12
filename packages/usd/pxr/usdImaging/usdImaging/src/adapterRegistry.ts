// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/adapterRegistry.cpp,
//  pxr/usdImaging/usdImaging/adapterRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/adapterRegistry.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream discovers adapter types through PlugRegistry, from the
// "Types" entries of each plugin's plugInfo.json that derive from
// UsdImagingPrimAdapter or UsdImagingAPISchemaAdapter
// (adapterRegistry.cpp:46-311), and manufactures them through TfType
// factories. Here each plugin registers the same entries (its plugInfo.json
// metadata plus a factory) with UsdImagingAdapterRegistry.RegisterTypes
// before the registry is first used; usdImaging's own entries are in
// plugInfo.ts. The registry constructor then applies the metadata exactly as
// upstream does (isInternal, primTypeName, includeDerivedPrimTypes,
// includeSchemaFamily, apiSchemaName).

import { MakeTokens as TfMakeTokens, Type as TfType } from 'typescript-usd/tf'
import { SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'
import type { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import type { UsdImagingPrimAdapter } from './primAdapter.ts'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR } from './tfDiagnostic.ts'

/** adapterRegistry.h:24-27 USD_IMAGING_ADAPTER_KEY_TOKENS */
export const UsdImagingAdapterKeyTokens = TfMakeTokens({
  instanceAdapterKey: '__instanceAdapter',
  drawModeAdapterKey: '__drawModeAdapter',
})

/** One "Types" entry of a plugInfo.json for an adapter type: its metadata and
 *  the factory TfType::GetFactory would return. */
export interface UsdImagingAdapterTypeInfo {
  /** The adapter's C++ type name (the "Types" key). */
  typeName: string
  isInternal?: boolean
  /** Prim adapters: the prim type (schema identifier) it adapts. */
  primTypeName?: string
  /** API schema adapters: the API schema it adapts; '' for keyless. */
  apiSchemaName?: string
  includeDerivedPrimTypes?: boolean
  includeSchemaFamily?: boolean
  primAdapterFactory?: () => UsdImagingPrimAdapter
  apiSchemaAdapterFactory?: () => UsdImagingAPISchemaAdapter
}

const _registeredTypes: UsdImagingAdapterTypeInfo[] = []

/** adapterRegistry.h:38-132 */
export class UsdImagingAdapterRegistry {
  private static _instance: UsdImagingAdapterRegistry | undefined

  private readonly _typeMap = new Map<string, UsdImagingAdapterTypeInfo>()
  private readonly _adapterKeys: string[] = []
  private readonly _apiSchemaTypeMap = new Map<string, UsdImagingAdapterTypeInfo>()
  private readonly _apiSchemaAdapterKeys: string[] = []
  private readonly _keylessApiSchemaAdapterTypes: UsdImagingAdapterTypeInfo[] = []

  /** Registers adapter types, as a plugin's plugInfo.json declares them (see
   *  the header). Must run before the registry is first used. */
  static registerTypes(types: readonly UsdImagingAdapterTypeInfo[]): void {
    if (UsdImagingAdapterRegistry._instance) {
      TF_CODING_ERROR('UsdImagingAdapterRegistry: adapter types registered after the registry was created')
    }
    _registeredTypes.push(...types)
  }

  /** TfSingleton<UsdImagingAdapterRegistry>::GetInstance */
  static GetInstance(): UsdImagingAdapterRegistry {
    return UsdImagingAdapterRegistry._instance ??= new UsdImagingAdapterRegistry()
  }

  /** adapterRegistry.cpp:33-39 (USDIMAGING_ENABLE_PLUGINS defaults to on). */
  static areExternalPluginsEnabled(): boolean {
    return true
  }

  /** adapterRegistry.cpp:41-311 */
  private constructor() {
    const includeDerivedPrimTypes: string[] = []
    const includeSchemaFamilies: [string, boolean][] = []

    // Fetch all plugins with adapters (prim adapters first).
    for (const info of _registeredTypes) {
      if (!info.primAdapterFactory) continue
      // adapterRegistry.cpp:76-100
      if (!(UsdImagingAdapterRegistry.areExternalPluginsEnabled() || info.isInternal)) continue
      if (info.primTypeName === undefined) {
        TF_RUNTIME_ERROR(`[PluginDiscover] primTypeName metadata was not present for plugin '${info.typeName}'\n`)
        continue
      }
      const primTypeName = info.primTypeName
      if (this._typeMap.has(primTypeName)) {
        TF_CODING_ERROR(`[PluginDiscover] A prim adapter for primType '${primTypeName}' already exists! ` +
          'Overriding prim adapters at runtime is not supported. The last discovered adapter ' +
          `(${info.typeName}) will be used. The previously discovered adapter ` +
          `(${this._typeMap.get(primTypeName)!.typeName}) will be discarded.`)
      }
      this._typeMap.set(primTypeName, info)
      const includeDerived = info.includeDerivedPrimTypes === true
      if (includeDerived) includeDerivedPrimTypes.push(primTypeName)
      if (info.includeSchemaFamily === true) includeSchemaFamilies.push([primTypeName, includeDerived])
    }

    // adapterRegistry.cpp:173-201: schema families.
    for (const [familyName, includeDerived] of includeSchemaFamilies) {
      const adapterType = this._typeMap.get(familyName)!
      for (const schemaInfo of UsdSchemaRegistry.findSchemaInfosInFamily(familyName)) {
        if (!this._typeMap.has(schemaInfo.identifier)) {
          this._typeMap.set(schemaInfo.identifier, adapterType)
          const typeName = UsdSchemaRegistry.getSchemaTypeName(schemaInfo.type)
          if (includeDerived) includeDerivedPrimTypes.push(typeName)
        }
      }
    }

    // adapterRegistry.cpp:203-240
    const processDerivedTypes = (tm: Map<string, UsdImagingAdapterTypeInfo>): void => {
      for (const primTypeName of includeDerivedPrimTypes) {
        const primType = UsdSchemaRegistry.getTypeFromSchemaTypeName(primTypeName)
        if (primType.isUnknown()) continue
        const adapterType = tm.get(primTypeName)!
        const derivedTypesStack: TfType[] = [...primType.getDirectlyDerivedTypes()]
        while (derivedTypesStack.length > 0) {
          const derivedType = derivedTypesStack.pop()!
          const typeName = UsdSchemaRegistry.getSchemaTypeName(derivedType)
          if (typeName === '') continue
          if (!tm.has(typeName)) {
            tm.set(typeName, adapterType)
            derivedTypesStack.push(...derivedType.getDirectlyDerivedTypes())
          }
        }
      }
    }
    processDerivedTypes(this._typeMap)
    for (const key of this._typeMap.keys()) this._adapterKeys.push(key)

    // adapterRegistry.cpp:247-308: API schema adapters.
    includeDerivedPrimTypes.length = 0
    for (const info of _registeredTypes) {
      if (!info.apiSchemaAdapterFactory) continue
      if (!(UsdImagingAdapterRegistry.areExternalPluginsEnabled() || info.isInternal)) continue
      if (info.apiSchemaName === undefined) {
        TF_RUNTIME_ERROR(`[PluginDiscover] apiSchemaName metadata was not present for plugin '${info.typeName}'\n`)
        continue
      }
      const apiSchemaName = info.apiSchemaName
      // Empty apiSchemaName indicates a keyless adapter.
      if (apiSchemaName === '') {
        this._keylessApiSchemaAdapterTypes.push(info)
        continue
      }
      this._apiSchemaTypeMap.set(apiSchemaName, info)
      if (info.includeDerivedPrimTypes === true) includeDerivedPrimTypes.push(apiSchemaName)
    }
    processDerivedTypes(this._apiSchemaTypeMap)
    for (const key of this._apiSchemaTypeMap.keys()) this._apiSchemaAdapterKeys.push(key)
  }

  /** adapterRegistry.cpp:313-321 */
  hasAdapter(adapterKey: string): boolean {
    if (adapterKey === UsdImagingAdapterKeyTokens.instanceAdapterKey) {
      return true
    }
    return this._typeMap.has(adapterKey)
  }

  /** adapterRegistry.cpp:323-327 */
  getAdapterKeys(): readonly string[] {
    return this._adapterKeys
  }

  /** adapterRegistry.cpp:385-397. The instance adapter key manufactures the
   *  UsdImagingDelegate's instance adapter, which is not ported (primAdapter.ts
   *  header): it returns undefined. */
  constructAdapter(adapterKey: string): UsdImagingPrimAdapter | undefined {
    const info = this._typeMap.get(adapterKey)
    if (!info) return undefined
    return info.primAdapterFactory!()
  }

  /** adapterRegistry.cpp:399-410 */
  hasAPISchemaAdapter(adapterKey: string): boolean {
    return this._apiSchemaTypeMap.has(adapterKey)
  }

  /** adapterRegistry.cpp:412-416 */
  getAPISchemaAdapterKeys(): readonly string[] {
    return this._apiSchemaAdapterKeys
  }

  /** adapterRegistry.cpp:418-424 */
  constructAPISchemaAdapter(adapterKey: string): UsdImagingAPISchemaAdapter | undefined {
    const info = this._apiSchemaTypeMap.get(adapterKey)
    if (!info) return undefined
    return info.apiSchemaAdapterFactory!()
  }

  /** adapterRegistry.cpp:426-444 */
  constructKeylessAPISchemaAdapters(): UsdImagingAPISchemaAdapter[] {
    const result: UsdImagingAPISchemaAdapter[] = []
    for (const info of this._keylessApiSchemaAdapterTypes) {
      const adapter = info.apiSchemaAdapterFactory!()
      if (adapter) result.push(adapter)
    }
    return result
  }
}
