// Ported from OpenUSD 26.11.1: pxr/usd/usd/stagePopulationMask.cpp,
//  pxr/usd/usd/stagePopulationMask.h, pxr/usd/usd/instanceKey.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdStagePopulationMask (pxr/usd/usd/stagePopulationMask.h, .cpp): a set of
// absolute prim paths defining the subset of a stage to populate. Paths are
// stored sorted with redundant descendants removed (a mask path beneath
// another contributes nothing). Population consults GetIncludedChildNames
// per prim (stage.cpp:1016-1018), and Usd_InstanceKey folds the mask made
// relative to each instance into instancing identity (instanceKey.cpp).

import { SdfPath } from 'typescript-usd/sdf/path'

export class StagePopulationMask {
  // Sorted, prefix-minimal absolute prim paths.
  private paths: string[] = []

  // UsdStagePopulationMask::All(): the mask covering the whole stage.
  static all(): StagePopulationMask {
    return new StagePopulationMask(['/'])
  }

  constructor(paths: readonly string[] = []) {
    for (const path of paths) this.add(path)
  }

  // UsdStagePopulationMask::Add(path): insert keeping the path set sorted
  // and minimal (stagePopulationMask.cpp:84-126's sorted-unique invariant).
  add(path: string): void {
    // stagePopulationMask.cpp:76-79 and :239-243 accept only an absolute
    // prim path or the absolute root path (no property or variant paths).
    const sdfPath = SdfPath.fromString(path)
    if (!sdfPath.isAbsolutePath() || !sdfPath.isAbsoluteRootOrPrimPath()) {
      throw new Error(`Invalid path <${path}>; must be an absolute prim path or the absolute root path`)
    }
    if (this.paths.some(existing => atOrBelow(path, existing))) return
    this.paths = [
      ...this.paths.filter(existing => !atOrBelow(existing, path)),
      path,
    ].sort()
  }

  getPaths(): readonly string[] {
    return this.paths
  }

  isEmpty(): boolean {
    return this.paths.length === 0
  }

  // UsdStagePopulationMask::Includes(path) (stagePopulationMask.cpp:137-150):
  // included when the path is at or below a mask path, or is an ancestor of
  // one (ancestors populate so masked descendants can compose).
  includes(path: string): boolean {
    return this.paths.some(maskPath =>
      atOrBelow(path, maskPath) || atOrBelow(maskPath, path))
  }

  // UsdStagePopulationMask::IncludesSubtree (stagePopulationMask.cpp:174-178).
  includesSubtree(path: string): boolean {
    return this.paths.some(maskPath => atOrBelow(path, maskPath))
  }

  // UsdStagePopulationMask::GetIncludedChildNames
  // (stagePopulationMask.cpp:196-226): 'all' when the whole subtree is
  // included; otherwise the distinct child names leading to mask paths
  // beneath the prim (empty = prune this subtree).
  getIncludedChildNames(path: string): { all: boolean; names: readonly string[] } {
    if (this.includesSubtree(path)) return { all: true, names: [] }
    const prefix = path === '/' ? '/' : `${path}/`
    const names = new Set<string>()
    for (const maskPath of this.paths) {
      if (!maskPath.startsWith(prefix)) continue
      const remainder = maskPath.slice(prefix.length)
      const slash = remainder.indexOf('/')
      names.add(slash < 0 ? remainder : remainder.slice(0, slash))
    }
    return { all: false, names: [...names].sort() }
  }

  equals(other: StagePopulationMask): boolean {
    return this.paths.length === other.paths.length
      && this.paths.every((path, index) => path === other.paths[index])
  }

  // UsdStagePopulationMask::GetUnion (stagePopulationMask.cpp:84-107).
  getUnion(other: StagePopulationMask | string): StagePopulationMask {
    const union = new StagePopulationMask(this.paths)
    if (typeof other === 'string') union.add(other)
    else for (const path of other.paths) union.add(path)
    return union
  }

  // UsdStagePopulationMask::GetIntersection: paths included by both masks —
  // for each pair, the deeper of two nested paths (disjoint pairs drop).
  getIntersection(other: StagePopulationMask): StagePopulationMask {
    const result = new StagePopulationMask()
    for (const mine of this.paths) {
      for (const theirs of other.paths) {
        if (atOrBelow(mine, theirs)) result.add(mine)
        else if (atOrBelow(theirs, mine)) result.add(theirs)
      }
    }
    return result
  }

  // UsdStagePopulationMask::Includes(mask): true when this mask covers every
  // path of the other (stagePopulationMask.cpp:130-134, GetUnion == this).
  includesMask(other: StagePopulationMask): boolean {
    return this.getUnion(other).equals(this)
  }
}

function atOrBelow(path: string, root: string): boolean {
  return path === root || root === '/' || path.startsWith(`${root}/`)
}
