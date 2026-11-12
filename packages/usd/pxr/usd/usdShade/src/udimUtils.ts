// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/udimUtils.cpp,
//  pxr/usd/usdShade/udimUtils.h,
//  pxr/usdImaging/usdImaging/dataSourceAttribute.cpp
// Copyright 2020, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdShadeUdimUtils: identify, resolve and fill in UDIM asset paths.
// Reference: OpenUSD v26.11.1 pxr/usd/usdShade/udimUtils.{h,cpp}.
//
// Asset resolution through ArResolver::Resolve is asynchronous here, so the
// two functions that resolve tiles (ResolveUdimTilePaths, ResolveUdimPath)
// return promises; their results are those of the upstream functions.
// Divergence: imaging resolves a UDIM path synchronously, in the middle of
// Hydra's scene processing (usdImaging/dataSourceAttribute.cpp:56-70), so
// resolveUdimPathSync is ResolveUdimPath with each tile resolved through
// _ArResolveSync; the tiles are resolved ahead with the stage's resolver when
// the stage prepares its asset-valued attributes (the asset path prefetcher
// registered below, ar/src/prefetchedAssets.ts).

import type { Layer } from 'typescript-usd/sdf'
import {
  _ArRegisterAssetPathPrefetcher,
  _ArResolveAhead,
  _ArResolveSync,
} from 'typescript-usd/ar/_internal'
import {
  GetResolver as ArGetResolver,
  IsPackageRelativePath as ArIsPackageRelativePath,
  JoinPackageRelativePath as ArJoinPackageRelativePath,
  SplitPackageRelativePathInner as ArSplitPackageRelativePathInner,
} from 'typescript-usd/ar'

// udimUtils.cpp:15-18.
const UDIM_PATTERN = '<UDIM>'
const UDIM_START_TILE = 1001
const UDIM_END_TILE = 1100
const UDIM_TILE_NUMBER_LENGTH = 4

// A resolved tile path and its tile number (UsdShadeUdimUtils::
// ResolvedPathAndTile, udimUtils.h:33).
export type ResolvedPathAndTile = [resolvedPath: string, tile: string]

// _SplitUdimPattern (udimUtils.cpp:24-41): split a udim file path such as
// /someDir/myFile.<UDIM>.exr into a prefix (/someDir/myFile.) and suffix
// (.exr); both are empty when the path holds no pattern.
function splitUdimPattern(path: string): [string, string] {
  for (const pattern of [UDIM_PATTERN]) {
    const pos = path.indexOf(pattern)
    if (pos >= 0) return [path.slice(0, pos), path.slice(pos + pattern.length)]
  }
  return ['', '']
}

// _ResolveUdimPaths (udimUtils.cpp:58-98).
async function resolveUdimPaths(
  udimPath: string, layer: Layer | undefined, stopAtFirst: boolean,
): Promise<ResolvedPathAndTile[]> {
  const resolvedPaths: ResolvedPathAndTile[] = []
  // Check for bookends, and exit early if it's not a UDIM path.
  const [prefix, suffix] = splitUdimPattern(udimPath)
  if (!prefix && !suffix) return resolvedPaths

  const resolver = ArGetResolver()
  for (let i = UDIM_START_TILE; i <= UDIM_END_TILE; i++) {
    const tile = String(i)
    // Fill in integer.
    let path = prefix + tile + suffix
    // Deal with layer-relative paths (SdfComputeAssetPathRelativeToLayer).
    if (layer) path = layer.resolveAsset(path)
    path = (await resolver.resolve(path)).toString()
    if (path) {
      resolvedPaths.push([path, tile])
      if (stopAtFirst) break
    }
  }
  return resolvedPaths
}

// _ResolveUdimPaths (udimUtils.cpp:58-98) with ArResolver::Resolve made
// synchronous through the resolutions read ahead (see the header).
function resolveUdimPathsSync(
  udimPath: string, layer: Layer | undefined, stopAtFirst: boolean,
): ResolvedPathAndTile[] {
  const resolvedPaths: ResolvedPathAndTile[] = []
  const [prefix, suffix] = splitUdimPattern(udimPath)
  if (!prefix && !suffix) return resolvedPaths
  for (let i = UDIM_START_TILE; i <= UDIM_END_TILE; i++) {
    const tile = String(i)
    let path = prefix + tile + suffix
    if (layer) path = layer.resolveAsset(path)
    path = _ArResolveSync(path).toString()
    if (path) {
      resolvedPaths.push([path, tile])
      if (stopAtFirst) break
    }
  }
  return resolvedPaths
}

