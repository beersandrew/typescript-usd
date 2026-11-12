// Ported from OpenUSD 26.11.1: pxr/usd/pcp/expressionVariables.cpp,
//  pxr/usd/pcp/expressionVariables.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpExpressionVariables — the composed expression variables in scope at a
// layer-stack site. Composition reads these when evaluating variable
// expressions authored in asset paths / variant selections
// (Pcp_EvaluateVariableExpression). Faithful port of the composition rule in
// pcp/expressionVariables.cpp (Pcp_ComposeExpressionVariablesOver), USD-mode
// subset: the full PcpExpressionVariablesSource override-chain caching composer
// (Pcp_ComposeExpressionVariables) is folded into the prim-index build, which
// threads the override (the referencing context's composed variables) down each
// reference/payload arc — see cache.ts evalRefOrPayload.

import type { SdfExpressionVariables } from 'typescript-usd/sdf/variableExpression'
import type { PcpLayerStackIdentifier, PcpLayerHandle } from './layerStackIdentifier.ts'
import { pcpLayerStackIdentifierEquals } from './layerStackIdentifier.ts'
import { PcpExpressionVariablesSource } from './expressionVariablesSource.ts'
import {
  _sdfGetDictionaryValueTypes, _sdfIsDictionary, _sdfRecordDictionaryValueTypes,
} from 'typescript-usd/sdf/_internal'

export type PcpExpressionVariablesDictionary = SdfExpressionVariables

/** @internal */
export function dictionariesEqual(
  left: PcpExpressionVariablesDictionary,
  right: PcpExpressionVariablesDictionary,
): boolean {
  const valuesEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
        a.every((value, index) => valuesEqual(value, b[index]))
    }
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    return aKeys.length === Object.keys(bRecord).length &&
      aKeys.every(key => Object.hasOwn(bRecord, key) &&
        valuesEqual(aRecord[key], bRecord[key]))
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(key => Object.hasOwn(right, key) &&
      valuesEqual(left[key], right[key]))
}

function layerVariables(layer: PcpLayerHandle | undefined): PcpExpressionVariablesDictionary {
  if (!layer || !('getField' in layer) || typeof layer.getField !== 'function') return {}
  const variables = layer.getField('/', 'expressionVariables')
  return _sdfIsDictionary(variables)
    ? (variables as PcpExpressionVariablesDictionary)
    : {}
}

// VtDictionaryOver of the given dictionaries, strongest last. The values'
// scene-description types travel with the composed record so evaluation sees
// e.g. a `double` holding 1 as a double, as a VtValue would carry it.
function composeOver(...dicts: PcpExpressionVariablesDictionary[]): PcpExpressionVariablesDictionary {
  const composed: Record<string, unknown> = {}
  const types = new Map<string, string>()
  for (const dict of dicts) {
    const dictTypes = _sdfGetDictionaryValueTypes(dict)
    for (const [key, value] of Object.entries(dict)) {
      composed[key] = value
      const type = dictTypes?.get(key)
      if (type === undefined) types.delete(key)
      else types.set(key, type)
    }
  }
  if (types.size > 0) _sdfRecordDictionaryValueTypes(composed, types)
  return composed
}

function composeIdentifierVariables(
  identifier: PcpLayerStackIdentifier,
  overrides: PcpExpressionVariablesDictionary,
): PcpExpressionVariablesDictionary {
  return composeOver(
    layerVariables(identifier.rootLayer),
    layerVariables(identifier.sessionLayer),
    overrides,
  )
}

/**
 * Composed expression variables and the layer-stack source that introduced
 * their last effective opinion. Ported from OpenUSD v26.08
 * pxr/usd/pcp/expressionVariables.cpp:18-205.
 */
export class PcpExpressionVariables {
  constructor(
    private readonly source = new PcpExpressionVariablesSource(),
    private variables: PcpExpressionVariablesDictionary = {},
  ) {}

  static compute(
    sourceLayerStackId: PcpLayerStackIdentifier,
    rootLayerStackId: PcpLayerStackIdentifier,
    overrideExpressionVars?: PcpExpressionVariables,
  ): PcpExpressionVariables {
    if (overrideExpressionVars) {
      const composed = composeIdentifierVariables(
        sourceLayerStackId,
        overrideExpressionVars.variables,
      )
      return dictionariesEqual(composed, overrideExpressionVars.variables)
        ? overrideExpressionVars
        : new PcpExpressionVariables(
            new PcpExpressionVariablesSource(sourceLayerStackId, rootLayerStackId),
            composed,
          )
    }

    const sources: PcpLayerStackIdentifier[] = []
    let current = sourceLayerStackId
    for (;;) {
      sources.push(current)
      if (pcpLayerStackIdentifierEquals(current, rootLayerStackId)) break
      current = (current.expressionVariablesOverrideSource ??
        new PcpExpressionVariablesSource()).resolveLayerStackIdentifier(rootLayerStackId)
    }

    let result = new PcpExpressionVariables()
    for (let index = sources.length - 1; index >= 0; index--) {
      const identifier = sources[index]!
      const composed = composeIdentifierVariables(identifier, result.variables)
      if (!dictionariesEqual(composed, result.variables)) {
        result = new PcpExpressionVariables(
          new PcpExpressionVariablesSource(identifier, rootLayerStackId),
          composed,
        )
      }
    }
    return result
  }

  getSource(): PcpExpressionVariablesSource { return this.source }
  getVariables(): PcpExpressionVariablesDictionary { return this.variables }
  setVariables(variables: PcpExpressionVariablesDictionary): void {
    this.variables = variables
  }
  equals(rhs: PcpExpressionVariables): boolean {
    return this === rhs ||
      this.source.equals(rhs.source) && dictionariesEqual(this.variables, rhs.variables)
  }
}

// Compose a layer stack's OWN authored expression variables under a set of
// overriding variables (from the stronger, referencing context). Realizes
// Pcp_ComposeExpressionVariablesOver (expressionVariables.cpp:20): the override
// values WIN over the layer stack's own values for matching keys
// (VtDictionaryOver(overrides, &ownVars)). With no overrides this is just the
// layer stack's own variables.
export function pcpComposeExpressionVariablesOver(
  ownVars: PcpExpressionVariablesDictionary,
  overrideVars: PcpExpressionVariablesDictionary | undefined,
): PcpExpressionVariablesDictionary {
  if (!overrideVars) return ownVars
  return composeOver(ownVars, overrideVars)
}
