// Ported from OpenUSD 26.11.1: pxr/imaging/hd/primGather.cpp,
//  pxr/imaging/hd/primGather.h,
//  pxr/imaging/hdSt/testenv/testHdStPrimGather.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/primGather.{h,cpp} — HdPrimGather.
//
// Filters a pre-sorted list of SdfPaths against include/exclude root paths,
// the way HdRenderIndex resolves an HdRprimCollection's root paths into the
// set of rprims a render pass draws (this is what testHdStPrimGather exercises
// when it cycles the collection's root path).
//
// Inclusion rule (verbatim from the header):
//   - a path is kept if prefixed by at least one include path, AND
//   - it is not prefixed by an exclude path that has MORE elements than the
//     include path with the most elements that is a prefix of the path.
//
// The algorithm avoids copying paths by tracking inclusive [start,end] index
// ranges over the sorted input and splitting them per filter. We port the
// serial path (the parallel predicate path is a TBB-only optimization).
//
// Input paths must be pre-sorted by SdfPath's total order. For prim paths that
// order coincides with element-wise name comparison (ancestors before
// descendants, siblings lexicographically), which `comparePaths` implements;
// it is the same key HdRenderIndex sorts its rprim ids with.

import { SdfPath } from 'typescript-usd/sdf/path'

// SdfPath total order for prim paths: walk the two paths' name chains from the
// root, comparing names; the shorter (ancestor) sorts first on a tie.
function nameChain(p: SdfPath): string[] {
  const names: string[] = []
  for (let n = p; !n.isEmpty() && !n.isAbsoluteRootPath(); n = n.getParentPath()) {
    names.unshift(n.name)
  }
  return names
}

export function comparePaths(a: SdfPath, b: SdfPath): number {
  const an = nameChain(a)
  const bn = nameChain(b)
  const m = Math.min(an.length, bn.length)
  for (let i = 0; i < m; i++) {
    if (an[i]! < bn[i]!) return -1
    if (an[i]! > bn[i]!) return 1
  }
  return an.length - bn.length
}

interface PathFilter {
  path: SdfPath
  includePath: boolean // false = exclude
}

interface Range {
  start: number
  end: number // inclusive
}

export class HdPrimGather {
  private _filterList: PathFilter[] = []
  private _gatheredRanges: Range[] = []

  // Filter — the public entry point used to resolve a collection's roots.
  filter(
    paths: SdfPath[],
    includePaths: SdfPath[],
    excludePaths: SdfPath[],
  ): SdfPath[] {
    this._setupFilter(includePaths, excludePaths)
    this._gatherPaths(paths)
    return this._writeResults(paths, this._gatheredRanges)
  }

  // Subtree — gather everything under a single root path (no excludes).
  subtree(paths: SdfPath[], rootPath: SdfPath): SdfPath[] {
    this._filterSubTree(paths, rootPath)
    return this._writeResults(paths, this._gatheredRanges)
  }

  // First contiguous [start,end] index range under rootPath, or null.
  subtreeAsRange(paths: SdfPath[], rootPath: SdfPath): [number, number] | null {
    this._filterSubTree(paths, rootPath)
    if (this._gatheredRanges.length === 0) return null
    if (this._gatheredRanges.length > 1) {
      // Subtree produced more than 1 range — input was unsorted.
      return null
    }
    const r = this._gatheredRanges[0]!
    return [r.start, r.end]
  }

  // ---- internals (1:1 with the C++) ----

  private _findLowerBound(
    paths: SdfPath[], start: number, end: number, path: SdfPath,
  ): number {
    let rangeSize = end - start
    while (rangeSize > 0) {
      const step = Math.floor(rangeSize / 2)
      const mid = start + step
      if (comparePaths(paths[mid]!, path) < 0) {
        start = mid + 1
        rangeSize -= step + 1
      } else {
        rangeSize = step
      }
    }
    return start
  }

