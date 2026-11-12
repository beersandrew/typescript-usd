// Ported from OpenUSD 26.11.1: pxr/usd/pcp/dependencies.cpp,
//  pxr/usd/pcp/dependencies.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Pcp_Dependencies — tracks the dependencies of a PcpCache's prim indexes on
// layer stack sites. Port of OpenUSD v26.08 pxr/usd/pcp/dependencies.{h,cpp}.
//
// Only sites reached through direct arcs are stored; PcpCache derives root and
// ancestral dependencies at query time (PcpCache::FindSiteDependencies).

import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathTable } from 'typescript-usd/sdf/pathTable'
import { pcpNodeIntroducesDependency } from './dependency.ts'
import type { PcpDynamicFileFormatDependencyData } from './dynamicFileFormatDependencyData.ts'
import type { PcpExpressionVariablesDependencyData } from './expressionVariablesDependencyData.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'
import type { PcpLayerStack } from './layerStack.ts'
import { PcpNodeSubtreeIterator } from './node.ts'
import type { PcpNodeRef } from './node.ts'
import type { PcpPrimIndex, PcpCulledDependency } from './primIndex.ts'
import { pcpShouldCheckSubtreeForDependencies } from './primIndex.ts'
import type { PcpLifeboat } from './changes.ts'

type SiteDepMap = SdfPathTable<SdfPath[]>

// _PrimIndexCanIntroduceDependencies (dependencies.cpp:48-53).
function primIndexCanIntroduceDependencies(primIndex: PcpPrimIndex): boolean {
  return primIndex.getGraph()?.hasNewNodes() ?? false
}

// The nodes of primIndex whose sites Add/Remove register: each subtree
// rooted at a node that checks for dependencies, skipping culled subtrees
// and nodes that introduce no dependency (dependencies.cpp:100-139).
function forEachDependencyNode(primIndex: PcpPrimIndex, fn: (node: PcpNodeRef) => void): void {
  for (const it = new PcpNodeSubtreeIterator(primIndex.getRootNode()); it.node; it.next()) {
    const depNode = it.node
    if (!pcpShouldCheckSubtreeForDependencies(depNode)) continue
    for (const depIt = new PcpNodeSubtreeIterator(depNode); depIt.node; depIt.next()) {
      const n = depIt.node
      if (n.isCulled) {
        depIt.pruneChildren()
        continue
      }
      if (!pcpNodeIntroducesDependency(n)) continue
      fn(n)
    }
    it.pruneChildren()
  }
}

export class PcpDependencies {
  private readonly _deps = new Map<PcpLayerStack, SiteDepMap>()
  private _layerStacksRevision = 0
  private readonly _culledDependenciesMap = new Map<string, PcpCulledDependency[]>()
  private readonly _fileFormatArgumentDependencyMap =
    new Map<string, PcpDynamicFileFormatDependencyData>()
  private readonly _possibleDynamicFileFormatArgumentFields = new Map<string, number>()
  private readonly _possibleDynamicFileFormatArgumentAttributes = new Map<string, number>()
  private readonly _exprVarsDependencyMap = new Map<string, PcpExpressionVariablesDependencyData>()
  private readonly _layerStackExprVarsMap = new Map<PcpLayerStack, SdfPath[]>()

  // Add (dependencies.cpp:55-196).
  add(
    primIndex: PcpPrimIndex,
    culledDependencies: PcpCulledDependency[],
    fileFormatDependencyData: PcpDynamicFileFormatDependencyData,
    exprVarDependencyData: PcpExpressionVariablesDependencyData,
  ): void {
    if (!primIndex.isValid()) return
    const primIndexPath = primIndex.getRootNode().path
    if (!primIndexCanIntroduceDependencies(primIndex)) return

    const addDependency = (layerStack: PcpLayerStack, path: SdfPath): void => {
      let siteDepMap = this._deps.get(layerStack)
      if (!siteDepMap) {
        this._deps.set(layerStack, siteDepMap = new SdfPathTable<SdfPath[]>([]))
        ++this._layerStacksRevision
      }
      const existing = siteDepMap.get(path)
      // Implicitly inserted ancestors share the default array; give each
      // site its own.
      if (existing === undefined || existing.length === 0) siteDepMap.set(path, [primIndexPath])
      else existing.push(primIndexPath)
    }

    forEachDependencyNode(primIndex, n => addDependency(n.getLayerStack(), n.path))

    if (culledDependencies.length > 0) {
      for (const dep of culledDependencies) addDependency(dep.layerStack, dep.sitePath)
      const key = primIndexPath.pathString
      const deps = this._culledDependenciesMap.get(key)
      if (!deps) this._culledDependenciesMap.set(key, [...culledDependencies])
      else deps.unshift(...culledDependencies)
    }

    if (!fileFormatDependencyData.isEmpty()) {
      const addNames = (depMap: Map<string, number>, names: Iterable<string>): void => {
        for (const name of names) depMap.set(name, (depMap.get(name) ?? 0) + 1)
      }
      addNames(this._possibleDynamicFileFormatArgumentFields,
        fileFormatDependencyData.getRelevantFieldNames())
      addNames(this._possibleDynamicFileFormatArgumentAttributes,
        fileFormatDependencyData.getRelevantAttributeNames())
      this._fileFormatArgumentDependencyMap.set(primIndexPath.pathString, fileFormatDependencyData)
    }

    if (!exprVarDependencyData.isEmpty()) {
      exprVarDependencyData.forEachDependency((layerStack) => {
        let paths = this._layerStackExprVarsMap.get(layerStack)
        if (!paths) this._layerStackExprVarsMap.set(layerStack, paths = [])
        paths.push(primIndexPath)
      })
      this._exprVarsDependencyMap.set(primIndexPath.pathString, exprVarDependencyData)
    }
  }

