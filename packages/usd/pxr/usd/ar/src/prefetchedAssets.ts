// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfx.cpp,
//  pxr/usd/ar/resolver.h, pxr/usd/ar/resolverScopedCache.h,
//  pxr/usdImaging/plugin/sdrGlslfx/parserPlugin.cpp
// Copyright 2016, 2019, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Synchronous resolution and reads of assets read ahead through Ar.
//
// Upstream ArResolver::Resolve and ArResolver::OpenAsset are synchronous
// (ar/resolver.h), and so are the clients that resolve and read assets in the
// middle of Hydra's synchronous scene processing, e.g. HioGlslfx opening a
// glslfx file a scene ships (hio/glslfx.cpp:151-170,232-250) for SdrGlslfx's
// parser plugin (usdImaging/plugin/sdrGlslfx/parserPlugin.cpp:180-182).
// Browser I/O is asynchronous, which is the one adaptation here: such a
// client registers an asset prefetcher for the file extensions it reads
// synchronously; code that resolves asset paths asynchronously anyway
// (UsdStage resolving asset-valued attributes) hands each resolved path to
// _ArPrefetchAsset (or, for the clients that read the assets of particular
// attributes, e.g. the cards draw mode reading its textures' metadata,
// _ArPrefetchAssetForProperty); the prefetcher reads the asset, and whatever that asset
// in turn needs, through Ar (_ArReadAhead), which records the resolutions and
// the contents here; and the client's synchronous call reads them back with
// _ArResolveSync and _ArOpenAssetSync. Files the default resolver can read
// synchronously (plugin resource files, platformFilesystem.ts) need no read
// ahead.
//
// The records are keyed by asset path and resolved path, as an ArResolver
// scoped cache is (resolverScopedCache.h); they live for the process.

import type { ArAsset } from './asset.ts'
import { ArResolvedPath } from './resolvedPath.ts'
import { ArGetResolver, _resolveFilesystemPathSync } from './resolver.ts'
import { _pathExists, _readFileSync } from './platformFilesystem.ts'

/** How a prefetcher resolves and opens assets: the resolver (and context)
 *  of the code that asked for the read ahead. */
export interface _ArAssetReader {
  resolve(assetPath: string): Promise<ArResolvedPath>
  openAsset(resolvedPath: ArResolvedPath): Promise<ArAsset | undefined>
}

/** Reads the asset at a resolved path, and whatever it needs, ahead of a
 *  synchronous read. */
export type _ArAssetPrefetcher = (resolvedPath: ArResolvedPath, reader: _ArAssetReader) => Promise<void>

const prefetchers = new Map<string, _ArAssetPrefetcher>()
const propertyPrefetchers = new Map<string, _ArAssetPrefetcher>()
const inFlight = new Map<string, Promise<void>>()
const resolvedPaths = new Map<string, ArResolvedPath>()
const contents = new Map<string, Uint8Array>()
// Resolved paths read ahead that could not be opened.
const unopened = new Set<string>()

/** ArGetResolver() with the context bound when it is called. */
export function _ArDefaultAssetReader(): _ArAssetReader {
  const resolver = ArGetResolver()
  return {
    resolve: assetPath => resolver.resolve(assetPath),
    openAsset: resolvedPath => resolver.openAsset(resolvedPath),
  }
}

/** Registers `prefetcher` for assets with these (case-insensitive) file
 *  extensions. The first registration of an extension wins. */
export function _ArRegisterAssetPrefetcher(extensions: readonly string[], prefetcher: _ArAssetPrefetcher): void {
  for (const extension of extensions) {
    const key = extension.toLowerCase()
    if (!prefetchers.has(key)) prefetchers.set(key, prefetcher)
  }
}

/** True when a prefetcher is registered for the asset's extension. */
export function _ArHasAssetPrefetcher(resolvedPath: string): boolean {
  return prefetchers.has(ArGetResolver().getExtension(resolvedPath).toLowerCase())
}

/**
 * Runs the prefetcher registered for the extension of `resolvedPath`, if
 * any. Never rejects: an asset that cannot be read ahead is missing to the
 * synchronous read, which reports it as upstream reports a missing file.
 */
