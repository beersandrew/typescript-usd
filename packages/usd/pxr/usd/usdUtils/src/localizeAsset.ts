// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/localizeAsset.cpp,
//  pxr/usd/usdUtils/localizeAsset.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/localizeAsset.{h,cpp} (OpenUSD 26.11.1).
//
// Localization resolves, opens and writes assets, which are asynchronous in
// this port, so UsdUtilsLocalizeAsset returns a Promise.

import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver, ResolverWriteMode as ArResolverWriteMode } from 'typescript-usd/ar'
import { _isDir, _pathExists } from 'typescript-usd/ar/_internal'
import { TF_CODING_ERROR, TF_WARN, TfStringCatPaths } from 'typescript-usd/tf'
import { UsdUtils_AssetLocalizationPackage } from './assetLocalizationPackage.ts'
import type { UsdUtilsProcessingFunc } from './userProcessingFunc.ts'

// localizeAsset.cpp:33-102
class UsdUtils_LocalizedAssetBuilder extends UsdUtils_AssetLocalizationPackage {
  #localizationRoot = ''

  override write(localizationRoot: string): Promise<boolean> {
    this.#localizationRoot = localizationRoot
    return super.write(this.#localizationRoot)
  }

  protected override async _writeToPackage(src: string, dest: string): Promise<boolean> {
    const resolver = ArGetResolver()

    const destPath = TfStringCatPaths(this.#localizationRoot, dest)
    const srcResolvedPath = await resolver.resolve(src)
    const destResolvedPath = await resolver.resolveForNewAsset(destPath)

    if (!srcResolvedPath.valid) {
      TF_WARN(`Failed to resolve source path: ${src}`)
      return false
    }

    if (!destResolvedPath.valid) {
      TF_WARN(`Failed to resolve source path: ${dest}`)
      return false
    }

    const sourceAsset = await resolver.openAsset(srcResolvedPath)
    const destAsset = await resolver.openAssetForWrite(destResolvedPath, ArResolverWriteMode.Replace)

    if (!sourceAsset) {
      TF_WARN(`Failed to open source asset: ${src}`)
      await destAsset?.close()
      return false
    }

    if (!destAsset) {
      TF_WARN(`Failed to open destination asset: ${dest}`)
      return false
    }

    // The copy loop (localizeAsset.cpp:83-96); the destination asset is
    // closed where upstream's shared_ptr releases it.
    try {
      const COPY_BUFFER_SIZE = 4096
      let dataRemaining = sourceAsset.getSize()
      let offset = 0

      while (dataRemaining > 0) {
        const chunkSize = Math.min(dataRemaining, COPY_BUFFER_SIZE)

        const buffer = await sourceAsset.read(chunkSize, offset)
        await destAsset.write(buffer, offset)

        dataRemaining -= chunkSize
        offset += chunkSize
      }
    } finally {
      await destAsset.close()
    }

    return true
  }
}

/**
 * Creates a localized version of the asset identified by `assetPath` and all
 * of its external dependencies in the directory `localizationDirectory`.
 * With `editLayersInPlace` the layers are modified in place; otherwise
 * anonymous copies of modified layers are written. `processingFunc`, when
 * given, is invoked on every asset path discovered: an ignored path is
 * removed from the layer and excluded from the localized package, a modified
 * one is written back, and added dependencies are included. Resolves to true
 * if the package was created successfully (localizeAsset.h:24-75;
 * localizeAsset.cpp:104-129).
 */
export async function UsdUtilsLocalizeAsset(
  assetPath: SdfAssetPath | string,
  localizationDir: string,
  editLayersInPlace = false,
  processingFunc?: UsdUtilsProcessingFunc,
): Promise<boolean> {
  if (_pathExists(localizationDir) && !_isDir(localizationDir)) {
    TF_CODING_ERROR(`Unable to localize to non directory path: ${localizationDir}`)
    return false
  }

  const builder = new UsdUtils_LocalizedAssetBuilder()

  builder.setEditLayersInPlace(editLayersInPlace)
  builder.setUserProcessingFunc(processingFunc)

  if (!await builder.build(
    assetPath instanceof SdfAssetPath ? assetPath : new SdfAssetPath(assetPath), '')) {
    return false
  }

  return builder.write(localizationDir)
}