  // Remove (dependencies.cpp:198-340).
  remove(primIndex: PcpPrimIndex, lifeboat?: PcpLifeboat | null): void {
    if (!primIndex.isValid()) return
    const primIndexPath = primIndex.getRootNode().path
    if (!primIndexCanIntroduceDependencies(primIndex)) return

    const removeDependency = (layerStack: PcpLayerStack, path: SdfPath): void => {
      const siteDepMap = this._deps.get(layerStack)
      const deps = siteDepMap?.get(path)
      if (!siteDepMap || !deps) return
      const i = deps.findIndex(p => p.pathString === primIndexPath.pathString)
      if (i < 0) return
      deps[i] = deps[deps.length - 1]!
      deps.pop()
      if (deps.length > 0) return
      // Clean up the site entry if its subtree holds no dependencies, and
      // any ancestor entries left with nothing below them.
      let subtreeIsEmpty = true
      siteDepMap.forEachInSubtree(path, (_p, value) => { if (value.length > 0) subtreeIsEmpty = false })
      if (!subtreeIsEmpty) return
      siteDepMap.erase(path)
      for (let p = path.getParentPath(); !p.isEmpty(); p = p.getParentPath()) {
        const value = siteDepMap.get(p)
        if (value !== undefined && value.length === 0 && !siteDepMap.hasChild(p)) {
          siteDepMap.erase(p)
        } else {
          break
        }
        if (p.isAbsoluteRootPath()) break
      }
      if (siteDepMap.empty()) {
        lifeboat?.retain(layerStack)
        this._deps.delete(layerStack)
        ++this._layerStacksRevision
      }
    }

    forEachDependencyNode(primIndex, n => removeDependency(n.getLayerStack(), n.path))

    const key = primIndexPath.pathString
    const culled = this._culledDependenciesMap.get(key)
    if (culled) {
      for (const dep of culled) removeDependency(dep.layerStack, dep.sitePath)
      this._culledDependenciesMap.delete(key)
    }

    const ffDeps = this._fileFormatArgumentDependencyMap.get(key)
    if (ffDeps) {
      const removeNames = (depMap: Map<string, number>, names: Iterable<string>): void => {
        for (const name of names) {
          const count = depMap.get(name)
          if (count === undefined) continue
          if (count <= 1) depMap.delete(name)
          else depMap.set(name, count - 1)
        }
      }
      removeNames(this._possibleDynamicFileFormatArgumentFields, ffDeps.getRelevantFieldNames())
      removeNames(this._possibleDynamicFileFormatArgumentAttributes,
        ffDeps.getRelevantAttributeNames())
      this._fileFormatArgumentDependencyMap.delete(key)
    }

    const exprDeps = this._exprVarsDependencyMap.get(key)
    if (exprDeps) {
      exprDeps.forEachDependency((layerStack) => {
        const paths = this._layerStackExprVarsMap.get(layerStack)
        if (!paths) return
        const kept = paths.filter(p => p.pathString !== key)
        if (kept.length === 0) this._layerStackExprVarsMap.delete(layerStack)
        else this._layerStackExprVarsMap.set(layerStack, kept)
      })
      this._exprVarsDependencyMap.delete(key)
    }
  }

  // RemoveAll (dependencies.cpp:342-360).
  removeAll(lifeboat?: PcpLifeboat | null): void {
    if (lifeboat) for (const layerStack of this._deps.keys()) lifeboat.retain(layerStack)
    this._deps.clear()
    ++this._layerStacksRevision
    this._possibleDynamicFileFormatArgumentFields.clear()
    this._possibleDynamicFileFormatArgumentAttributes.clear()
    this._culledDependenciesMap.clear()
    this._fileFormatArgumentDependencyMap.clear()
    this._exprVarsDependencyMap.clear()
    this._layerStackExprVarsMap.clear()
  }