export function _ArPrefetchAsset(resolvedPath: ArResolvedPath, reader: _ArAssetReader = _ArDefaultAssetReader()): Promise<void> {
  const path = resolvedPath.toString()
  if (!resolvedPath.valid) return Promise.resolve()
  const prefetcher = prefetchers.get(ArGetResolver().getExtension(path).toLowerCase())
  if (!prefetcher) return Promise.resolve()
  let pending = inFlight.get(path)
  if (!pending) {
    pending = prefetcher(resolvedPath, reader).catch(() => {}).finally(() => inFlight.delete(path))
    inFlight.set(path, pending)
  }
  return pending
}

/** Reads ahead what a synchronous client will resolve for an authored asset
 *  path that does not itself resolve to an asset, e.g. a UDIM pattern whose
 *  tiles UsdShadeUdimUtils resolves one by one (usdShade/udimUtils.cpp:58-98).
 *  `anchor` anchors a path to the layer that authored it
 *  (SdfComputeAssetPathRelativeToLayer), when there is one. Returns
 *  undefined when the path is not one the prefetcher reads ahead. */
export type _ArAssetPathPrefetcher = (
  authoredPath: string,
  anchor: ((path: string) => string) | undefined,
  reader: _ArAssetReader,
) => Promise<void> | undefined

const assetPathPrefetchers: _ArAssetPathPrefetcher[] = []

/** Registers `prefetcher` for authored asset paths (see _ArAssetPathPrefetcher). */
export function _ArRegisterAssetPathPrefetcher(prefetcher: _ArAssetPathPrefetcher): void {
  if (!assetPathPrefetchers.includes(prefetcher)) assetPathPrefetchers.push(prefetcher)
}

/**
 * Runs the authored-path prefetchers for `authoredPath` (code that resolves
 * asset paths asynchronously, i.e. UsdStage preparing asset-valued
 * attributes, calls this beside _ArPrefetchAsset). Never rejects.
 */
export function _ArPrefetchAssetPath(
  authoredPath: string,
  anchor: ((path: string) => string) | undefined,
  reader: _ArAssetReader = _ArDefaultAssetReader(),
): Promise<void> {
  if (!authoredPath) return Promise.resolve()
  const pending: Promise<void>[] = []
  for (const prefetcher of assetPathPrefetchers) {
    const p = prefetcher(authoredPath, anchor, reader)
    if (p) pending.push(p.catch(() => {}))
  }
  return pending.length ? Promise.all(pending).then(() => {}) : Promise.resolve()
}

/** Registers `prefetcher` for the assets that attributes with these names
 *  hold, whatever their extension. The first registration of a name wins. */
export function _ArRegisterAssetPropertyPrefetcher(propertyNames: readonly string[], prefetcher: _ArAssetPrefetcher): void {
  for (const name of propertyNames) {
    if (!propertyPrefetchers.has(name)) propertyPrefetchers.set(name, prefetcher)
  }
}

/** True when a prefetcher is registered for attributes named `propertyName`. */
export function _ArHasAssetPropertyPrefetcher(propertyName: string): boolean {
  return propertyPrefetchers.has(propertyName)
}

/**
 * Runs the prefetcher registered for attributes named `propertyName`, if any,
 * on the asset one holds (code that resolves asset-valued attributes
 * asynchronously, i.e. UsdStage, calls this beside _ArPrefetchAsset). Never
 * rejects.
 */
export function _ArPrefetchAssetForProperty(propertyName: string, resolvedPath: ArResolvedPath,
  reader: _ArAssetReader = _ArDefaultAssetReader()): Promise<void> {
  const prefetcher = propertyPrefetchers.get(propertyName)
  if (!prefetcher || !resolvedPath.valid) return Promise.resolve()
  return prefetcher(resolvedPath, reader).catch(() => {})
}

/**
 * Opens the asset at `resolvedPath` with `reader` and records its contents
 * (or that it could not be opened) for _ArOpenAssetSync, once per path.
 */
