// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/dependencies.cpp,
//  pxr/usd/usdUtils/dependencies.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/dependencies.{h,cpp} (OpenUSD 26.11.1).
//
// The vectors upstream fills through output pointers are output arrays here,
// as optional parameters in the same positions. Dependency discovery opens
// layers and resolves asset paths, which are asynchronous in this port, so
// UsdUtilsExtractExternalReferences and UsdUtilsComputeAllDependencies
// return Promises; UsdUtilsModifyAssetPaths does too, because a processing
// step it shares with them is asynchronous.

import { AssetPath as SdfAssetPath, Layer, SdfComputeAssetPathRelativeToLayer } from 'typescript-usd/sdf'
import { _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import {
  GetResolver as ArGetResolver, IsPackageRelativePath as ArIsPackageRelativePath,
} from 'typescript-usd/ar'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { TF_WARN } from 'typescript-usd/tf'
import {
  UsdUtils_ExtractExternalReferences, UsdUtils_LocalizationContext, UsdUtils_LocalizationReferenceType,
} from './assetLocalization.ts'
import {
  UsdUtils_DependencyType, UsdUtils_ReadOnlyLocalizationClient, UsdUtils_WritableLocalizationClient,
} from './assetLocalizationDelegate.ts'
import { UsdUtilsDependencyInfo, type UsdUtilsProcessingFunc } from './userProcessingFunc.ts'

/** Structure which controls aspects of the UsdUtilsExtractExternalReferences
 *  function (dependencies.h:21-41). */
export class UsdUtilsExtractExternalReferencesParams {
  #resolveUdimPaths = false

  /** Specifies whether UDIM template paths should be resolved when
   *  extracting references. If true, the resolved paths for all discovered
   *  UDIM tiles will be included in the references bucket and the template
   *  path will be discarded. If false, no resolution will take place and the
   *  template path will appear in the references bucket
   *  (dependencies.h:24-32). */
  setResolveUdimPaths(resolveUdimPaths: boolean): void { this.#resolveUdimPaths = resolveUdimPaths }

  getResolveUdimPaths(): boolean { return this.#resolveUdimPaths }
}

/**
 * Parses the file at `filePath`, identifying external references, and
 * sorting them into separate type-based buckets: sublayers, references (prim
 * references, value clip references and values from asset path attributes)
 * and payloads. No recursive chasing of dependencies is performed
 * (dependencies.h:43-64; dependencies.cpp:30-45).
 */
export function UsdUtilsExtractExternalReferences(
  filePath: string,
  subLayers?: string[],
  references?: string[],
  payloads?: string[],
  params: UsdUtilsExtractExternalReferencesParams = new UsdUtilsExtractExternalReferencesParams(),
): Promise<void> {
  return UsdUtils_ExtractExternalReferences(filePath, UsdUtils_LocalizationReferenceType.All,
    subLayers, references, payloads, params)
}

// dependencies.cpp:47-163
class UsdUtils_ComputeAllDependenciesClient extends UsdUtils_ReadOnlyLocalizationClient {
  readonly layers = new Set<Layer>()
  readonly assets = new Set<string>()
  readonly unresolvedPaths = new Set<string>()

  constructor(readonly processingFunc: UsdUtilsProcessingFunc | undefined) { super() }

  protected override async _processDependency(
    layer: Layer, depInfo: UsdUtilsDependencyInfo, dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo> {
    if (this.processingFunc) {
      const processedInfo = await this.processingFunc(layer, depInfo)

      if (processedInfo.getAssetPath() === '') return new UsdUtilsDependencyInfo()

      // When using a processing function with template asset paths such as
      // clips or udim, if the user does not modify the asset path, we do not
      // want to place it in the resulting arrays. We always want to add
      // dependencies, however
      const originalPathIsTemplate = depInfo.getDependencies().length > 0
      if (!processedInfo.equals(depInfo) || !originalPathIsTemplate) {
        await this.placeAsset(layer, processedInfo.getAssetPath(), dependencyType)
      }

      for (const dependency of processedInfo.getDependencies()) {
        await this.placeAsset(layer, dependency, dependencyType)
      }

      return processedInfo
    }

    if (depInfo.getDependencies().length === 0) {
      await this.placeAsset(layer, depInfo.getAssetPath(), dependencyType)
    } else {
      for (const dependency of depInfo.getDependencies()) {
        await this.placeAsset(layer, dependency, dependencyType)
      }
    }

    return depInfo
  }

  // dependencies.cpp:98-115
  pathShouldResolveForLayer(layer: Layer, _resolvedPath: string, dependencyType: UsdUtils_DependencyType): boolean {
    // XXX: We do not currently support resolving clip template asset paths
    // from packages in the asset localization code (refer to
    // UsdUtils_LocalizationContext::_GetTemplatedClips). In this case we do
    // not want to treat these paths as unresolved.
    if (dependencyType !== UsdUtils_DependencyType.ClipTemplateAssetPath) return true
    return !ArIsPackageRelativePath(layer.realPath) && !(layer.getFileFormat()?.isPackage() ?? false)
  }

  // dependencies.cpp:117-158
  async placeAsset(layer: Layer, dependency: string, dependencyType: UsdUtils_DependencyType): Promise<void> {
    const anchoredPath = SdfComputeAssetPathRelativeToLayer(layer, dependency)

    const splitIdentifier = _sdfSplitLayerIdentifier(anchoredPath)

    const resolvedPath = (await ArGetResolver().resolve(splitIdentifier.assetPath)).toString()

    if (resolvedPath === '') {
      if (this.pathShouldResolveForLayer(layer, resolvedPath, dependencyType)) {
        this.unresolvedPaths.add(anchoredPath)
      }
    } else if (UsdStage.isSupportedFile(anchoredPath)) {
      const dependencyLayer = await Layer.findOrOpen(anchoredPath)
      if (dependencyLayer) {
        this.layers.add(dependencyLayer)

        // Note: for layers we also want to include any additional asset
        // dependencies.
        for (const externalDependency of dependencyLayer.getExternalAssetDependencies()) {
          this.assets.add(externalDependency)
        }
      } else {
        TF_WARN(`Failed to open dependency layer: ${dependency} (${anchoredPath})`)
      }
    } else {
      this.assets.add(resolvedPath)
    }
  }
}

// std::string operator< ordering.
function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Recursively computes all the dependencies of the given asset and populates
 * `layers` with all the dependencies that can be opened as an SdfLayer, the
 * resolved non-layer dependencies in `assets`, and the unresolved (layer and
 * non-layer) asset paths in `unresolvedPaths`. `processingFunc`, when given,
 * is invoked on every asset path discovered; its changes are not written to
 * the processed layers. Resolves to true if the given asset was resolved
 * correctly (dependencies.h:66-92; dependencies.cpp:165-206).
 *
 * As upstream, `layers` is appended to (the root layer, then the other
 * layers sorted by real path) while `assets` and `unresolvedPaths` are
 * replaced with their sorted contents.
 */
export async function UsdUtilsComputeAllDependencies(
  assetPath: SdfAssetPath | string,
  outLayers?: Layer[],
  outAssets?: string[],
  outUnresolvedPaths?: string[],
  processingFunc?: UsdUtilsProcessingFunc,
): Promise<boolean> {
  const rootLayer = await Layer.findOrOpen(
    assetPath instanceof SdfAssetPath ? assetPath.getAssetPath() : assetPath)
  if (!rootLayer) return false

  const client = new UsdUtils_ComputeAllDependenciesClient(processingFunc)
  const context = new UsdUtils_LocalizationContext(client)
  context.setMetadataFilteringEnabled(true)

  if (!await context.process(rootLayer)) return false

  if (outLayers) {
    outLayers.push(rootLayer)
    outLayers.push(...[...client.layers].sort((a, b) => byteOrder(a.realPath, b.realPath)))
  }
  if (outAssets) outAssets.splice(0, outAssets.length, ...[...client.assets].sort(byteOrder))
  if (outUnresolvedPaths) {
    outUnresolvedPaths.splice(0, outUnresolvedPaths.length, ...[...client.unresolvedPaths].sort(byteOrder))
  }

  return true
}

/** Callback that is used to modify asset paths in a layer: the returned
 *  value is the new value authored in the layer, and an empty string
 *  removes the value from the layer (dependencies.h:94-99). */
export type UsdUtilsModifyAssetPathFn = (assetPath: string) => string

// dependencies.cpp:208-227
class UsdUtils_UsdUtilsModifyAssetPathsClient extends UsdUtils_WritableLocalizationClient {
  constructor(readonly modifyPathFn: UsdUtilsModifyAssetPathFn) { super() }

  protected override async _processDependency(
    _layer: Layer, depInfo: UsdUtilsDependencyInfo, _dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo> {
    return new UsdUtilsDependencyInfo(this.modifyPathFn(depInfo.getAssetPath()))
  }
}

/**
 * Helper function that visits every asset path in `layer`, calls `modifyFn`
 * and replaces the value with the return value of `modifyFn`, modifying the
 * layer in place. With `keepEmptyPathsInArrays`, empty asset paths are
 * written into arrays even if `modifyFn` returns an empty string
 * (dependencies.h:101-118; dependencies.cpp:229-242).
 */
export async function UsdUtilsModifyAssetPaths(
  layer: Layer,
  modifyFn: UsdUtilsModifyAssetPathFn,
  keepEmptyPathsInArrays = false,
): Promise<void> {
  const client = new UsdUtils_UsdUtilsModifyAssetPathsClient(modifyFn)
  client.setEditLayersInPlace(true)
  client.setKeepEmptyPathsInArrays(keepEmptyPathsInArrays)

  const context = new UsdUtils_LocalizationContext(client)
  context.setRecurseLayerDependencies(false)
  await context.process(layer)
}
