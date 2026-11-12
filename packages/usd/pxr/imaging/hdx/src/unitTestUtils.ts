// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/unitTestUtils.cpp,
//  pxr/imaging/hdx/unitTestUtils.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/unitTestUtils.{h,cpp} (OpenUSD 26.11.1):
// HdxUnitTestUtils, the picking helpers of the hdx testenv programs.
//
// Divergences:
// - Marquee (unitTestUtils.h:43-57, unitTestUtils.cpp:197-288) draws the
//   drag rectangle of the interactive runs with immediate-mode OpenGL; the
//   ported programs run offscreen only and there is no GL here, so it is
//   not ported.
// - std::cout is the `out` callback (the programs collect their stdout).
// - _AggregateHits keys by the hit's delegate, object, instancer and
//   instance index rather than TfHash::Combine of them, and keeps first-seen
//   order rather than unordered_map order (std::set<int> is a sorted array).

import { Frustum as GfFrustum, Range2d as GfRange2d, Vec2d as GfVec2d, Vec2i as GfVec2i, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Selection as HdSelection, type SelectionHighlightMode as HdSelectionHighlightMode } from 'typescript-usd/hd'
import { HdxPickTokens, type HdxPickHit, type HdxPickHitVector } from './pickTask.ts'

/** unitTestUtils.cpp:23-31 */
class AggregatedHit {
  elementIndices = new Set<number>()
  edgeIndices = new Set<number>()
  pointIndices = new Set<number>()
  constructor(readonly hit: HdxPickHit) {}
}

const _sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b)

/** unitTestUtils.cpp:33-46 (see the header). */
function _GetPartialHitHash(hit: HdxPickHit): string {
  return JSON.stringify([hit.delegateId, hit.objectId, hit.instancerId, hit.instanceIndex])
}

/** unitTestUtils.cpp:50-80. aggregates subprimitive hits to the same
 *  prim/instance */
function _AggregateHits(allHits: HdxPickHitVector): Map<string, AggregatedHit> {
  const aggrHits = new Map<string, AggregatedHit>()

  for (const hit of allHits) {
    const hitHash = _GetPartialHitHash(hit)
    const it = aggrHits.get(hitHash)
    if (it) {
      // aggregate the element and edge indices
      it.elementIndices.add(hit.elementIndex)
      if (hit.edgeIndex !== -1) {
        it.edgeIndices.add(hit.edgeIndex)
      }
      if (hit.pointIndex !== -1) {
        it.pointIndices.add(hit.pointIndex)
      }
      continue
    }

    // add a new entry
    const aHitNew = new AggregatedHit(hit)
    aHitNew.elementIndices.add(hit.elementIndex)
    if (hit.edgeIndex !== -1) {
      aHitNew.edgeIndices.add(hit.edgeIndex)
    }
    if (hit.pointIndex !== -1) {
      aHitNew.pointIndices.add(hit.pointIndex)
    }
    aggrHits.set(hitHash, aHitNew)
  }

  return aggrHits
}

/** unitTestUtils.cpp:82-146 */
function _ProcessHit(aHit: AggregatedHit, pickTarget: string,
  highlightMode: HdSelectionHighlightMode, selection: HdSelection,
  out: (line: string) => void): void {
  const hit = aHit.hit
  const list = (v: number[]) => v.map(x => `${x}, `).join('')

  if (pickTarget === HdxPickTokens.pickPrimsAndInstances) {
    if (hit.instancerId !== '') {
      // XXX :this doesn't work for nested instancing.
      const instanceIndex = [hit.instanceIndex]
      selection.addInstance(highlightMode, hit.objectId, instanceIndex)

      out(`Picked instance [${instanceIndex.join(', ')}] of rprim ${hit.objectId}`)
    } else {
      selection.addRprim(highlightMode, hit.objectId)

      out(`Picked rprim ${hit.objectId}`)
    }
  } else if (pickTarget === HdxPickTokens.pickFaces) {
    const elements = _sorted(aHit.elementIndices)
    selection.addElements(highlightMode, hit.objectId, elements)

    out(`Picked faces ${list(elements)} of prim ${hit.objectId}`)
  } else if (pickTarget === HdxPickTokens.pickEdges) {
    if (aHit.edgeIndices.size > 0) {
      const edges = _sorted(aHit.edgeIndices)
      selection.addEdges(highlightMode, hit.objectId, edges)

      out(`Picked edges ${list(edges)} of prim ${hit.objectId}`)
    }
  } else if (pickTarget === HdxPickTokens.pickPoints) {
    if (aHit.pointIndices.size > 0) {
      const points = _sorted(aHit.pointIndices)
      selection.addPoints(highlightMode, hit.objectId, points)

      out(`Picked points ${list(points)} of prim ${hit.objectId}`)
    }
  } else {
    out('Unsupported picking mode.')
  }
}

/** unitTestUtils.h:27-58 */
export const HdxUnitTestUtils = {
  /** unitTestUtils.cpp:152-166 */
  translateHitsToSelection(pickTarget: string, highlightMode: HdSelectionHighlightMode,
    allHits: HdxPickHitVector, out: (line: string) => void = () => {}): HdSelection {
    const selection = new HdSelection()

    const aggrHits = _AggregateHits(allHits)
    for (const aHit of aggrHits.values()) {
      _ProcessHit(aHit, pickTarget, highlightMode, selection, out)
    }

    return selection
  },

  /** unitTestUtils.cpp:168-176. For a drag-select from start to end, with
   *  given pick radius, what size ID buffer should we ask for? */
  calculatePickResolution(start: GfVec2i, end: GfVec2i, pickRadius: GfVec2i): GfVec2i {
    const fwidth = Math.max(pickRadius.get(0), Math.abs(start.get(0) - end.get(0)))
    const fheight = Math.max(pickRadius.get(1), Math.abs(start.get(1) - end.get(1)))

    return new GfVec2i(fwidth, fheight)
  },

  /** unitTestUtils.cpp:178-195 */
  computePickingProjectionMatrix(start: GfVec2i, end: GfVec2i, screen: GfVec2i,
    viewFrustum: GfFrustum): GfMatrix4d {
    const f = Math.fround
    // Single-precision arithmetic (int / float(screen)) stored as doubles.
    let min = [f(f(2 * start.get(0) / f(screen.get(0))) - 1), f(1 - f(2 * start.get(1) / f(screen.get(1))))]
    let max = [f(f(2 * (end.get(0) + 1) / f(screen.get(0))) - 1), f(1 - f(2 * (end.get(1) + 1) / f(screen.get(1))))]
    // scale window
    const window = viewFrustum.getWindow()
    const origin = window.getMin()
    const wMax = window.getMax()
    const scale = [wMax.get(0) - origin.get(0), wMax.get(1) - origin.get(1)]
    min = [origin.get(0) + scale[0]! * (0.5 * (1.0 + min[0]!)), origin.get(1) + scale[1]! * (0.5 * (1.0 + min[1]!))]
    max = [origin.get(0) + scale[0]! * (0.5 * (1.0 + max[0]!)), origin.get(1) + scale[1]! * (0.5 * (1.0 + max[1]!))]

    const pickFrustum = new GfFrustum(viewFrustum)
    pickFrustum.setWindow(new GfRange2d(new GfVec2d(min[0]!, min[1]!), new GfVec2d(max[0]!, max[1]!)))

    return pickFrustum.computeProjectionMatrix()
  },
}
