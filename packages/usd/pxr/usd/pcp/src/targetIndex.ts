// Ported from OpenUSD 26.11.1: pxr/usd/pcp/targetIndex.cpp,
//  pxr/usd/pcp/targetIndex.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Target-index result and builders from OpenUSD v26.08
// pxr/usd/pcp/targetIndex.{h,cpp}.

import {
  sdfApplyListOpToVector, sdfNormalizeListOp,
  type ListOpType as SdfListOpType, type Spec as SdfSpec, type SpecType as SdfSpecType,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { PcpCache } from './cache.ts'
import {
  pcpErrorInvalidExternalTargetPath, pcpErrorInvalidInstanceTargetPath,
  pcpErrorInvalidTargetPath, pcpErrorTargetPermissionDenied,
  type PcpError, PcpErrorTargetPathBase,
} from './errors.ts'
import { pcpIsInheritArc } from './arc.ts'
import type { PcpNodeRef } from './node.ts'
import { pcpTranslatePathFromNodeToRoot, pcpTranslatePathFromRootToNode } from './pathTranslation.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import type { PcpPropertyIndex } from './propertyIndex.ts'
import type { PcpSite } from './site.ts'

export class PcpTargetIndex {
  constructor(
    public paths: SdfPath[] = [],
    public localErrors: PcpError[] = [],
    public hasTargetOpinions = false,
  ) {}
}

// Pcp_TargetIndexContext: defers computing the target object's prim index
// until needed, then caches it.
class TargetIndexContext {
  private _index: PcpPrimIndex | null = null

  constructor(
    private readonly _cache: PcpCache,
    private readonly _allErrors: PcpError[],
    private readonly _targetObjectPath: SdfPath,
  ) {}

  getCache(): PcpCache { return this._cache }

  getTargetObjectPrimIndex(): PcpPrimIndex {
    this._index ??= this._cache.computePrimIndexSync(
      this._targetObjectPath.getPrimPath(), this._allErrors)
    return this._index
  }
}

// _TargetInClassAndTargetsInstance (targetIndex.cpp:60-104): connections
// authored in an inherited class may not target an object in an instance of
// that class, as doing so would break reverse path translation.
function targetInClassAndTargetsInstance(
  connectionPathInNodeNS: SdfPath,
  nodeWhereConnectionWasAuthored: PcpNodeRef,
  context: TargetIndexContext,
): boolean {
  if (!pcpIsInheritArc(nodeWhereConnectionWasAuthored.arcType)) return false
  const inheritedClassPath = nodeWhereConnectionWasAuthored.getPathAtIntroduction()
  if (connectionPathInNodeNS.hasPrefix(inheritedClassPath)) return false
  const targetPrimIndex = context.getTargetObjectPrimIndex()
  const layerStackWhereConnectionWasAuthored = nodeWhereConnectionWasAuthored.getLayerStack()
  for (const n of targetPrimIndex.getNodeRange()) {
    if (pcpIsInheritArc(n.arcType)
        && n.getLayerStack() === layerStackWhereConnectionWasAuthored
        && n.getPath().hasPrefix(inheritedClassPath)) {
      return true
    }
  }
  return false
}

const enum PathTranslationError { NoError, PermissionDenied, InvalidTarget }

// _CheckTargetPermittedBeneathNode (targetIndex.cpp:117-176).
function checkTargetPermittedBeneathNode(
  connectionPathInRootNS: SdfPath, node: PcpNodeRef,
): PathTranslationError {
  const targetObjectIsProperty = connectionPathInRootNS.isPropertyPath()
  for (const child of node.getChildren()) {
    // A prim marked private at this node makes the target restricted.
    if (child.isRestricted || child.getPermission() === 'private') {
      return PathTranslationError.PermissionDenied
    }
    // Path translation should only fail here if the connection points at
    // the pre-relocated source of a relocated object.
    const pathInChildNS = pcpTranslatePathFromRootToNode(child, connectionPathInRootNS).path
    if (pathInChildNS.isEmpty()) return PathTranslationError.InvalidTarget
    if (targetObjectIsProperty) {
      for (const { layer } of child.getLayerStack().layers) {
        // Check every property spec up to the owning prim for private.
        for (let p = pathInChildNS; !p.isPrimPath(); p = p.getParentPath()) {
          if (p.isPropertyPath() && layer.hasSpec(p.pathString)) {
            const permission = layer.getField(p.pathString, 'permission')
            if (permission === 'private' || permission === 1) {
              return PathTranslationError.PermissionDenied
            }
          }
        }
      }
    }
    const errorUnderChild = checkTargetPermittedBeneathNode(connectionPathInRootNS, child)
    if (errorUnderChild !== PathTranslationError.NoError) return errorUnderChild
  }
  return PathTranslationError.NoError
}

// _TargetIsPermitted (targetIndex.cpp:198-283): a connection is invalid if
// its target is private in a weaker site than where it was authored, or if
// it points at the pre-relocation path of a relocated object.
function targetIsPermitted(
  connectionPathInRootNS: SdfPath,
  connectionPathInNodeNS: SdfPath,
  nodeWhereConnectionWasAuthored: PcpNodeRef,
  context: TargetIndexContext,
): PathTranslationError {
  const owningPrimIndex = context.getTargetObjectPrimIndex()
  // An inert root node means an invalid prim, typically the source of a
  // relocation.
  if (owningPrimIndex.getRootNode().isInert) return PathTranslationError.InvalidTarget
  const owningPrimInNodeNS = connectionPathInNodeNS.getPrimPath()
  const authoredLayerStack = nodeWhereConnectionWasAuthored.getLayerStack()
  let owningPrimNodeWhereConnectionWasAuthored: PcpNodeRef | undefined
  for (const node of owningPrimIndex.getNodeRange()) {
    if (node.getLayerStack() === authoredLayerStack
        && node.getPath().equals(owningPrimInNodeNS)) {
      owningPrimNodeWhereConnectionWasAuthored = node
      break
    }
  }
  // The node may have been culled (bad target, a separate arc, or a target
  // in a payload with the connection outside it); permit the connection.
  if (!owningPrimNodeWhereConnectionWasAuthored) return PathTranslationError.NoError
  return checkTargetPermittedBeneathNode(
    connectionPathInRootNS, owningPrimNodeWhereConnectionWasAuthored)
}

// _RemoveTargetPathErrorsForPath (targetIndex.cpp:285-307).
function removeTargetPathErrorsForPath(
  composedTargetPath: SdfPath, targetPathErrors: PcpError[],
): void {
  for (let i = targetPathErrors.length - 1; i >= 0; i--) {
    const error = targetPathErrors[i]!
    if (error instanceof PcpErrorTargetPathBase
        && (error as unknown as { composedTargetPath: string }).composedTargetPath
          === composedTargetPath.pathString) {
      targetPathErrors.splice(i, 1)
    }
  }
}

// _PathTranslateCallback (targetIndex.cpp:311-427): translates paths as path
// list operations from various nodes are applied.
function pathTranslateCallback(
  opType: SdfListOpType,
  propSite: PcpSite,
  node: PcpNodeRef,
  inPath: SdfPath,
  owningProp: SdfSpec,
  relOrAttrType: SdfSpecType,
  cacheForValidation: PcpCache | null,
  deletedPaths: SdfPath[] | null,
  targetPathErrors: PcpError[],
  otherErrors: PcpError[],
): SdfPath | undefined {
  const { path: translatedPath, pathWasTranslated: pathIsMappable } =
    pcpTranslatePathFromNodeToRoot(node, inPath)

  // A deleted path needs no validation; drop any errors for it.
  if (opType === 'deleted') {
    if (pathIsMappable && !translatedPath.isEmpty()) {
      deletedPaths?.push(translatedPath)
      removeTargetPathErrorsForPath(translatedPath, targetPathErrors)
      return translatedPath
    }
    return undefined
  }

  if (!pathIsMappable) {
    targetPathErrors.push(pcpErrorInvalidExternalTargetPath({
      rootSite: propSite,
      targetPath: inPath.pathString,
      owningPath: owningProp.getPath().pathString,
      ownerSpecType: relOrAttrType,
      ownerArcType: node.arcType,
      ownerIntroPath: node.getIntroPath().pathString,
      layer: owningProp.getLayer(),
      composedTargetPath: '',
    }))
    return undefined
  }

  if (translatedPath.isEmpty()) return undefined

  if (cacheForValidation) {
    const context = new TargetIndexContext(cacheForValidation, otherErrors, translatedPath)
    const targetError = (
      make: (args: Parameters<typeof pcpErrorInvalidTargetPath>[0]) => PcpError,
    ): void => {
      targetPathErrors.push(make({
        rootSite: propSite,
        targetPath: inPath.pathString,
        owningPath: owningProp.getPath().pathString,
        ownerSpecType: relOrAttrType,
        layer: owningProp.getLayer(),
        composedTargetPath: translatedPath.pathString,
      }))
    }

    if (targetInClassAndTargetsInstance(inPath, node, context)) {
      targetError(pcpErrorInvalidInstanceTargetPath)
      return undefined
    }

    // Usd caches use neither permissions nor relocates for this check.
    if (!cacheForValidation.isUsd()) {
      switch (targetIsPermitted(translatedPath, inPath, node, context)) {
        case PathTranslationError.PermissionDenied:
          targetError(pcpErrorTargetPermissionDenied)
          return undefined
        case PathTranslationError.InvalidTarget:
          targetError(pcpErrorInvalidTargetPath)
          return undefined
        case PathTranslationError.NoError:
          break
      }
    }
  }

  return translatedPath
}

/**
 * PcpBuildFilteredTargetIndex (targetIndex.cpp:429-529). Returns the target
 * index, the deleted paths and the errors.
 */
export function pcpBuildFilteredTargetIndex(
  propSite: PcpSite,
  propertyIndex: PcpPropertyIndex,
  relOrAttrType: SdfSpecType,
  localOnly = false,
  stopProperty: SdfSpec | null = null,
  includeStopProperty = false,
  cacheForValidation: PcpCache | null = null,
  allErrors: PcpError[] = [],
): readonly [PcpTargetIndex, readonly SdfPath[], readonly PcpError[]] {
  const targetIndex = new PcpTargetIndex()
  const deletedPaths: SdfPath[] = []
  if (relOrAttrType !== 'relationship' && relOrAttrType !== 'attribute') {
    throw new Error('relOrAttrType msut be either SdfSpecTypeRelationship or SdfSpecTypeAttribute')
  }
  if (propertyIndex.isEmpty()) return [targetIndex, deletedPaths, allErrors]

  const propertyRange = localOnly
    ? propertyIndex.infos.filter(info => info.originatingNode.isRootNode())
    : propertyIndex.infos
  // Every spec in the stack has the same type; check the first.
  if (propertyRange.length > 0 && propertyRange[0]!.propertySpec.getSpecType() !== relOrAttrType) {
    return [targetIndex, deletedPaths, allErrors]
  }

  const fieldName = relOrAttrType === 'attribute' ? 'connectionPaths' : 'targetPaths'
  let paths: SdfPath[] = []
  let targetPathErrors: PcpError[] = []
  let hasTargetOpinions = false
  const equals = (left: SdfPath, right: SdfPath): boolean => left.equals(right)

  // Walk the property stack weakest to strongest, applying path list
  // operations with the appropriate path translations.
  for (let i = propertyRange.length - 1; i >= 0; i--) {
    const { propertySpec: property, originatingNode: node } = propertyRange[i]!
    const isStopProperty = stopProperty !== null && property.equals(stopProperty)
    if (!includeStopProperty && isStopProperty) break
    const pathListOps = sdfNormalizeListOp<string | SdfPath>(property.getInfo(fieldName))
    if (pathListOps && hasKeys(pathListOps)) {
      hasTargetOpinions = true
      // An explicit list op overwrites everything composed so far, so its
      // accumulated errors are overridden too.
      if (pathListOps.isExplicit) {
        targetPathErrors = []
        deletedPaths.length = 0
      }
      const asPath = (item: string | SdfPath): SdfPath =>
        typeof item === 'string' ? SdfPath.fromString(item) : item
      paths = sdfApplyListOpToVector<SdfPath>(paths, {
        isExplicit: pathListOps.isExplicit,
        explicitItems: pathListOps.explicitItems.map(asPath),
        addedItems: pathListOps.addedItems.map(asPath),
        deletedItems: pathListOps.deletedItems.map(asPath),
        prependedItems: pathListOps.prependedItems.map(asPath),
        appendedItems: pathListOps.appendedItems.map(asPath),
        orderedItems: pathListOps.orderedItems.map(asPath),
      }, { equals }, (opType, inPath) => pathTranslateCallback(
        opType, propSite, node, inPath, property, relOrAttrType,
        cacheForValidation, deletedPaths, targetPathErrors, allErrors))
    }
    if (isStopProperty) break
  }

  allErrors.push(...targetPathErrors)
  targetIndex.paths = paths
  targetIndex.localErrors = targetPathErrors
  targetIndex.hasTargetOpinions = hasTargetOpinions
  return [targetIndex, deletedPaths, allErrors]
}

// SdfListOp::HasKeys.
function hasKeys(op: ReturnType<typeof sdfNormalizeListOp<unknown>> & object): boolean {
  if (op.isExplicit) return true
  return op.deletedItems.length + op.addedItems.length + op.prependedItems.length
    + op.appendedItems.length + op.orderedItems.length > 0
}

/** PcpBuildTargetIndex (targetIndex.cpp:531-547). */
export function pcpBuildTargetIndex(
  propSite: PcpSite,
  propIndex: PcpPropertyIndex,
  relOrAttrType: SdfSpecType,
  allErrors: PcpError[] = [],
): readonly [PcpTargetIndex, readonly PcpError[]] {
  const [targetIndex] = pcpBuildFilteredTargetIndex(
    propSite, propIndex, relOrAttrType, false, null, false, null, allErrors)
  return [targetIndex, allErrors]
}