  private _findUpperBound(
    paths: SdfPath[], start: number, end: number, path: SdfPath,
  ): number {
    // Special-case: all remaining paths carry the prefix.
    if (paths[end]!.hasPrefix(path)) return end

    let rangeSize = end - start
    while (rangeSize > 0) {
      const step = Math.floor(rangeSize / 2)
      const mid = start + step
      if (paths[mid]!.hasPrefix(path)) {
        start = mid + 1
        rangeSize -= step + 1
      } else {
        rangeSize = step
      }
    }
    // start is the first path WITHOUT the prefix; inclusive range wants -1.
    return start - 1
  }

  private _filterRange(
    paths: SdfPath[], start: number, end: number, isIncludeRange: boolean,
  ): void {
    const stack: Array<{ range: Range; include: boolean }> = [
      { range: { start, end }, include: isIncludeRange },
    ]

    while (stack.length > 0) {
      const top = stack.pop()!
      start = top.range.start
      end = top.range.end
      isIncludeRange = top.include

      // No filters left: emit if this range is included.
      if (this._filterList.length === 0) {
        if (isIncludeRange) this._gatheredRanges.push({ start, end })
        continue
      }

      // Filter list is sorted descending; the last element is the smallest.
      const currentFilter = this._filterList[this._filterList.length - 1]!

      // Filter is beyond the end of the range — nothing more to do here.
      if (comparePaths(currentFilter.path, paths[end]!) > 0) {
        if (isIncludeRange) this._gatheredRanges.push({ start, end })
        continue
      }

      // Consume the filter.
      this._filterList.pop()

      // Same polarity is a no-op; re-run the range against the next filter.
      let skipFilter = currentFilter.includePath === isIncludeRange
      // Filter entirely before the start of the range?
      skipFilter ||= comparePaths(paths[start]!, currentFilter.path) > 0 &&
        !paths[start]!.hasPrefix(currentFilter.path)

      if (skipFilter) {
        stack.push({ range: { start, end }, include: isIncludeRange })
        continue
      }

      // Split the range around the filter's subtree.
      const lowerBound = this._findLowerBound(paths, start, end, currentFilter.path)
      const upperBound = this._findUpperBound(paths, lowerBound, end, currentFilter.path)

      if (upperBound < end) {
        stack.push({ range: { start: upperBound + 1, end }, include: isIncludeRange })
      }
      // The hit region flips polarity.
      stack.push({ range: { start: lowerBound, end: upperBound }, include: !isIncludeRange })
      if (start < lowerBound) {
        stack.push({ range: { start, end: lowerBound - 1 }, include: isIncludeRange })
      }
    }
  }

  private _setupFilter(includePaths: SdfPath[], excludePaths: SdfPath[]): void {
    this._filterList = []
    for (const inc of includePaths) this._filterList.push({ path: inc, includePath: true })
    for (const exc of excludePaths) this._filterList.push({ path: exc, includePath: false })
    // Inverted sort (descending) so we can pop the smallest off the back.
    this._filterList.sort((a, b) => comparePaths(b.path, a.path))
  }

  private _gatherPaths(paths: SdfPath[]): void {
    this._gatheredRanges = []
    if (paths.length === 0) return

    // Fast path: include-everything.
    if (
      this._filterList.length === 1 &&
      this._filterList[0]!.includePath &&
      this._filterList[0]!.path.isAbsoluteRootPath()
    ) {
      this._gatheredRanges.push({ start: 0, end: paths.length - 1 })
      return
    }

    // Start with everything excluded.
    this._filterRange(paths, 0, paths.length - 1, false)
  }

  private _filterSubTree(paths: SdfPath[], rootPath: SdfPath): void {
    this._gatheredRanges = []
    if (paths.length === 0) return
    if (rootPath.isAbsoluteRootPath()) {
      this._gatheredRanges.push({ start: 0, end: paths.length - 1 })
      return
    }
    const lower = this._findLowerBound(paths, 0, paths.length - 1, rootPath)
    if (lower >= paths.length || !paths[lower]!.hasPrefix(rootPath)) return
    const upper = this._findUpperBound(paths, lower, paths.length - 1, rootPath)
    this._gatheredRanges.push({ start: lower, end: upper })
  }

  private _writeResults(paths: SdfPath[], ranges: Range[]): SdfPath[] {
    const out: SdfPath[] = []
    for (const r of ranges) {
      for (let i = r.start; i <= r.end; i++) out.push(paths[i]!)
    }
    return out
  }
}