  // ForEachDependencyOnSite (dependencies.h).
  forEachDependencyOnSite(
    siteLayerStack: PcpLayerStack, sitePath: SdfPath,
    includeAncestral: boolean, recurseBelowSite: boolean,
    fn: (primIndexPath: SdfPath, sitePath: SdfPath) => void,
  ): void {
    const siteDepMap = this._deps.get(siteLayerStack)
    if (!siteDepMap) return
    if (recurseBelowSite) {
      // Collect first: fn may not mutate the table, but keep iteration
      // independent of the visitor.
      const range = siteDepMap.findSubtreeRange(sitePath)
      for (const [path, deps] of range) {
        for (const primIndexPath of [...deps]) fn(primIndexPath, path)
      }
    } else {
      const deps = siteDepMap.get(sitePath)
      if (deps) for (const primIndexPath of [...deps]) fn(primIndexPath, sitePath)
    }
    if (!includeAncestral) return
    if (siteLayerStack.isUsd() && sitePath.isPrimVariantSelectionPath()) return
    for (let ancestor = sitePath.getParentPath(); !ancestor.isEmpty();
      ancestor = ancestor.getParentPath()) {
      const deps = siteDepMap.get(ancestor)
      if (deps) for (const primIndexPath of [...deps]) fn(primIndexPath, ancestor)
      if (siteLayerStack.isUsd() && ancestor.isPrimVariantSelectionPath()) break
      if (ancestor.isAbsoluteRootPath()) break
    }
  }

  // LayerStacksChanged (dependencies.h).
  layerStacksChanged(): void { ++this._layerStacksRevision }

  // GetUsedLayers (dependencies.cpp:362-372).
  getUsedLayers(): Set<PcpLayer> {
    const reached = new Set<PcpLayer>()
    for (const layerStack of this._deps.keys()) {
      for (const { layer } of layerStack.layers) reached.add(layer)
    }
    return reached
  }

  getLayerStacksRevision(): number { return this._layerStacksRevision }

  /**
   * @internal The layer stacks this object retains: the keys of _deps
   * (dependencies.h:274-276) and the culled dependencies' layer stacks.
   */
  _forEachRetainedLayerStack(fn: (layerStack: PcpLayerStack) => void): void {
    for (const layerStack of this._deps.keys()) fn(layerStack)
    for (const culled of this._culledDependenciesMap.values()) {
      for (const dep of culled) fn(dep.layerStack)
    }
  }

  // GetUsedRootLayers (dependencies.cpp:374-383).
  getUsedRootLayers(): Set<PcpLayer> {
    const reached = new Set<PcpLayer>()
    for (const layerStack of this._deps.keys()) reached.add(layerStack.identifier.rootLayer as PcpLayer)
    return reached
  }

  usesLayerStack(layerStack: PcpLayerStack): boolean { return this._deps.has(layerStack) }

  getCulledDependencies(primIndexPath: SdfPath): readonly PcpCulledDependency[] {
    return this._culledDependenciesMap.get(primIndexPath.pathString) ?? []
  }

  hasAnyDynamicFileFormatArgumentFieldDependencies(): boolean {
    return this._possibleDynamicFileFormatArgumentFields.size > 0
  }

  hasAnyDynamicFileFormatArgumentAttributeDependencies(): boolean {
    return this._possibleDynamicFileFormatArgumentAttributes.size > 0
  }

  isPossibleDynamicFileFormatArgumentField(field: string): boolean {
    return this._possibleDynamicFileFormatArgumentFields.has(field)
  }

  isPossibleDynamicFileFormatArgumentAttribute(attributeName: string): boolean {
    return this._possibleDynamicFileFormatArgumentAttributes.has(attributeName)
  }

  getDynamicFileFormatArgumentDependencyData(
    primIndexPath: SdfPath,
  ): PcpDynamicFileFormatDependencyData | undefined {
    return this._fileFormatArgumentDependencyMap.get(primIndexPath.pathString)
  }

  getPrimsUsingExpressionVariablesFromLayerStack(layerStack: PcpLayerStack): readonly SdfPath[] {
    return this._layerStackExprVarsMap.get(layerStack) ?? []
  }

  getExpressionVariablesFromLayerStackUsedByPrim(
    primIndexPath: SdfPath, layerStack: PcpLayerStack,
  ): ReadonlySet<string> {
    return this._exprVarsDependencyMap.get(primIndexPath.pathString)
      ?.getDependenciesForLayerStack(layerStack) ?? new Set()
  }
}
