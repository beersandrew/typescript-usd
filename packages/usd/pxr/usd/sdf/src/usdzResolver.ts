// Ported from OpenUSD 26.11.1: pxr/usd/sdf/usdzResolver.cpp,
//  pxr/usd/sdf/usdzResolver.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/usdzResolver.cpp — Sdf_UsdzResolver, the package
// resolver Ar uses for the packaged portion of a .usdz package-relative path
// (plugInfo.json "Sdf_UsdzResolver": extensions ["usdz"]).

import {
  type Resolver as ArResolver,
  type ResolverContext as ArResolverContext,
  Asset as ArAsset,
  GetResolver as ArGetResolver,
  InMemoryAsset as ArInMemoryAsset,
  DefinePackageResolver as ArDefinePackageResolver,
  PackageResolver as ArPackageResolver,
  ResolvedPath as ArResolvedPath,
} from 'typescript-usd/ar'
import { _getPackageResolverInstance, _getPackageResolverCacheData, _getPackageResolverCacheContext } from 'typescript-usd/ar/_internal'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { UsdZipFile } from './zipFile.ts'

// Sdf_UsdzResolverCache::_OpenZipFile (usdzResolver.cpp:61-70): the package
// asset is opened through ArGetResolver, so a nested package path opens the
// enclosing package's entry.
async function openZipFile(packagePath: string, context?: ArResolverContext): Promise<UsdZipFile | undefined> {
  const asset = await ArGetResolver().openAsset(new ArResolvedPath(packagePath), context)
  if (!asset) return undefined
  const bytes = await asset.getBuffer()
  if (!UsdZipFile.isZip(bytes)) return undefined
  try {
    return UsdZipFile.fromBytes(bytes)
  } catch {
    return undefined
  }
}

export class Sdf_UsdzResolver extends ArPackageResolver {
  // Sdf_UsdzResolver::Resolve (usdzResolver.cpp:108-123): the packaged path if
  // the package holds that entry.
  async resolve(packagePath: string, packagedPath: string, context?: ArResolverContext): Promise<string> {
    const zipFile = await this.findOrOpen(packagePath, ArGetResolver(), context, () => openZipFile(packagePath, context))
    if (!zipFile) return ''
    return zipFile.has(packagedPath) ? packagedPath : ''
  }

  // Sdf_UsdzResolver::OpenAsset (usdzResolver.cpp:196-233): only stored
  // (uncompressed) entries can be opened.
  async openAsset(packagePath: string, packagedPath: string, context?: ArResolverContext): Promise<ArAsset | undefined> {
    const zipFile = await this.findOrOpen(packagePath, ArGetResolver(), context, () => openZipFile(packagePath, context))
    if (!zipFile) return undefined
    const entry = zipFile.getEntry(packagedPath)
    if (!entry || entry.compressionMethod !== 0) return undefined
    const bytes = zipFile._extractStored(packagedPath)
    return bytes ? new ArInMemoryAsset(bytes) : undefined
  }

  // usdzResolver.cpp:29-90 shares the archive and pending open within a
  // cache scope. Context/resolver partitioning preserves explicit async lanes.
  findOrOpen(path: string, resolver: ArResolver, context: ArResolverContext | undefined,
    read: () => Promise<UsdZipFile | undefined>): Promise<UsdZipFile | undefined> {
    const cache = _getPackageResolverCacheData(this, context) as PackageCache | undefined
    if (!cache) return read()
    let contexts = cache.get(resolver)
    if (!contexts) { contexts = new Map(); cache.set(resolver, contexts) }
    const key = _getPackageResolverCacheContext(context)
    let packages = contexts.get(key)
    if (!packages) { packages = new Map(); contexts.set(key, packages) }
    let pending = packages.get(path)
    if (!pending) {
      pending = read(); packages.set(path, pending)
      const entries = packages
      void pending.catch(() => { if (entries.get(path) === pending) entries.delete(path) })
    }
    return pending
  }
  beginCacheScope(parent?: unknown): unknown { return parent instanceof Map ? parent : new Map() }
  endCacheScope(_data: unknown): void {}
}
type PackageCache = Map<ArResolver, Map<ArResolverContext | undefined, Map<string, Promise<UsdZipFile | undefined>>>>
// usdzResolver.cpp:89 (AR_DEFINE_PACKAGE_RESOLVER(Sdf_UsdzResolver,
// ArPackageResolver)) and the Sdf_UsdzResolver entry of sdf/plugInfo.json
// (plugInfo.json:67-75).
// Sdf's file formats are part of this build and register directly
// (fileFormat.ts), so the plugin declares only the package resolver type.
ArDefinePackageResolver('Sdf_UsdzResolver', Sdf_UsdzResolver)
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{
    Name: 'sdf',
    Type: 'library',
    Info: { Types: { Sdf_UsdzResolver: { bases: ['ArPackageResolver'], extensions: ['usdz'] } } },
  }],
})

/** Internal package-aware layer/Hio path shares the registered resolver cache. */
export function _findOrOpenPackage(path: string, resolver: ArResolver, context: ArResolverContext | undefined,
  read: () => Promise<UsdZipFile | undefined>): Promise<UsdZipFile | undefined> {
  const packageResolver = _getPackageResolverInstance('Sdf_UsdzResolver') as Sdf_UsdzResolver
  return packageResolver.findOrOpen(path, resolver, context, read)
}
