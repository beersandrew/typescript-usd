// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/primTreeWidget.py,
//  pxr/usdImaging/usdviewq/primViewItem.py, pxr/usdImaging/usdviewq/utils.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Prim tree data and presentation rules from native usdview (OpenUSD v26.11.1):
//  usdviewq/utils.cpp:42-94 PrimInfo; appController.py:3455-3496 _populateRoots and
//  _computeDisplayPredicate (instance proxies are always traversed);
//  primViewItem.py:203-334 name/type/vis/guides data; common.py:44-100 colours and fonts;
//  primTreeWidget.py:21-46 row backgrounds; appController.py:1925-1945,3325-3341
//  initial expansion to depth 3 (the pseudo-root, its children and grandchildren).
// Expected values: tests/fixtures/usdviewPropertyView/expected.json (primTree, colors).
import { PrimAllPrimsPredicate, TraverseInstanceProxies, type Prim, type Stage } from 'typescript-usd/usd'
import { modelDrawModeState } from './model-draw-mode'
import { VisibilityAPI } from 'typescript-usd/usdGeom'
import type { PrimInfo, PrimSummary } from './contracts'

/** Retain every authored category for inspection and consumer filtering. The
 * native Show menu can also append prototype roots beneath the pseudo-root. */
export function primTree(stage: Stage, time: number, includePrototypes = false): PrimSummary {
  const children = TraverseInstanceProxies(PrimAllPrimsPredicate)
  const build = (prim: Prim): PrimSummary => ({
    path: prim.path, name: prim.path === '/' ? 'root' : prim.path.slice(prim.path.lastIndexOf('/') + 1),
    typeName: prim.typeName, info: primInfo(stage, prim, time),
    children: prim.getFilteredChildren(children).map(build),
  })
  const root=build(stage.getPrim('/')!)
  if(includePrototypes)for(const prim of stage.getPrototypes?.()??[])root.children.push({...build(prim),prototypeRoot:true})
  return root
}

export function primInfo(stage: Stage, prim: Prim, time: number): PrimInfo {
  const imageable = prim.path !== '/' && prim.isA('Imageable')
  let visibilityInherited = false
  if (imageable) visibilityInherited = (prim.getAttr('visibility')?.getValueAtTime(time) ?? 'inherited') === 'inherited'
  const supportsGuides = prim.isA('Camera')
  const uiHints = prim.getMetadata('uiHints') as { displayName?: unknown } | undefined
  const displayName = typeof uiHints?.displayName === 'string' ? uiHints.displayName : prim.getMetadata('displayName')
  const drawMode=modelDrawModeState(stage,prim)
  return {
    ...(drawMode?{drawMode}:{}),
    hasArcs: prim.hasAuthoredMetadata('references') || prim.hasAuthoredPayloads() || prim.hasAuthoredMetadata('inheritPaths')
      || prim.hasAuthoredMetadata('specializes') || prim.hasAuthoredMetadata('variantSetNames'),
    active: prim.isActive, imageable, defined: prim.isDefined, abstract: prim.isAbstract,
    inPrototype: prim.isInPrototype() || prim.isInstanceProxy(), prototype:prim.isPrototype?.()||prim.isInPrototype(), instance: prim.isInstance(),
    supportsGuides, visibilityInherited,
    guidesVisible: supportsGuides && VisibilityAPI.get(stage, prim.path).getGuideVisibilityAttr()?.getValueAtTime(time) === 'visible',
    displayName: typeof displayName === 'string' ? displayName : '',
  }
}
