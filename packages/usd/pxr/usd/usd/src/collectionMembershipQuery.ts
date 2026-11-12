// Ported from OpenUSD 26.11.1: pxr/usd/usd/collectionMembershipQuery.cpp,
//  pxr/usd/usd/collectionMembershipQuery.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD pxr/usd/usd/collectionMembershipQuery.{h,cpp} rule-map path.

import type { Prim } from './prim.ts'
import type { Stage } from './stage.ts'

export type ExpansionRule = 'explicitOnly' | 'expandPrims' | 'expandPrimsAndProperties'
export type CollectionRule = ExpansionRule | 'exclude'

function ancestorsInclusive(path: string): string[] {
  const out: string[] = []
  let current = path
  while (current) {
    out.push(current)
    if (current === '/') break
    const slash = current.lastIndexOf('/')
    current = slash <= 0 ? '/' : current.slice(0, slash)
  }
  return out
}

export class CollectionMembershipQuery {
  constructor(
    private readonly _ruleMap: ReadonlyMap<string, CollectionRule>,
    private readonly _expressionMatch?: ((path: string) => boolean) | undefined,
    // UsdObjectCollectionExpressionEvaluator's stage
    // (collectionMembershipQuery.h:58-63); set only when the query carries a
    // membership expression (HasExpression, collectionMembershipQuery.h:285).
    private readonly _expressionStage?: Stage | undefined,
  ) {}

  /** @internal UsdCollectionMembershipQuery::HasExpression. */
  _hasExpression(): boolean { return this._expressionStage !== undefined }
  /** @internal GetExpressionEvaluator().GetStage(). */
  _getExpressionStage(): Stage | undefined { return this._expressionStage }

  getAsPathExpansionRuleMap(): Map<string, CollectionRule> { return new Map(this._ruleMap) }
  equals(other: CollectionMembershipQuery): boolean {
    if (!this.usesPathExpansionRuleMap() || !other.usesPathExpansionRuleMap()) return false
    const rhs = other.getAsPathExpansionRuleMap()
    return this._ruleMap.size === rhs.size
      && [...this._ruleMap].every(([path, rule]) => rhs.get(path) === rule)
  }
  hash(): string { return JSON.stringify([...this._ruleMap].sort(([a], [b]) => a.localeCompare(b))) }
  hasExcludes(): boolean { return [...this._ruleMap.values()].includes('exclude') }
  usesPathExpansionRuleMap(): boolean { return this._expressionMatch === undefined }

  static compute(prim: Prim, name: string): CollectionMembershipQuery {
    const prefix = `collection:${name}:`
    const raw = prim.getAttr(`${prefix}expansionRule`)?.getValue()
    const expansion: ExpansionRule = raw === 'explicitOnly' || raw === 'expandPrimsAndProperties'
      ? raw : 'expandPrims'
    const rules = new Map<string, CollectionRule>()
    for (const path of prim.getAttr(`${prefix}includes`)?.getTargets() ?? []) rules.set(path, expansion)
    if (prim.getAttr(`${prefix}includeRoot`)?.getValue() === true) rules.set('/', expansion)
    for (const path of prim.getAttr(`${prefix}excludes`)?.getTargets() ?? []) rules.set(path, 'exclude')
    return new CollectionMembershipQuery(rules)
  }

  isPathIncluded(path: string): boolean {
    if (!path.startsWith('/')) throw new Error(`IsPathIncluded: path <${path}> is not absolute`)
    if (this._expressionMatch) return this._expressionMatch(path)
    for (const candidate of ancestorsInclusive(path.includes('.') ? path.slice(0, path.indexOf('.')) : path)) {
      const rule = this._ruleMap.get(candidate)
      if (rule === undefined) continue
      if (rule === 'exclude') return false
      if (rule === 'expandPrimsAndProperties') return true
      if (path.includes('.') && rule === 'expandPrims') return false
      if (rule !== 'explicitOnly' || candidate === path) return true
    }
    return false
  }
}
