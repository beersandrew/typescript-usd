// Ported from OpenUSD 26.11.1: pxr/usd/usd/inherits.cpp,
//  pxr/usd/usd/inherits.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArcType, RangeType } from 'typescript-usd/pcp'
// UsdInherits from OpenUSD v26.08 pxr/usd/usd/inherits.{h,cpp}: edits the
// inherit paths of a prim at the current edit target.

import { ListPositionBackOfPrependList, type UsdListPosition } from './common.ts'
import type { Stage } from './stage.ts'

export class UsdInherits {
  /** @internal */
  constructor(private readonly _stage: Stage, private readonly _primPath: string) {}

  // UsdInherits::GetAllDirectInherits (OpenUSD v26.11.1 inherits.cpp:57-109).
  // Propagated class arcs at the root layer stack already carry namespace
  // mapping through references. Include the specializes subtrees as native does.
  getAllDirectInherits(): string[] {
    const prim = this._stage.getPrim(this._primPath)
    if (!prim) return []
    const result: string[] = [], seen = new Set<string>()
    const index = prim.computeExpandedPrimIndex()
    for (const range of [RangeType.Inherit, RangeType.Specialize]) {
      for (const node of index.getNodeRange(range)) {
        const path = node.getPath().pathString
        if (node.getArcType() === ArcType.Inherit &&
            node.getLayerStack() === node.getRootNode().getLayerStack() &&
            !node.getOriginRootNode().isDueToAncestor() && !seen.has(path)) {
          seen.add(path); result.push(path)
        }
      }
    }
    return result
  }

  /** Adds a path to the inheritPaths listOp at the current EditTarget, in
   * the position specified by position. */
  addInherit(primPath: string, position: UsdListPosition = ListPositionBackOfPrependList): boolean {
    return this._stage._addPathListItem(this._primPath, 'inheritPaths', primPath, position)
  }

  /** Removes the specified path from the inheritPaths listOp at the
   * current EditTarget. */
  removeInherit(primPath: string): boolean {
    return this._stage._removePathListItem(this._primPath, 'inheritPaths', primPath)
  }

  /** Removes the authored inheritPaths listOp edits at the current edit
   * target. */
  clearInherits(): boolean {
    return this._stage._clearListEdits(this._primPath, 'inheritPaths')
  }

  /** Explicitly set the inherited paths, potentially blocking weaker
   * inherited paths that exist. */
  setInherits(items: readonly string[]): boolean {
    return this._stage._setPathListItems(this._primPath, 'inheritPaths', items)
  }
}
