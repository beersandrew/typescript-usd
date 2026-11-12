// Ported from OpenUSD 26.11.1: pxr/usd/pcp/propertyIndex.cpp,
//  pxr/usd/pcp/propertyIndex.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Property-index result and builders from OpenUSD v26.08
// pxr/usd/pcp/propertyIndex.{h,cpp}. typescript-usd caches are USD-mode, so the
// indexer gathers specs without permission enforcement or attribute
// type/variability checks (propertyIndex.cpp:349-373).

import { type Layer, Spec as SdfSpec, type SpecType as SdfSpecType } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { PcpCache } from './cache.ts'
import { pcpErrorInconsistentPropertyType, type PcpError } from './errors.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'
import type { PcpNodeRef } from './node.ts'
import { pcpTranslatePathFromRootToNode } from './pathTranslation.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import { pcpSite, type PcpSite } from './site.ts'
import { PcpPropertyIterator, PcpPropertyRange, PcpPropertyReverseIterator } from './iterator.ts'

// Pcp_PropertyInfo: a property spec and the node it came from.
export interface PcpPropertyInfo {
  readonly propertySpec: SdfSpec
  readonly originatingNode: PcpNodeRef
}

export class PcpPropertyIndex {
  /** @internal The property stack, strongest first. */
  _propertyStack: PcpPropertyInfo[] = []
  /** @internal */
  _localErrors: PcpError[] | null = null

  /** @internal */
  get infos(): readonly PcpPropertyInfo[] { return this._propertyStack }

  // GetPropertyRange (propertyIndex.cpp:59-87): the local range is the run
  // of specs from the root node.
  getPropertyRange(localOnly = false): PcpPropertyRange {
    const stack = this._propertyStack
    if (localOnly) {
      let startIdx = 0
      for (; startIdx < stack.length; ++startIdx) {
        if (stack[startIdx]!.originatingNode.isRootNode()) break
      }
      let endIdx = startIdx
      for (; endIdx < stack.length; ++endIdx) {
        if (!stack[endIdx]!.originatingNode.isRootNode()) break
      }
      const foundLocalSpecs = startIdx !== endIdx
      return new PcpPropertyRange(
        new PcpPropertyIterator(this, foundLocalSpecs ? startIdx : 0),
        new PcpPropertyIterator(this, foundLocalSpecs ? endIdx : 0))
    }
    return new PcpPropertyRange(
      new PcpPropertyIterator(this, 0), new PcpPropertyIterator(this, stack.length))
  }

  get propertyStack(): readonly SdfSpec[] {
    return this._propertyStack.map(info => info.propertySpec)
  }

  get localPropertyStack(): readonly SdfSpec[] {
    return [...this.getPropertyRange(true)]
  }

  get localErrors(): readonly PcpError[] { return this._localErrors ?? [] }

  isEmpty(): boolean { return this._propertyStack.length === 0 }

  getNumLocalSpecs(): number {
    let numLocalSpecs = 0
    for (const info of this._propertyStack) {
      if (info.originatingNode.isRootNode()) numLocalSpecs++
    }
    return numLocalSpecs
  }
}

// Pcp_PropertyIndexer (propertyIndex.cpp:113-287).
class PropertyIndexer {
  private _firstSpec: SdfSpec | null = null
  private _propType: SdfSpecType | null = null

  constructor(
    private readonly _propIndex: PcpPropertyIndex,
    private readonly _propSite: PcpSite,
    private readonly _allErrors: PcpError[],
  ) {}

  // _GetPrimProperty: the property spec with the given name if it is
  // consistent with previously seen specs.
  private _getPrimProperty(
    layer: PcpLayer, owningPrimPath: SdfPath, name: string,
  ): SdfSpec | null {
    if (!layer.hasSpec(owningPrimPath.pathString)) return null
    const propPath = owningPrimPath.appendProperty(name).pathString
    if (!layer.hasSpec(propPath)) return null
    const propType = layer.getSpecType(propPath) as SdfSpecType
    if (propType !== 'attribute' && propType !== 'relationship') return null
    const propSpec = (layer as Layer).getPropertyAtPath(propPath)!
    if (this._propType === null) {
      // First one: record the property type and layer.
      this._firstSpec = propSpec
      this._propType = propType
    } else if (this._propType !== propType) {
      this._recordError(pcpErrorInconsistentPropertyType({
        rootSite: this._propSite,
        definingLayerIdentifier: this._firstSpec!.getLayer().filePath,
        definingSpecPath: this._firstSpec!.getPath().pathString,
        definingSpecType: this._propType,
        conflictingLayerIdentifier: layer.filePath,
        conflictingSpecPath: propPath,
        conflictingSpecType: propType,
      }))
      return null
    }
    return propSpec
  }

  // _GetRelationalAttribute.
  private _getRelationalAttribute(layer: PcpLayer, relAttrPath: SdfPath): SdfSpec | null {
    const path = relAttrPath.pathString
    if (!layer.hasSpec(path) || layer.getSpecType(path) !== 'attribute') return null
    const attr = (layer as Layer).getAttributeAtPath(path)!
    this._firstSpec ??= attr
    return attr
  }

