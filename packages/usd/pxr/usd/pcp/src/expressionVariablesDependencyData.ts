// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/expressionVariablesDependencyData.cpp,
//  pxr/usd/pcp/expressionVariablesDependencyData.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpExpressionVariablesDependencyData — exact ownership boundary from
// pxr/usd/pcp/expressionVariablesDependencyData.{h,cpp} (OpenUSD v26.05).

import type { PcpLayerStack } from './layerStack.ts'

export class PcpExpressionVariablesDependencyData {
  readonly #dependencies = new Map<PcpLayerStack, Set<string>>()

  isEmpty(): boolean { return this.#dependencies.size === 0 }

  appendDependencyData(other: PcpExpressionVariablesDependencyData): void {
    other.forEachDependency((layerStack, names) => {
      this.addDependencies(layerStack, names)
    })
  }

  addDependencies(layerStack: PcpLayerStack, names: Iterable<string>): void {
    const incoming = [...names]
    if (incoming.length === 0) return
    let stored = this.#dependencies.get(layerStack)
    if (!stored) {
      stored = new Set<string>()
      this.#dependencies.set(layerStack, stored)
    }
    for (const name of incoming) stored.add(name)
  }

  forEachDependency(
    callback: (layerStack: PcpLayerStack, names: ReadonlySet<string>) => void,
  ): void {
    for (const [layerStack, names] of this.#dependencies) callback(layerStack, names)
  }

  getDependenciesForLayerStack(layerStack: PcpLayerStack): ReadonlySet<string> | undefined {
    return this.#dependencies.get(layerStack)
  }
}
