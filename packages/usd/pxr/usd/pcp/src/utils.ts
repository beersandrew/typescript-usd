// Ported from OpenUSD 26.11.1: pxr/usd/pcp/utils.cpp, pxr/usd/pcp/utils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Pcp private utilities. Port of OpenUSD v26.08 pxr/usd/pcp/utils.{h,cpp}.

import { pcpIsClassBasedArc, pcpIsSpecializeArc } from './arc.ts'
import { type PcpError, pcpErrorVariableExpression } from './errors.ts'
import type { PcpExpressionVariables } from './expressionVariables.ts'
import type { PcpLayerHandle } from './layerStackIdentifier.ts'
import type { PcpNodeRef } from './node.ts'
import { pcpSite } from './site.ts'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  SdfVariableExpression, sdfIsVariableExpression,
} from 'typescript-usd/sdf/variableExpression'
import { pcpLayerStackIdentifier } from './layerStackIdentifier.ts'

// Pcp_EvaluateVariableExpression (utils.cpp:22-58). The result is assumed to
// be string valued; anything else yields ''.
export function pcpEvaluateVariableExpression(
  expression: string,
  expressionVars: PcpExpressionVariables,
  context = '',
  sourceLayer?: PcpLayerHandle,
  sourcePath: SdfPath = SdfPath.emptyPath,
  usedVariables?: Set<string>,
  errors?: PcpError[],
): string {
  const r = evaluateTypedString(expression, expressionVars)
  if (usedVariables) for (const name of r.usedVariables) usedVariables.add(name)
  if (errors && r.errors.length > 0 && sourceLayer) {
    errors.push(pcpErrorVariableExpression({
      rootSite: pcpSite(pcpLayerStackIdentifier(sourceLayer), ''),
      expression,
      expressionError: r.errors.join('; '),
      context,
      sourceLayer,
      sourcePath: sourcePath.pathString,
    }))
  }
  return r.errors.length === 0 && typeof r.value === 'string' ? r.value : ''
}

// SdfVariableExpression(expression).EvaluateTyped<std::string>
// (utils.cpp:34-36).
function evaluateTypedString(
  expression: string, expressionVars: PcpExpressionVariables,
): { value: unknown, errors: string[], usedVariables: readonly string[] } {
  return new SdfVariableExpression(expression).evaluateTyped(expressionVars.getVariables(), 'string')
}

// Pcp_IsVariableExpression (utils.cpp:70-75).
export function pcpIsVariableExpression(str: string): boolean {
  return sdfIsVariableExpression(str)
}

// Pcp_IsPropagatedSpecializesNode (utils.h).
export function pcpIsPropagatedSpecializesNode(node: PcpNodeRef): boolean {
  if (!pcpIsSpecializeArc(node.getArcType())) return false
  const parent = node.getParentNode()
  if (parent !== node.getRootNode()) return false
  const origin = node.getOriginNode()
  return origin !== null && node.getLayerStack() === origin.getLayerStack() &&
    node.getPath().pathString === origin.getPath().pathString
}

// Pcp_FindStartingNodeOfClassHierarchy (utils.cpp:144-170).
export function pcpFindStartingNodeOfClassHierarchy(
  n: PcpNodeRef,
): [PcpNodeRef, PcpNodeRef | null] {
  let instanceNode = n
  let classNode: PcpNodeRef | null = null
  if (pcpIsPropagatedSpecializesNode(instanceNode)) instanceNode = instanceNode.getOriginNode()!
  const depth = instanceNode.getDepthBelowIntroduction()
  while (pcpIsClassBasedArc(instanceNode.getArcType()) &&
         instanceNode.getDepthBelowIntroduction() === depth) {
    const parent = instanceNode.getParentNode()
    if (!parent) break
    classNode = instanceNode
    instanceNode = parent
    if (pcpIsPropagatedSpecializesNode(instanceNode)) instanceNode = instanceNode.getOriginNode()!
  }
  return [instanceNode, classNode]
}

// Pcp_TranslatePathFromNodeToRootOrClosestNode (utils.cpp:172-228).
export function pcpTranslatePathFromNodeToRootOrClosestNode(
  node: PcpNodeRef, path: SdfPath,
): [SdfPath, PcpNodeRef] {
  if (node.isRootNode()) return [path, node]
  let curNode = node
  let curPath = path.stripAllVariantSelections()
  const pathInRootNode = node.getMapToRoot().evaluate().mapSourceToTarget(curPath)
  if (!pathInRootNode.isEmpty()) {
    curNode = node.getRootNode()
    curPath = pathInRootNode
  } else {
    while (!curNode.isRootNode()) {
      const pathInParentNode = curNode.getMapToParent().evaluate().mapSourceToTarget(curPath)
      if (pathInParentNode.isEmpty()) break
      curNode = curNode.getParentNode()!
      curPath = pathInParentNode
    }
  }
  const pathAtIntro = curNode.getPathAtIntroduction()
  if (pathAtIntro.containsPrimVariantSelection()) {
    curPath = curPath.replacePrefix(pathAtIntro.stripAllVariantSelections(), pathAtIntro)
  }
  return [curPath, curNode]
}

// SdfLayer::GetDefaultPrimAsPath (sdf/layer.cpp): a bare name is a root prim;
// an absolute prim path is used as-is; anything else is empty.
export function pcpGetDefaultPrimPath(layer: { getField(path: string, field: string): unknown }): SdfPath {
  const value = layer.getField('/', 'defaultPrim')
  if (typeof value !== 'string' || value === '') return SdfPath.emptyPath
  if (value.startsWith('/')) {
    const path = SdfPath.fromString(value)
    return path.isPrimPath() && !path.containsPrimVariantSelection() ? path : SdfPath.emptyPath
  }
  const path = SdfPath.absoluteRootPath.appendChild(value)
  return path.isRootPrimPath() ? path : SdfPath.emptyPath
}

// SdfFileFormatTokens->TargetArg (sdf/fileFormat.h).
const SDF_FILE_FORMAT_TARGET_ARG = 'target'

// _TargetIsSpecifiedInIdentifier (utils.cpp:75-84): the identifier's file
// format arguments carry a 'target'.
function targetIsSpecifiedInArgs(args: ReadonlyMap<string, string>): boolean {
  return args.has(SDF_FILE_FORMAT_TARGET_ARG)
}

// Pcp_GetArgumentsForFileFormatTarget (utils.cpp:97-106): add the cache's
// file format target to args unless the identifier already specifies one.
export function pcpGetArgumentsForFileFormatTarget(
  identifierArgs: ReadonlyMap<string, string>, target: string, args: Map<string, string>,
): void {
  if (target !== '' && !targetIsSpecifiedInArgs(identifierArgs)) {
    args.set(SDF_FILE_FORMAT_TARGET_ARG, target)
  }
}

// Pcp_StripFileFormatTarget (utils.cpp:133-142): remove a 'target' argument
// equal to target.
export function pcpStripFileFormatTarget(target: string, args: Map<string, string>): void {
  if (args.get(SDF_FILE_FORMAT_TARGET_ARG) === target) args.delete(SDF_FILE_FORMAT_TARGET_ARG)
}
