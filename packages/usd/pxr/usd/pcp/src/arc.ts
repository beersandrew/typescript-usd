// Ported from OpenUSD 26.11.1: pxr/usd/pcp/arc.cpp, pxr/usd/pcp/arc.h,
//  pxr/usd/pcp/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpArcType — the kinds of composition arcs, in strength order.
// Faithful port of OpenUSD pcp/types.h:23 (PcpArcType enum) and the
// arc-classification helpers at types.h:72-94.
//
// The integer values ARE the per-arc-type strength rank used to order
// sibling nodes (lower = stronger): Root is the local/root node and is
// strongest; class-based arcs (Inherit) are stronger than Variant, which is
// stronger than Relocate, Reference, Payload. Specialize is the exception —
// although its enum value is largest, the prim-index graph re-homes
// specializes to the root so they compose WEAKEST of all; that special case
// lives in the graph builder (Phase 3), not in this enum. This matches the
// inline engine's ARC map (usd/src/stage.ts) one-for-one (Local == Root).

import { PcpMapExpression } from './mapExpression.ts'
import type { PcpNodeRef } from './node.ts'

export enum PcpArcType {
  Root = 0,
  Inherit = 1,
  Variant = 2,
  Relocate = 3,
  Reference = 4,
  Payload = 5,
  Specialize = 6,
}

// The seven registered enum constants are public names independently of the
// enum type (OpenUSD v26.08 pxr/usd/pcp/types.h:26-43).
export const PcpArcTypeRoot = PcpArcType.Root
export const PcpArcTypeInherit = PcpArcType.Inherit
export const PcpArcTypeVariant = PcpArcType.Variant
export const PcpArcTypeRelocate = PcpArcType.Relocate
export const PcpArcTypeReference = PcpArcType.Reference
export const PcpArcTypePayload = PcpArcType.Payload
export const PcpArcTypeSpecialize = PcpArcType.Specialize

// Public graph-edge descriptor from OpenUSD v26.08
// pxr/usd/pcp/arc.h:25-68. The live TypeScript graph stores these fields on
// its source node; this value is used when constructing/introspecting an edge.
export class PcpArc {
  constructor(
    public type: PcpArcType = PcpArcType.Root,
    public parent: PcpNodeRef | null = null,
    public origin: PcpNodeRef | null = null,
    public mapToParent: PcpMapExpression = PcpMapExpression.identity(),
    public siblingNumAtOrigin = 0,
    public namespaceDepth = 0,
  ) {}
}

// Inherit and Specialize are the "class-based" arcs — the ones that
// propagate as implied classes up to ancestral layer stacks (the spooky
// inherits mechanism). pcp/types.h:72-94.
export function pcpIsInheritArc(arc: PcpArcType): boolean {
  return arc === PcpArcType.Inherit
}

export function pcpIsSpecializeArc(arc: PcpArcType): boolean {
  return arc === PcpArcType.Specialize
}

export function pcpIsClassBasedArc(arc: PcpArcType): boolean {
  return arc === PcpArcType.Inherit || arc === PcpArcType.Specialize
}

// Per-arc-type strength comparison: negative if `a` is stronger than `b`.
// Sibling-node strength upstream (PcpCompareSiblingNodeStrength) also weighs
// layer order, sibling number, and namespace depth — those enter in the graph
// builder. This compares ONLY the arc-type dimension, with the specialize
// caveat noted above.
export function pcpCompareArcTypeStrength(a: PcpArcType, b: PcpArcType): number {
  return a - b
}
