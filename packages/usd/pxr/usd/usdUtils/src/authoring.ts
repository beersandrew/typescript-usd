// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/authoring.cpp,
//  pxr/usd/usdUtils/authoring.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/authoring.{h,cpp} (OpenUSD 26.11.1).
//
// Layer metadata copying, compact include/exclude encodings and authoring of
// collections, and the dirty layers of a stage.
//
// Paths: the collection algorithm uses SdfPath algebra and orders paths as
// std::set<SdfPath> does (SdfPath.compare); UsdUtilsPathHashSet is a set of
// path strings. The SdfPathVector out parameters of
// UsdUtilsComputeCollectionIncludesAndExcludes are arrays the function
// clears and fills, as upstream's pointers.

import { GfClamp } from 'typescript-usd/gf'
import { TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'
import { sdfChangeBlock, type Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  CollectionAPI as UsdCollectionAPI,
  PrimAllPrimsPredicate as UsdPrimAllPrimsPredicate,
  PrimRange as UsdPrimRange,
  Stage as UsdStage,
  TraverseInstanceProxies as UsdTraverseInstanceProxies,
  type Prim as UsdPrim,
} from 'typescript-usd/usd'

/** UsdUtilsPathHashSet (authoring.h:47): a hash set of paths. */
export type UsdUtilsPathHashSet = ReadonlySet<string>

// SdfFieldKeys (sdf/schema.h)
const SdfFieldKeys = {
  SubLayers: 'subLayers',
  SubLayerOffsets: 'subLayerOffsets',
  ColorConfiguration: 'colorConfiguration',
  ColorManagementSystem: 'colorManagementSystem',
} as const

const toSdfPath = (path: SdfPath | string): SdfPath =>
  typeof path === 'string' ? SdfPath.fromString(path) : path

// An SdfPathSet: unique paths in SdfPath order.
function _toSdfPathSet(paths: Iterable<SdfPath | string>): SdfPath[] {
  const unique = new Map<string, SdfPath>()
  for (const p of paths) {
    const path = toSdfPath(p)
    unique.set(path.pathString, path)
  }
  return [...unique.values()].sort(SdfPath.compare)
}

/**
 * Copies the authored layer metadata of `source` to `destination`, all of
 * it unless `skipSublayers` (then subLayers and subLayerOffsets are left
 * out). With `bakeUnauthoredFallbacks`, the color configuration fallbacks of
 * fields unauthored in `source` are written to `destination`. Returns true
 * on success (authoring.cpp:25-84).
 */
export function UsdUtilsCopyLayerMetadata(
  source: SdfLayer | undefined | null,
  destination: SdfLayer | undefined | null,
  skipSublayers = false,
  bakeUnauthoredFallbacks = false,
): boolean {
  if (!TF_VERIFY(source && destination, 'source && destination') || !source || !destination) return false

  const sourcePseudo = source.getPseudoRoot()
  const destPseudo = destination.getPseudoRoot()

  const infoKeys = sourcePseudo.listInfoKeys()
  let keysToCopy = infoKeys

  if (skipSublayers) {
    keysToCopy = infoKeys.filter(key =>
      !(key === SdfFieldKeys.SubLayers || key === SdfFieldKeys.SubLayerOffsets))
  }

  // Batch all the SetInfo calls into a single change block. This specifically
  // avoids leaving the SubLayers and SubLayerOffsets fields out of sync with
  // each other, which Pcp would report as a
  // PcpErrorType_InvalidSublayerAndOffsetCount composition error.
  // Regardless, batching such changes in a single change block is a good
  // practice, as it avoids unnecessary invalidation and recomposition of the
  // stage.
  sdfChangeBlock(() => {
    for (const key of keysToCopy) {
      destPseudo.setInfo(key, sourcePseudo.getInfo(key))
    }

    if (bakeUnauthoredFallbacks) {
      // std::remove_if leaves the removed keys' slots unspecified; the
      // search below runs over the whole vector as upstream's does
      // (authoring.cpp:61-66), which for these two keys is the same.
      const bakeColorConfiguration = !infoKeys.includes(SdfFieldKeys.ColorConfiguration)
      const bakeColorManagementSystem = !infoKeys.includes(SdfFieldKeys.ColorManagementSystem)

      if (bakeColorConfiguration || bakeColorManagementSystem) {
        const [fallbackColorConfig, fallbackCms] = UsdStage.getColorConfigFallbacks()

        if (bakeColorConfiguration && fallbackColorConfig.getAssetPath() !== '') {
          destPseudo.setInfo(SdfFieldKeys.ColorConfiguration, fallbackColorConfig)
        }
        if (bakeColorManagementSystem && fallbackCms !== '') {
          destPseudo.setInfo(SdfFieldKeys.ColorManagementSystem, fallbackCms)
        }
      }
    }
  })

  return true
}

// Helper method for determining the set of paths to exclude below the common
// ancestor, in order to include just includedRootPaths (and their ancestors)
// (authoring.cpp:86-128).
function _GetPathsToExcludeBelowCommonAncestor(
  includedRootPaths: UsdUtilsPathHashSet,
  commonAncestor: UsdPrim,
  pathsToIgnore: UsdUtilsPathHashSet,
): SdfPath[] {
  const pathsToExclude = new Map<string, SdfPath>()
  const commonAncestorPath = SdfPath.fromString(commonAncestor.path)

  // Travere beneath the common prefix to find all the paths that don't
  // belong to the collection.
  const commonAncestorRange = UsdPrimRange.fromPrim(
    commonAncestor, UsdTraverseInstanceProxies(UsdPrimAllPrimsPredicate))
  const primIt = commonAncestorRange[Symbol.iterator]()
  for (const prim of primIt) {
    const primPath = SdfPath.fromString(prim.path)

    if (pathsToIgnore.has(primPath.pathString)) continue

    if (includedRootPaths.has(primPath.pathString)) {
      // If we find a path that's included in the collection, we must
      // remove all the ancestor paths of the path from pathsToExclude.
      let parentPath = primPath
      while (!parentPath.equals(commonAncestorPath)) {
        parentPath = parentPath.getParentPath()
        pathsToExclude.delete(parentPath.pathString)
      }
      primIt.pruneChildren()
    } else {
      pathsToExclude.set(primPath.pathString, primPath)
    }
  }

  // Remove all descendant paths of already excluded ancestor paths to come
  // up with the mimimal set of paths to exclude below commonAncestor.
  const pathsToExcludeVec = [...pathsToExclude.values()].sort(SdfPath.compare)
  SdfPath.removeDescendentPaths(pathsToExcludeVec)
  return pathsToExcludeVec
}

// authoring.cpp:130-235
function _ComputePathsToIncludeAndExclude(
  includedRootPaths: UsdUtilsPathHashSet,
  commonAncestor: UsdPrim,
  minInclusionRatio: number,
  maxNumExcludesBelowInclude: number,
  pathsToInclude: SdfPath[],
  pathsToExclude: SdfPath[],
  pathsToIgnore: UsdUtilsPathHashSet,
): boolean {
  // Find the minimal set of paths that must be excluded, if we were
  // to include all of the subtree rooted at commonPrefix.
  const pathsToExcludeBelowCommonAncestor =
    _GetPathsToExcludeBelowCommonAncestor(includedRootPaths, commonAncestor, pathsToIgnore)

  const commonAncestorParentPath = SdfPath.fromString(commonAncestor.path).getParentPath()

  // At each path below the commonAncestor and at or above includedRootPaths,
  // compute the set of paths to be excluded if the path were to be
  // included.
  const excludedPathsMap = new Map<string, SdfPath[]>()
  for (const pathToExclude of pathsToExcludeBelowCommonAncestor) {
    let parentPath = pathToExclude
    while (!parentPath.equals(commonAncestorParentPath)) {
      const entry = excludedPathsMap.get(parentPath.pathString)
      if (entry) entry.push(pathToExclude)
      else excludedPathsMap.set(parentPath.pathString, [pathToExclude])
      parentPath = parentPath.getParentPath()
    }
  }

  // At each path below the commonAncestor and at or above includedRootPaths,
  // compute the number of included paths.
  const numIncludedPathsMap = new Map<string, number>()
  for (const includedRootPath of includedRootPaths) {
    let parentPath = SdfPath.fromString(includedRootPath)
    while (!parentPath.equals(commonAncestorParentPath)) {
      numIncludedPathsMap.set(parentPath.pathString,
        (numIncludedPathsMap.get(parentPath.pathString) ?? 0) + 1)
      parentPath = parentPath.getParentPath()
    }
  }

  // We have all the information needed to compute the optimal set of
  // included paths and excluded paths.
  const commonAncestorRange = UsdPrimRange.fromPrim(
    commonAncestor, UsdTraverseInstanceProxies(UsdPrimAllPrimsPredicate))
  const primIt = commonAncestorRange[Symbol.iterator]()
  for (const p of primIt) {
    if (pathsToIgnore.has(p.path)) continue

    const inclPathCount = numIncludedPathsMap.get(p.path) ?? 0

    if (inclPathCount > 0) {
      const excludedPaths = excludedPathsMap.get(p.path)
      const exclPathCount = excludedPaths?.length ?? 0

      const inclusionRatio = inclPathCount / (inclPathCount + exclPathCount)
      if (inclusionRatio >= minInclusionRatio &&
          exclPathCount <= maxNumExcludesBelowInclude) {
        pathsToInclude.push(SdfPath.fromString(p.path))
        if (exclPathCount > 0) pathsToExclude.push(...excludedPaths!)
        // Prune the subtree once an ancestor path has been included.
        primIt.pruneChildren()
      }
    } else {
      // Prune subtrees that don't have any included paths.
      primIt.pruneChildren()
    }
  }

  return true
}

// C++ printf %f
const _formatF = (value: number): string => value.toFixed(6)

/**
 * Computes a compact set of paths to include and paths to exclude below
 * them that encodes an "expandPrims" collection of the subtrees rooted at
 * `includedRootPaths`. `pathsToInclude` and `pathsToExclude` are cleared and
 * filled. Returns false when the prim at the paths' common prefix cannot be
 * found on `usdStage` (authoring.cpp:237-321).
 */
export function UsdUtilsComputeCollectionIncludesAndExcludes(
  includedRootPaths: Iterable<SdfPath | string>,
  usdStage: UsdStage,
  pathsToInclude: SdfPath[],
  pathsToExclude: SdfPath[],
  minInclusionRatio = 0.75,
  maxNumExcludesBelowInclude = 5,
  minIncludeExcludeCollectionSize = 3,
  pathsToIgnore: UsdUtilsPathHashSet = new Set(),
): boolean {
  // Clear out the lists of paths that we're about to populate.
  pathsToInclude.length = 0
  pathsToExclude.length = 0

  if (minInclusionRatio <= 0 || minInclusionRatio > 1) {
    TF_CODING_ERROR(`Invalid minInclusionRatio value: ${_formatF(minInclusionRatio)}. Clamping value ` +
      'to range (0, 1).')
    minInclusionRatio = GfClamp(minInclusionRatio, 0, 1.0)
  }

  const includedRootPathSet = _toSdfPathSet(includedRootPaths)
  if (includedRootPathSet.length === 0) return true

  // If the number of included paths is small (less than
  // minIncludeExcludeCollectionSize), then create an includes-only
  // collection. If not, attempt to come up with a compact representation
  // for the collection with both included and excluded paths.
  if (includedRootPathSet.length < minIncludeExcludeCollectionSize) {
    pathsToInclude.push(...includedRootPathSet)
    return true
  }

  // Here's a quick summary of the algorithm used here
  // [1] Find the common prefix of the paths included in the collection
  //     (commonPrefix) and get the corresponding prim (commonAncestor).
  // [2] Find the paths to exclude from the collection, if we were to
  //     include all of commonPrefix (pathsToExcludeBelowCommonAncestor).
  //     [2a] Traverse all the paths below commonPrefix to find the
  //          paths that don't belong to the collection.
  // [3] For each of the included paths, walk up the namespace and compute
  //     a mapping of ancestor path to the number of included paths
  //     (numIncludedPathsMap)
  // [4] For each of the excluded paths, walk up the namespace and compute
  //     a mapping of ancestor path to the set of paths to exclude if we were
  //     to include the ancestor path in the collection (excludedPathsMap).
  // [5] Traverse the subtree rooted at "commonPrefix". At each path,
  //     [5a] Determine the inclusion ratio (i.e the number of included
  //          paths / (sum of included and excluded paths).
  //     [5b] If the computed inclusionRatio > minInclusionRatio and if
  //          the number of paths to exclude is <= maxNumExcludesBelowInclude,
  //          add the current path path to the list of pathsToInclude and
  //          add the corresponding excluded-path-set (from excludedPathsMap)
  //          to the list of pathsToExclude.
  // [6] Return accumulated set of pathsToInclude and pathsToExclude.

  // Find the common prefix of all included paths in this collection.
  let commonPrefix = includedRootPathSet[0]!
  for (const p of includedRootPathSet) commonPrefix = commonPrefix.getCommonPrefix(p)

  const commonAncestor = usdStage.getPrim(commonPrefix.pathString)
  if (!commonAncestor) {
    TF_CODING_ERROR(`Could not get the prim at common-prefix path <${commonPrefix.pathString}>.`)
    return false
  }

  // Construct and use a hash_set containing includedRootPaths
  // as we could (and in many cases will) be doing a lot of
  // lookups in this set.
  const includedRootPathsHashSet = new Set(includedRootPathSet.map(p => p.pathString))

  return _ComputePathsToIncludeAndExclude(
    includedRootPathsHashSet, commonAncestor,
    minInclusionRatio, maxNumExcludesBelowInclude,
    pathsToInclude, pathsToExclude, pathsToIgnore)
}

/**
 * Authors the collection `collectionName` on `usdPrim` with the given
 * included and excluded paths; an existing collection of that name keeps
 * its other data (authoring.cpp:323-341).
 */
export function UsdUtilsAuthorCollection(
  collectionName: string,
  usdPrim: UsdPrim,
  pathsToInclude: readonly (SdfPath | string)[],
  pathsToExclude: readonly (SdfPath | string)[] = [],
): UsdCollectionAPI {
  const collection = UsdCollectionAPI.apply(usdPrim, collectionName)

  const includesRel = collection.createIncludesRel()
  includesRel.setTargets(pathsToInclude.map(p => toSdfPath(p).pathString))

  if (pathsToExclude.length !== 0) {
    const excludesRel = collection.createExcludesRel()
    excludesRel.setTargets(pathsToExclude.map(p => toSdfPath(p).pathString))
  }

  return collection
}

/**
 * Creates on `usdPrim` one collection per (collection-name, path-set)
 * assignment, each encoded compactly with
 * UsdUtilsComputeCollectionIncludesAndExcludes; an assignment with no paths
 * gives an empty collection. Returns the collections in assignment order
 * (authoring.cpp:344-396).
 */
export function UsdUtilsCreateCollections(
  assignments: readonly (readonly [string, Iterable<SdfPath | string>])[],
  usdPrim: UsdPrim,
  minInclusionRatio = 0.75,
  maxNumExcludesBelowInclude = 5,
  minIncludeExcludeCollectionSize = 3,
): UsdCollectionAPI[] {
  const result: UsdCollectionAPI[] = []

  if (assignments.length === 0) return result

  if (minInclusionRatio <= 0 || minInclusionRatio > 1) {
    TF_CODING_ERROR(`Invalid minInclusionRatio value: ${_formatF(minInclusionRatio)}. Clamping value ` +
      'to range (0, 1).')
    minInclusionRatio = GfClamp(minInclusionRatio, 0, 1.0)
  }

  const usdStage = usdPrim.getStage()

  // Compute the set of collections to author (in parallel upstream, with
  // WorkParallelForN; each computation is independent).
  const collectionIncludesAndExcludes = assignments.map(([, includedRootPaths]) => {
    const pathsToInclude: SdfPath[] = []
    const pathsToExclude: SdfPath[] = []
    UsdUtilsComputeCollectionIncludesAndExcludes(includedRootPaths,
      usdStage, pathsToInclude, pathsToExclude, minInclusionRatio,
      maxNumExcludesBelowInclude, minIncludeExcludeCollectionSize)
    return [pathsToInclude, pathsToExclude] as const
  })

  // Do the authoring of the collections serially since we can't write from
  // multiple threads in parallel.
  for (let i = 0; i < assignments.length; ++i) {
    const collectionName = assignments[i]![0]
    const [includes, excludes] = collectionIncludesAndExcludes[i]!
    result.push(UsdUtilsAuthorCollection(collectionName, usdPrim, includes, excludes))
  }

  return result
}

/** The dirty layers among the stage's used layers (authoring.cpp:398-407). */
export function UsdUtilsGetDirtyLayers(stage: UsdStage, includeClipLayers = true): SdfLayer[] {
  return stage.getUsedLayers(includeClipLayers).filter(layer => layer.isDirty())
}
