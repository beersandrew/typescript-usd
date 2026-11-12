// Ported from OpenUSD 26.11.1: pxr/usd/pcp/pathTranslation.cpp,
//  pxr/usd/pcp/pathTranslation.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/usd/pcp/pathTranslation.cpp:18-185.

import { SdfPath } from 'typescript-usd/sdf/path'
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import type { PcpMapFunction } from './mapFunction.ts'
import type { PcpNodeRef } from './node.ts'

export interface PcpPathTranslationResult {
  readonly path: SdfPath
  readonly pathWasTranslated: boolean
}

// TF_CODING_ERROR.
function tfCodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

function translatePath(
  mapToRoot: PcpMapFunction,
  path: SdfPath,
  nodeToRoot: boolean,
): PcpPathTranslationResult {
  if (mapToRoot.isNull()) {
    tfCodingError('Null map function')
    return { path: SdfPath.emptyPath, pathWasTranslated: false }
  }
  if (path.isEmpty()) return { path, pathWasTranslated: true }
  if (!path.isAbsolutePath()) {
    tfCodingError(`Path to translate <${path.pathString}> is not absolute.`)
    return { path: SdfPath.emptyPath, pathWasTranslated: false }
  }
  if (path.containsPrimVariantSelection()) {
    tfCodingError(`Path to translate <${path.pathString}> must not contain a variant selection.`)
    return { path: SdfPath.emptyPath, pathWasTranslated: false }
  }
  if (mapToRoot.isIdentity()) {
    return { path, pathWasTranslated: true }
  }
  const map = (p: SdfPath): SdfPath =>
    nodeToRoot ? mapToRoot.mapSourceToTarget(p) : mapToRoot.mapTargetToSource(p)
  let translated = map(path)
  if (translated.isEmpty()) return { path: SdfPath.emptyPath, pathWasTranslated: false }
  // Translate any target paths too; if any cannot be translated the whole
  // translation fails.
  translated = translated.replaceTargetPaths(map)
  return {
    path: translated,
    pathWasTranslated: !translated.isEmpty(),
  }
}

export function pcpTranslatePathFromNodeToRootUsingFunction(
  mapToRoot: PcpMapFunction,
  pathInNodeNamespace: SdfPath,
): PcpPathTranslationResult {
  return translatePath(
    mapToRoot, pathInNodeNamespace.stripAllVariantSelections(), true,
  )
}

export function pcpTranslatePathFromRootToNodeUsingFunction(
  mapToRoot: PcpMapFunction,
  pathInRootNamespace: SdfPath,
): PcpPathTranslationResult {
  return translatePath(mapToRoot, pathInRootNamespace, false)
}

export function pcpTranslatePathFromNodeToRoot(
  sourceNode: PcpNodeRef,
  pathInNodeNamespace: SdfPath,
): PcpPathTranslationResult {
  return pcpTranslatePathFromNodeToRootUsingFunction(
    sourceNode.getMapToRoot().evaluate(), pathInNodeNamespace,
  )
}

export function pcpTranslatePathFromRootToNode(
  destNode: PcpNodeRef,
  pathInRootNamespace: SdfPath,
): PcpPathTranslationResult {
  const result = pcpTranslatePathFromRootToNodeUsingFunction(
    destNode.getMapToRoot().evaluate(), pathInRootNamespace,
  )
  if (!result.pathWasTranslated) return result
  const strippedSitePath = destNode.getPath().stripAllVariantSelections()
  return {
    path: result.path.replacePrefix(strippedSitePath, destNode.getPath()),
    pathWasTranslated: true,
  }
}

export function pcpTranslateTargetPathFromRootToNode(
  destNode: PcpNodeRef,
  pathInRootNamespace: SdfPath,
): PcpPathTranslationResult {
  return pcpTranslatePathFromRootToNodeUsingFunction(
    destNode.getMapToRoot().evaluate(), pathInRootNamespace,
  )
}
