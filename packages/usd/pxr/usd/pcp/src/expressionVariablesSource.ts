// Ported from OpenUSD 26.11.1: pxr/usd/pcp/expressionVariablesSource.cpp,
//  pxr/usd/pcp/expressionVariablesSource.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpExpressionVariablesSource — faithful port of pcp/expressionVariablesSource.
//
// Identifies WHERE a set of composed expression variables comes from: either the
// prim index's root layer stack (the default, "root" source) or a specific
// (referenced) layer stack identifier. When a source's layer stack identifier
// equals the root layer stack identifier it normalizes to the root source — so
// equality/hashing collapse the two. Consumed by PcpExpressionVariables to track
// the override chain across reference arcs.

import {
  type PcpLayerStackIdentifier,
  pcpLayerStackIdentifierEquals,
  pcpLayerStackIdentifierKey,
} from './layerStackIdentifier.ts'

export class PcpExpressionVariablesSource {
  // null === the root layer stack (expressionVariablesSource.h IsRootLayerStack).
  private readonly _identifier: PcpLayerStackIdentifier | null

  // Default-constructed: the root layer stack source. With both identifiers
  // given, normalize to the root source when they are equal
  // (expressionVariablesSource.cpp:17 — `layerStackId == rootLayerStackId ?
  // nullptr : ...`).
  constructor(
    layerStackId?: PcpLayerStackIdentifier,
    rootLayerStackId?: PcpLayerStackIdentifier,
  ) {
    this._identifier = (layerStackId && rootLayerStackId &&
      !pcpLayerStackIdentifierEquals(layerStackId, rootLayerStackId))
      ? layerStackId
      : null
  }

  // No specific identifier → this is the root layer stack source.
  isRootLayerStack(): boolean {
    return this._identifier === null
  }

  // The specific layer stack identifier, or null when this is the root source.
  getLayerStackIdentifier(): PcpLayerStackIdentifier | null {
    return this._identifier
  }

  // The root layer stack identifier when this is the root source, otherwise this
  // source's own identifier (expressionVariablesSource.cpp:71).
  resolveLayerStackIdentifier(
    rootLayerStackId: PcpLayerStackIdentifier,
  ): PcpLayerStackIdentifier {
    return this._identifier ?? rootLayerStackId
  }

  // Both root → equal; both specific → identifiers equal; otherwise unequal
  // (expressionVariablesSource.cpp:35).
  equals(rhs: PcpExpressionVariablesSource): boolean {
    if (this._identifier && rhs._identifier) {
      return pcpLayerStackIdentifierEquals(this._identifier, rhs._identifier)
    }
    return (this._identifier === null) === (rhs._identifier === null)
  }

  // Stable key for use in maps/sets — the root source hashes to a fixed sentinel.
  getKey(): string {
    return this._identifier ? pcpLayerStackIdentifierKey(this._identifier) : '<root>'
  }
}
