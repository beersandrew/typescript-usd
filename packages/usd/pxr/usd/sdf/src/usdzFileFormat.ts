// Ported from OpenUSD 26.11.1: pxr/usd/sdf/usdzFileFormat.cpp,
//  pxr/usd/sdf/usdzFileFormat.h, pxr/usd/sdf/usdzResolver.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/usdzFileFormat.cpp + usdzResolver.cpp — reading
// through USDZ packages: one parsed archive serves the package's layer and
// every asset (texture, sublayer) referenced inside it. The zip container
// itself is zipFile.ts (SdfZipFile); this module is the package-aware read
// path over it.

import { UsdZipFile } from './zipFile.ts'
// Registers Sdf_UsdzResolver for .usdz package-relative paths.
import { _findOrOpenPackage } from './usdzResolver.ts'
import { GetResolver } from 'typescript-usd/ar'
import {
  type ArResolver,
  type ArResolverContext,
  openAssetBytes,
  splitPackagePath,
} from 'typescript-usd/ar/_internal'

/** Prime the active scope from the archive already parsed for a root layer. */
export function _cachePackage(packagePath: string, zip: UsdZipFile, resolver = GetResolver(), context?: ArResolverContext): void {
  void _findOrOpenPackage(packagePath, resolver, context, async () => zip)
}
export async function openZip(packagePath: string, resolver = GetResolver(), context?: ArResolverContext): Promise<UsdZipFile> {
  const zip = await _findOrOpenPackage(packagePath, resolver, context,
    async () => UsdZipFile.fromBytes(await openAssetBytes(packagePath, resolver, context)))
  if (!zip) throw new Error(`Could not open USDZ package: ${packagePath}`)
  return zip
}

export async function readBytes(filePath: string, resolver?: ArResolver, context?: ArResolverContext): Promise<Uint8Array> {
  const pkg = splitPackagePath(filePath)
  if (pkg) {
    const zip = await openZip(pkg.packagePath, resolver, context)
    return zip.extract(pkg.innerPath)
  }
  return openAssetBytes(filePath, resolver, context)
}

// Reads raw asset bytes (textures etc.) through the same pluggable reader
// used for layers; understands pkg.usdz[inner] package paths.
export async function readAsset(path: string, resolver?: ArResolver, context?: ArResolverContext): Promise<Uint8Array> {
  return readBytes(path, resolver, context)
}
