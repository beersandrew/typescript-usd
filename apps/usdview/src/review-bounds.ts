// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py,
//  pxr/usdImaging/usdviewq/rootDataModel.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { BBox3d,Range3d,Vec3d } from 'typescript-usd/gf'
import { BBoxCache, PointInstancer } from 'typescript-usd/usdGeom'
import {PrimSelectionModel} from './selection-model'
import type {PrimSelection} from './contracts'
import type { Stage } from 'typescript-usd/usd'
import { displayPurposes, type DisplaySettings } from './display-settings'

/** stageView.py getSelectionBBox/_processBBoxes, OpenUSD v26.11.1.
 * rootDataModel.py:38-39 enables authored model extents hints by default.
 * Keep the oriented bound from BBoxCache; deriving it from an AABB loses rotation.
 */
export function reviewBounds(stage:Stage, time:number, path:string|null, instanceIndex:number|undefined, settings:DisplaySettings,selections?:readonly PrimSelection[]): Float32Array<ArrayBuffer> {
 const cache = new BBoxCache(time, displayPurposes(settings),settings.useExtentsHint)
 let box = selections ? computeSelectionBounds(stage,time,selections,settings) : new BBox3d()
 for (const primPath of selections ? [] : path ? [path] : stage.getChildPrimPaths('/')) {
  const prim = stage.getPrim(primPath)
  if (!prim) continue
  const bound = instanceIndex === undefined ? cache.computeWorldBound(prim) : cache.computePointInstanceWorldBound(new PointInstancer(prim,stage),instanceIndex)
  box = BBox3d.combine(box,bound)
 }
 const boxes = [...(settings.showAABBox ? [new BBox3d(box.ComputeAlignedRange())] : []),...(settings.showOBBox ? [box] : [])]
 const vertices:number[] = []
 for (const bound of boxes) {
  const range=bound.getRange(), matrix=bound.getMatrix()
  if (range.IsEmpty()) continue
  const corners=Array.from({length:8},(_,i)=>Array.from(matrix.Transform(range.getCorner(i)).data))
  if (!corners.every(c=>c.every(Number.isFinite))) continue
  for (let i=0;i<8;i++) for (const bit of [1,2,4]) if (!(i&bit)) {
   const start=corners[i]!, end=corners[i|bit]!
   vertices.push(...start,...start,...end,...start)
  }
 }
 return new Float32Array(vertices)
}

/** stageView.py:1137-1143 unions active LCD prim bounds, independent of the
 * selected instance-index sets. Native expectations: usdviewSelection fixture. */
export function computeSelectionBounds(stage:Stage,time:number,selections:readonly PrimSelection[],settings:DisplaySettings):BBox3d {
 const cache=new BBoxCache(time,displayPurposes(settings),settings.useExtentsHint);let box=new BBox3d()
 const paths=new PrimSelectionModel(selections).snapshot().lcdPaths
 for(const path of paths){
  const prim=stage.getPrim(path)
  if(prim&&prim.isActive&&!prim.isInPrototype()){
   const bound=cache.computeWorldBound(prim)
   if(!bound.ComputeAlignedRange().IsEmpty())box=BBox3d.combine(box,bound)
  }
 }
 // stageView.py:1019-1026: root-only empty stages frame the native default box.
 if(paths.length===1&&paths[0]==='/'&&box.getRange().IsEmpty())return new BBox3d(new Range3d(new Vec3d(-10,-10,-10),new Vec3d(10,10,10)))
 return box
}
