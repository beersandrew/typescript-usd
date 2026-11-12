// Ported from OpenUSD 26.11.1: pxr/usd/pcp/site.cpp, pxr/usd/pcp/site.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpSite — a path in a layer-stack configuration.
// Faithful port of OpenUSD pcp/site.h.

import {
  pcpLayerStackIdentifierEquals,
  pcpLayerStackIdentifierKey,
  type PcpLayerStackIdentifier,
} from './layerStackIdentifier.ts'
import type { PcpLayerStack } from './layerStack.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

export interface PcpSite {
  readonly layerStack: PcpLayerStackIdentifier
  readonly path: string
}

export function pcpSite(layerStack: PcpLayerStackIdentifier, path: string): PcpSite {
  return { layerStack, path }
}

export function pcpSiteKey(site: PcpSite): string {
  return `${pcpLayerStackIdentifierKey(site.layerStack)}\0${site.path}`
}

export function pcpSiteEquals(a: PcpSite, b: PcpSite): boolean {
  return a.path === b.path && pcpLayerStackIdentifierEquals(a.layerStack, b.layerStack)
}

// PcpLayerStackSite (OpenUSD v26.08 pxr/usd/pcp/site.h:76-117) is the
// identity-bearing site exposed by PcpNodeRef.  PcpSite above intentionally
// retains the layer-stack *identifier* form used by cache/error internals;
// this value carries the computed layer stack itself.
export class PcpLayerStackSite {
  constructor(
    public layerStack: PcpLayerStack,
    public path: SdfPath,
  ) {}

  equals(other: PcpLayerStackSite): boolean {
    return this.layerStack === other.layerStack &&
      this.path.pathString === other.path.pathString
  }

  toString(): string {
    return `${pcpLayerStackIdentifierString(this.layerStack.identifier)}<${this.path.pathString}>`
  }
}

/** OpenUSD v26.08 PcpLayerStackIdentifier stream form. */
export function pcpLayerStackIdentifierString(id: PcpLayerStackIdentifier): string {
  let result = `@${id.rootLayer.filePath}@`
  if (id.sessionLayer) result += `,@${id.sessionLayer.filePath}@`
  return result
}