// The rest of ResolveUdimPath (udimUtils.cpp:120-162) once the first tile is
// known.
function udimPathFromFirstTile(udimPath: string, udimPaths: ResolvedPathAndTile[]): string {
  // Return empty if passed path is a non-UDIM path or just doesn't
  // resolve as a UDIM.
  if (udimPaths.length === 0) return ''

  // Just need first tile to verify and then revert to <UDIM>.
  let firstTilePackage = ''
  let firstTilePath = udimPaths[0]![0]
  // A first tile inside a packaged asset, like
  // /foo/bar/baz.usdz[myImage.0001.exr], is split so the "<UDIM>" pattern
  // goes back into the image filename, then joined back together.
  if (ArIsPackageRelativePath(firstTilePath)) {
    [firstTilePackage, firstTilePath] = ArSplitPackageRelativePathInner(firstTilePath)
  }

  const suffix = splitUdimPattern(udimPath)[1]
  // Sanity check that the part after <UDIM> did not change.
  if (!firstTilePath.endsWith(suffix)) {
    console.warn(
      'Resolution of first udim tile gave ambigious result. ' +
      `First tile for '${udimPath}' is '${firstTilePath}'.`)
    return ''
  }

  // Length of the part /filePath/myImage.<UDIM>.exr.
  const prefixLength = firstTilePath.length - suffix.length - UDIM_TILE_NUMBER_LENGTH
  firstTilePath = firstTilePath.slice(0, prefixLength) + UDIM_PATTERN + suffix
  return firstTilePackage
    ? ArJoinPackageRelativePath([firstTilePackage, firstTilePath])
    : firstTilePath
}

// Reads ahead the tile resolutions resolveUdimPathSync makes for an authored
// UDIM path: the tiles in order up to the first that resolves, each recorded
// for _ArResolveSync whether it resolves or not.
_ArRegisterAssetPathPrefetcher((authoredPath, anchor, reader) => {
  const [prefix, suffix] = splitUdimPattern(authoredPath)
  if (!prefix && !suffix) return undefined
  return (async () => {
    for (let i = UDIM_START_TILE; i <= UDIM_END_TILE; i++) {
      let path = prefix + String(i) + suffix
      if (anchor) path = anchor(path)
      if ((await _ArResolveAhead(path, reader)).toString()) break
    }
  })()
})

export const UdimUtils = {
  // UsdShadeUdimUtils::IsUdimIdentifier (udimUtils.cpp:44-55).
  isUdimIdentifier(identifier: string): boolean {
    const [prefix, suffix] = splitUdimPattern(identifier)
    return !(!prefix && !suffix)
  },

  // UsdShadeUdimUtils::ResolveUdimTilePaths (udimUtils.cpp:100-107).
  resolveUdimTilePaths(udimPath: string, layer?: Layer): Promise<ResolvedPathAndTile[]> {
    return resolveUdimPaths(udimPath, layer, /* stopAtFirst = */ false)
  },

  // UsdShadeUdimUtils::ResolveUdimPath (udimUtils.cpp:109-163).
  async resolveUdimPath(udimPath: string, layer?: Layer): Promise<string> {
    return udimPathFromFirstTile(
      udimPath, await resolveUdimPaths(udimPath, layer, /* stopAtFirst = */ true))
  },

  // UsdShadeUdimUtils::ResolveUdimPath (udimUtils.cpp:109-163), resolving
  // the tiles synchronously (see the header).
  resolveUdimPathSync(udimPath: string, layer?: Layer): string {
    return udimPathFromFirstTile(
      udimPath, resolveUdimPathsSync(udimPath, layer, /* stopAtFirst = */ true))
  },

  // UsdShadeUdimUtils::ReplaceUdimPattern (udimUtils.cpp:165-178).
  replaceUdimPattern(identifierWithPattern: string, replacement: string): string {
    const [prefix, suffix] = splitUdimPattern(identifierWithPattern)
    if (!prefix && !suffix) return identifierWithPattern
    return prefix + replacement + suffix
  },
}
