// Ported from OpenUSD 26.11.1: pxr/usd/sdr/shaderNodeQuery.cpp,
//  pxr/usd/sdr/shaderNodeQuery.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { SdrShaderNode } from './shaderNode.ts'

// Query row ownership follows shaderNodeQuery.h:28-178; grouping follows
// shaderNodeQueryUtils.cpp:14-56.

export const SdrNodeFieldKey = {
  Identifier: 'identifier', Version: 'version', Name: 'name', Function: 'function',
  Context: 'context', SourceType: 'sourceType', DefinitionURI: 'definitionURI',
  ImplementationURI: 'implementationURI',
} as const

export class SdrShaderNodeQueryResult {
  constructor(private readonly keys: string[], private readonly values: unknown[][], private readonly nodes: SdrShaderNode[][]) {}
  getKeys(): string[] { return [...this.keys] }
  getValues(): unknown[][] { return this.values.map(row => [...row]) }
  getStringifiedValues(): string[][] { return this.values.map(row => row.map(value => value == null ? '' : String(value))) }
  // shaderNodeQuery.cpp:110-118: no value rows means no grouping.
  getShaderNodesByValues(): SdrShaderNode[][] {
    if (this.values.length === 0) return []
    return this.nodes.map(row => [...row])
  }
  // shaderNodeQuery.cpp:120-133.
  getAllShaderNodes(): SdrShaderNode[] {
    const less = (a: SdrShaderNode, b: SdrShaderNode) =>
      a.getIdentifier() < b.getIdentifier() || a.getShadingSystem() < b.getShadingSystem()
    return this.nodes.flat().sort((a, b) => less(a, b) ? -1 : less(b, a) ? 1 : 0)
  }
}

type Filter = (node: SdrShaderNode) => boolean

let defaultRunner: ((query: SdrShaderNodeQuery) => SdrShaderNodeQueryResult) | undefined
/** @internal The SdrRegistry singleton's RunQuery, set by registry.ts. */
export function _setDefaultQueryRunner(runner: (query: SdrShaderNodeQuery) => SdrShaderNodeQueryResult): void {
  defaultRunner = runner
}
const valuesEqual = (left: unknown, right: unknown): boolean => left == null && right == null ? true : Object.is(left, right)
export class SdrShaderNodeQuery {
  readonly selectKeys: string[] = []
  readonly include: Filter[] = []
  readonly exclude: Filter[] = []
  readonly custom: Filter[] = []
  constructor(private readonly runner?: (query: SdrShaderNodeQuery) => SdrShaderNodeQueryResult) {}
  selectDistinct(key: string | string[]): this { for (const item of typeof key === 'string' ? [key] : key) if (!this.selectKeys.includes(item)) this.selectKeys.push(item); return this }
  nodeValueIs(key: string, value: unknown): this { this.include.push(node => valuesEqual(node.getDataForKey(key), value)); return this }
  nodeValueIsIn(key: string, values: unknown[]): this { this.include.push(node => values.some(value => valuesEqual(node.getDataForKey(key), value))); return this }
  nodeHasValueFor(key: string): this { this.include.push(node => node.getDataForKey(key) !== undefined); return this }
  nodeValueIsNot(key: string, value: unknown): this { this.exclude.push(node => valuesEqual(node.getDataForKey(key), value)); return this }
  nodeValueIsNotIn(key: string, values: unknown[]): this { this.exclude.push(node => values.some(value => valuesEqual(node.getDataForKey(key), value))); return this }
  nodeHasNoValueFor(key: string): this { this.exclude.push(node => node.getDataForKey(key) !== undefined); return this }
  customFilter(filter: Filter): this { this.custom.push(filter); return this }
  // SdrShaderNodeQuery::Run (shaderNodeQuery.cpp:90-95) runs against
  // SdrRegistry::GetInstance().
  run(): SdrShaderNodeQueryResult {
    const runner = this.runner ?? defaultRunner
    if (!runner) throw new Error('query has no registry')
    return runner(this)
  }
}

export function runNodeQuery(query: SdrShaderNodeQuery, nodes: SdrShaderNode[]): SdrShaderNodeQueryResult {
  const selected = nodes.filter(node => query.include.every(filter => filter(node)) && !query.exclude.some(filter => filter(node)) && query.custom.every(filter => {
    const result = filter(node)
    if (typeof result !== 'boolean') throw new TypeError('SdrShaderNodeQuery custom filters must return a boolean')
    return result
  }))
  // registry.cpp:897-900: without keys every node is in one row.
  if (!query.selectKeys.length) return new SdrShaderNodeQueryResult([], [], [selected])
  const rows = new Map<string, { values: unknown[], nodes: SdrShaderNode[] }>()
  for (const node of selected) {
    const values = query.selectKeys.map(key => node.getDataForKey(key))
    const identity = JSON.stringify(values)
    const row = rows.get(identity)
    if (row) row.nodes.push(node); else rows.set(identity, { values, nodes: [node] })
  }
  return new SdrShaderNodeQueryResult([...query.selectKeys], [...rows.values()].map(row => row.values), [...rows.values()].map(row => row.nodes))
}

export function groupQueryResults(result: SdrShaderNodeQueryResult): Record<string, unknown> {
  const keys = result.getKeys()
  if (!keys.length) return {}
  const root: Record<string, unknown> = {}
  const values = result.getStringifiedValues()
  const nodes = result.getShaderNodesByValues()
  for (let row = 0; row < values.length; row++) {
    let cursor = root
    for (let column = 0; column < keys.length - 1; column++) {
      const key = values[row]![column]!
      const child = cursor[key]
      if (!child || typeof child !== 'object') cursor[key] = {}
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[values[row]!.at(-1)!] = nodes[row]
  }
  return root
}