export async function _ArOpenAssetAhead(
  resolvedPath: ArResolvedPath,
  reader: _ArAssetReader = _ArDefaultAssetReader(),
): Promise<void> {
  const path = resolvedPath.toString()
  if (!path || contents.has(path) || unopened.has(path) || _pathExists(path)) return
  let bytes: Uint8Array | undefined
  try {
    const asset = await reader.openAsset(resolvedPath)
    bytes = asset ? await asset.getBuffer() : undefined
  } catch {
    bytes = undefined
  }
  if (bytes) contents.set(path, bytes)
  else unopened.add(path)
}

/** True when the asset at `resolvedPath` was read ahead (or tried and could
 *  not be opened), or the default resolver can read it synchronously: a
 *  synchronous open that fails then fails as upstream's would. False when a
 *  synchronous client asks for an asset nothing read ahead, which it reports. */
export function _ArWasReadAhead(resolvedPath: ArResolvedPath): boolean {
  const path = resolvedPath.toString()
  return contents.has(path) || unopened.has(path) || _pathExists(path)
}

/**
 * Resolves `assetPath` with `reader` and records the resolution, empty or
 * not, for _ArResolveSync. Returns the resolved path.
 */
export async function _ArResolveAhead(
  assetPath: string,
  reader: _ArAssetReader = _ArDefaultAssetReader(),
): Promise<ArResolvedPath> {
  if (!assetPath) return new ArResolvedPath()
  const recorded = resolvedPaths.get(assetPath)
  if (recorded) return recorded
  const resolvedPath = await reader.resolve(assetPath)
  resolvedPaths.set(assetPath, resolvedPath)
  return resolvedPath
}

/**
 * Resolves `assetPath` with `reader` and reads the asset, recording both for
 * _ArResolveSync and _ArOpenAssetSync. Returns the resolved path and the
 * contents, or undefined when the asset does not resolve or cannot be opened.
 */
export async function _ArReadAhead(
  assetPath: string,
  reader: _ArAssetReader = _ArDefaultAssetReader(),
): Promise<{ resolvedPath: ArResolvedPath, bytes: Uint8Array } | undefined> {
  if (!assetPath) return undefined
  const resolvedPath = await reader.resolve(assetPath)
  if (!resolvedPath.valid) return undefined
  resolvedPaths.set(assetPath, resolvedPath)
  const path = resolvedPath.toString()
  const file = _readFileSync(path)
  if (file) return { resolvedPath, bytes: file }
  const asset = await reader.openAsset(resolvedPath)
  if (!asset) return undefined
  const bytes = await asset.getBuffer()
  contents.set(path, bytes)
  return { resolvedPath, bytes }
}

/**
 * ArGetResolver().Resolve(assetPath) for a synchronous caller: the
 * resolution read ahead for `assetPath`, else the default resolver's
 * filesystem resolution (which is synchronous), else an empty path.
 */
export function _ArResolveSync(assetPath: string): ArResolvedPath {
  if (!assetPath) return new ArResolvedPath()
  return resolvedPaths.get(assetPath) ?? _resolveFilesystemPathSync(assetPath)
}

/** An asset read ahead: ArAsset::GetSize and ArAsset::GetBuffer
 *  (asset.h:36-48), synchronous as upstream's. */
export interface _ArSyncAsset {
  getSize(): number
  getBuffer(): Uint8Array
}

/**
 * ArGetResolver().OpenAsset(resolvedPath) for a synchronous caller: the
 * asset read ahead at `resolvedPath`, else a file the default resolver can
 * read synchronously, else undefined.
 */
export function _ArOpenAssetSync(resolvedPath: ArResolvedPath): _ArSyncAsset | undefined {
  const path = resolvedPath.toString()
  if (!path) return undefined
  const bytes = contents.get(path) ?? _readFileSync(path)
  return bytes ? { getSize: () => bytes.byteLength, getBuffer: () => bytes } : undefined
}

/** @internal Test harness: forgets every record (not the prefetchers). */
export function _ArClearPrefetchedAssetsForTest(): void {
  resolvedPaths.clear()
  contents.clear()
  unopened.clear()
}
