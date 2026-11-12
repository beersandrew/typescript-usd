// Ported from OpenUSD 26.11.1: pxr/usd/pcp/dynamicFileFormatContext.cpp,
//  pxr/usd/pcp/dynamicFileFormatContext.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpDynamicFileFormatContext. Port of OpenUSD v26.08
// pxr/usd/pcp/dynamicFileFormatContext.{h,cpp}: composes field and attribute
// values from the partially built prim index so a dynamic file format can
// generate its file format arguments.

import type { PcpNodeRef } from './node.ts'
import {
  type PcpPrimIndex_StackFrame, PcpPrimIndex_StackFrameIterator,
} from './primIndex_StackFrame.ts'
import { pcpCompareSiblingPayloadNodeStrength } from './strengthOrdering.ts'
import { pcpTranslatePathFromNodeToRootOrClosestNode } from './utils.ts'
import { pcpReadField } from './layerStackIdentifier.ts'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  SdfVariableExpression, sdfIsVariableExpression,
} from 'typescript-usd/sdf/variableExpression'

function isDictionary(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// VtDictionaryOverRecursive(&stronger, weaker).
function overlayDictionary(stronger: Record<string, unknown>, weaker: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(weaker)) {
    const existing = stronger[key]
    if (isDictionary(existing) && isDictionary(value)) overlayDictionary(existing, value)
    else if (!(key in stronger)) stronger[key] = value
  }
}

// _ComposeValueHelper (dynamicFileFormatContext.cpp:20-214).
class ComposeValueHelper {
  private readonly _iterator: PcpPrimIndex_StackFrameIterator
  foundValue = false

  constructor(
    private readonly _context: PcpDynamicFileFormatContext,
    private readonly _strongestOpinionOnly = true,
  ) {
    this._iterator = new PcpPrimIndex_StackFrameIterator(
      _context._parentNode, _context._previousStackFrame)
  }

  private _composeOpinionInSubtree(
    node: PcpNodeRef, pathInNode: SdfPath, propName: string | undefined,
    fieldName: string, composeFunc: (value: unknown) => void,
  ): boolean {
    const path = propName === undefined ? pathInNode : pathInNode.appendProperty(propName)
    const key = path.pathString
    for (const { layer } of node.getLayerStack().layers) {
      let value = pcpReadField(layer, key, fieldName)
      if (value === undefined) continue
      // SdfResolveAssetPaths against the node's layer stack variables.
      const resolve = (asset: SdfAssetPath): SdfAssetPath => {
        const authoredPath = asset.getAuthoredPath()
        let evaluatedPath = asset.getEvaluatedPath()
        if (!evaluatedPath && sdfIsVariableExpression(authoredPath)) {
          const evaluated = new SdfVariableExpression(authoredPath).evaluateTyped(
            node.getLayerStack().expressionVariables.getVariables(), 'string')
          if (typeof evaluated.value === 'string') evaluatedPath = evaluated.value
        }
        const assetPath = evaluatedPath || asset.getAssetPath()
        return new SdfAssetPath({
          authoredPath, evaluatedPath,
          resolvedPath: assetPath ? layer.resolveAsset(assetPath) : '',
        })
      }
      if (value instanceof SdfAssetPath) value = resolve(value)
      else if (Array.isArray(value) && value.length > 0 &&
               value.every(item => item instanceof SdfAssetPath)) {
        value = (value as SdfAssetPath[]).map(resolve)
      }
      composeFunc(value)
      this.foundValue = true
      if (this._strongestOpinionOnly) return true
    }
    for (let child = node._firstChild(); child; child = child._nextSibling()) {
      if (node === this._context._parentNode &&
          pcpCompareSiblingPayloadNodeStrength(
            this._context._parentNode, this._context._arcNum, child) === -1) {
        return true
      }
      let pathInChild = child.getMapToParent().evaluate()
        .mapTargetToSource(pathInNode.stripAllVariantSelections())
      if (pathInChild.isEmpty()) continue
      const childPathAtIntro = child.getPathAtIntroduction()
      if (childPathAtIntro.containsPrimVariantSelection()) {
        pathInChild = pathInChild.replacePrefix(
          childPathAtIntro.stripAllVariantSelections(), childPathAtIntro)
      }
      if (this._composeOpinionInSubtree(child, pathInChild, propName, fieldName, composeFunc)) {
        return true
      }
    }
    return false
  }

  composeOpinionFromAncestors(
    propName: string | undefined, fieldName: string, composeFunc: (value: unknown) => void,
  ): boolean {
    const node = this._iterator.node!
    const path = this._context._pathInNode.isEmpty() ? node.getPath() : this._context._pathInNode
    return this._composeFromAncestors(node, path, propName, fieldName, composeFunc)
  }

  private _composeFromAncestors(
    node: PcpNodeRef, pathInNode: SdfPath, propName: string | undefined,
    fieldName: string, composeFunc: (value: unknown) => void,
  ): boolean {
    const [rootmostPath, rootmostNode] =
      pcpTranslatePathFromNodeToRootOrClosestNode(node, pathInNode)
    if (rootmostNode.isRootNode() && this._iterator.previousFrame) {
      const frame = this._iterator.previousFrame
      const parentNode = frame.parentNode
      const parentNodePath = frame.arcToParent.mapToParent.evaluate()
        .mapSourceToTarget(rootmostPath.stripAllVariantSelections())
      this._iterator.nextFrame()
      if (this._composeFromAncestors(
        parentNode, parentNodePath, propName, fieldName, composeFunc)) return true
    }
    return this._composeOpinionInSubtree(
      rootmostNode, rootmostPath, propName, fieldName, composeFunc)
  }
}

export class PcpDynamicFileFormatContext {
  /** @internal */
  constructor(
    readonly _parentNode: PcpNodeRef,
    readonly _pathInNode: SdfPath,
    readonly _arcNum: number,
    readonly _previousStackFrame: PcpPrimIndex_StackFrame | null,
    private readonly _composedFieldNames?: Set<string>,
    private readonly _composedAttributeNames?: Set<string>,
  ) {}

  // ComposeValue (dynamicFileFormatContext.cpp:243-283). Dictionary-valued
  // fields compose every opinion; others take the strongest.
  composeValue(field: string): unknown {
    this._composedFieldNames?.add(field)
    let result: unknown
    let dictionary: Record<string, unknown> | undefined
    let sawNonDictionary = false
    const helper = new ComposeValueHelper(this, false)
    helper.composeOpinionFromAncestors(undefined, field, value => {
      if (isDictionary(value)) {
        dictionary ??= {}
        overlayDictionary(dictionary, value)
      } else if (!sawNonDictionary) {
        sawNonDictionary = true
        result = value
      }
    })
    return dictionary ?? result
  }

  // ComposeValueStack (dynamicFileFormatContext.cpp:285-300).
  composeValueStack(field: string): unknown[] {
    this._composedFieldNames?.add(field)
    const values: unknown[] = []
    new ComposeValueHelper(this, false).composeOpinionFromAncestors(
      undefined, field, value => values.push(value))
    return values
  }

  // ComposeAttributeDefaultValue (dynamicFileFormatContext.cpp:302-316).
  composeAttributeDefaultValue(attributeName: string): unknown {
    this._composedAttributeNames?.add(attributeName)
    let result: unknown
    new ComposeValueHelper(this, true).composeOpinionFromAncestors(
      attributeName, 'default', value => { result = value })
    return result
  }
}
