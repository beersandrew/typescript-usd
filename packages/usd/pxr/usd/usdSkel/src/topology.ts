// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/topology.cpp,
//  pxr/usd/usdSkel/topology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdSkel/topology.{h,cpp} — UsdSkelTopology
//
// Joint hierarchy described by parent indices computed from ordered joint
// paths. A joint's parent is its closest ANCESTOR path present in the array
// (not necessarily the direct namespace parent), or -1 for roots. The schema
// requires parents to be ordered before children, which Validate enforces
// (and which guarantees the hierarchy is acyclic).

import { SdfPath } from 'typescript-usd/sdf/path'

// _GetParentIndex (topology.cpp:22-40): recurse over all ancestor paths,
// not just the direct parent. For instance, if the map includes only paths
// 'a' and 'a/b/c', 'a' will be treated as the parent of 'a/b/c'. Paths that
// are not prim paths (empty, '/', '..') are roots.
function _getParentIndex(pathMap: ReadonlyMap<string, number>, path: SdfPath): number {
  if (path.isPrimPath()) {
    const range = path.getAncestorsRange()
    range.next()
    for (const ancestor of range) {
      const index = pathMap.get(ancestor.pathString)
      if (index !== undefined) return index
    }
  }
  return -1
}

// _ComputeParentIndicesFromPaths / _ComputeParentIndicesFromTokens
// (topology.cpp:43-73).
export function computeParentIndicesFromPaths(paths: readonly (string | SdfPath)[]): Int32Array {
  const sdfPaths = paths.map(p => typeof p === 'string'
    ? (p === '' ? SdfPath.emptyPath : SdfPath.fromString(p)) : p)
  const pathMap = new Map<string, number>()
  for (let i = 0; i < sdfPaths.length; i++) pathMap.set(sdfPaths[i]!.pathString, i)

  const parentIndices = new Int32Array(paths.length).fill(-1)
  for (let i = 0; i < sdfPaths.length; i++) {
    parentIndices[i] = _getParentIndex(pathMap, sdfPaths[i]!)
  }
  return parentIndices
}

export class UsdSkelTopology {
  private readonly _parentIndices: Int32Array

  // Construct from ordered joint paths (tokens) or parent indices.
  constructor(pathsOrParentIndices: readonly (string | SdfPath)[] | Int32Array | number[]) {
    if (pathsOrParentIndices instanceof Int32Array) {
      this._parentIndices = pathsOrParentIndices
    } else if (pathsOrParentIndices.length > 0 && typeof pathsOrParentIndices[0] === 'number') {
      this._parentIndices = new Int32Array(pathsOrParentIndices as number[])
    } else {
      this._parentIndices = computeParentIndicesFromPaths(pathsOrParentIndices as (string | SdfPath)[])
    }
  }

  get size(): number { return this._parentIndices.length }
  getNumJoints(): number { return this.size }
  getParentIndices(): Int32Array { return this._parentIndices }
  getParent(joint: number): number { return this._parentIndices[joint] ?? -1 }
  isRoot(joint: number): boolean { return this.getParent(joint) < 0 }

  // Parents must be ordered before children (schema requirement; also
  // guarantees the hierarchy is non-cyclic).
  validate(): { valid: boolean; reason?: string } {
    for (let i = 0; i < this.size; i++) {
      const parent = this._parentIndices[i]!
      if (parent >= 0 && parent >= i) {
        if (parent === i) {
          return { valid: false, reason: `Joint ${i} has itself as its parent.` }
        }
        return {
          valid: false,
          reason: `Joint ${i} has mis-ordered parent ${parent}. Joints are ` +
            `expected to be ordered with parent joints always coming before children.`,
        }
      }
    }
    return { valid: true }
  }
}