  // _RecordError: in this property index's local errors and allErrors.
  private _recordError(err: PcpError): void {
    this._allErrors.push(err)
    ;(this._propIndex._localErrors ??= []).push(err)
  }

  // GatherPropertySpecs, USD mode (propertyIndex.cpp:356-372).
  gatherPropertySpecs(primIndex: PcpPrimIndex): void {
    const name = SdfPath.fromString(this._propSite.path).name
    const propertyInfo: PcpPropertyInfo[] = []
    for (const node of primIndex.getNodeRange()) {
      if (!node.canContributeSpecs()) continue
      const nodePath = node.getPath()
      for (const { layer } of node.getLayerStack().layers) {
        const propSpec = this._getPrimProperty(layer, nodePath, name)
        if (propSpec) propertyInfo.push({ propertySpec: propSpec, originatingNode: node })
      }
    }
    this._propIndex._propertyStack = propertyInfo
  }

  // GatherRelationalAttributeSpecs, USD mode (propertyIndex.cpp:378-433).
  gatherRelationalAttributeSpecs(relIndex: PcpPropertyIndex): void {
    const relAttrPath = SdfPath.fromString(this._propSite.path)
    const propertyInfo: PcpPropertyInfo[] = []
    const propRange = relIndex.getPropertyRange()
    const relIt = new PcpPropertyReverseIterator(propRange.second)
    const relItEnd = new PcpPropertyReverseIterator(propRange.first)
    while (!relIt.equals(relItEnd)) {
      const curNode = relIt.getNode()
      const relAttrPathInNodeNS = pcpTranslatePathFromRootToNode(curNode, relAttrPath).path
      for (; !relIt.equals(relItEnd) && relIt.getNode().equals(curNode); relIt.increment()) {
        if (relAttrPathInNodeNS.isEmpty()) continue
        const relAttrSpec = this._getRelationalAttribute(
          relIt.deref().getLayer() as PcpLayer, relAttrPathInNodeNS)
        // USD does not enforce permissions.
        if (relAttrSpec) propertyInfo.push({ propertySpec: relAttrSpec, originatingNode: curNode })
      }
    }
    propertyInfo.reverse()
    this._propIndex._propertyStack = propertyInfo
  }
}

function sdfPath(value: SdfPath | string): SdfPath {
  return typeof value === 'string' ? SdfPath.fromString(value) : value
}

/** PcpBuildPrimPropertyIndex (propertyIndex.cpp:496-505). Returns the index and errors. */
export function pcpBuildPrimPropertyIndex(
  propertyPath: SdfPath | string,
  cache: PcpCache,
  primIndex: PcpPrimIndex,
  allErrors: PcpError[] = [],
): readonly [PcpPropertyIndex, readonly PcpError[]] {
  const path = sdfPath(propertyPath)
  const propertyIndex = new PcpPropertyIndex()
  const propSite = pcpSite(cache.getLayerStackIdentifier(), path.pathString)
  new PropertyIndexer(propertyIndex, propSite, allErrors).gatherPropertySpecs(primIndex)
  return [propertyIndex, allErrors]
}

/**
 * Synchronous PcpBuildPropertyIndex (propertyIndex.cpp:435-494). Throws
 * PcpNeedsLayer when a layer must load.
 * @internal
 */
export function _pcpBuildPropertyIndexSync(
  propertyPath: SdfPath, cache: PcpCache, allErrors: PcpError[],
): PcpPropertyIndex {
  const propertyIndex = new PcpPropertyIndex()
  if (!propertyPath.isPropertyPath()) {
    throw new Error(`Path <${propertyPath.pathString}> is not a property path`)
  }
  let parentPath = propertyPath.getParentPath()
  // A target path parent makes this a relational attribute; step up to the
  // relationship.
  if (parentPath.isTargetPath()) parentPath = parentPath.getParentPath()
  if (parentPath.isPrimPath()) {
    const [built] = pcpBuildPrimPropertyIndex(
      propertyPath, cache, cache.computePrimIndexSync(parentPath, allErrors), allErrors)
    return built
  }
  if (parentPath.isPrimPropertyPath()) {
    const propSite = pcpSite(cache.getLayerStackIdentifier(), propertyPath.pathString)
    const indexer = new PropertyIndexer(propertyIndex, propSite, allErrors)
    // USD mode supplies no cached property indexes; compute one.
    const relIndex = _pcpBuildPropertyIndexSync(parentPath, cache, allErrors)
    indexer.gatherRelationalAttributeSpecs(relIndex)
    return propertyIndex
  }
  throw new Error(`Error, the property <${propertyPath.pathString}> is owned by ` +
    'something that is not a prim or a relationship.')
}

/** PcpBuildPropertyIndex (propertyIndex.cpp:435-494). Returns the index and errors. */
export async function pcpBuildPropertyIndex(
  propertyPath: SdfPath | string,
  cache: PcpCache,
): Promise<readonly [PcpPropertyIndex, readonly PcpError[]]> {
  const path = sdfPath(propertyPath)
  await cache.computePrimIndex(path.getPrimPath())
  const allErrors: PcpError[] = []
  return [_pcpBuildPropertyIndexSync(path, cache, allErrors), allErrors]
}
