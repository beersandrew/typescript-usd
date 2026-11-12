// Ported from OpenUSD 26.11.1: pxr/usd/pcp/dependency.cpp,
//  pxr/usd/pcp/dependency.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Dependency classification and value types from OpenUSD v26.08
// pxr/usd/pcp/dependency.{h,cpp}.

import { SdfPath } from 'typescript-usd/sdf/path'
import { PcpArcType } from './arc.ts'
import { PcpMapFunction } from './mapFunction.ts'
import type { PcpNodeRef } from './node.ts'

export enum PcpDependencyType {
  None = 0,
  Root = 1 << 0,
  PurelyDirect = 1 << 1,
  PartlyDirect = 1 << 2,
  Ancestral = 1 << 3,
  Virtual = 1 << 4,
  NonVirtual = 1 << 5,
  Direct = PurelyDirect | PartlyDirect,
  AnyNonVirtual = Root | Direct | Ancestral | NonVirtual,
  AnyIncludingVirtual = AnyNonVirtual | Virtual,
}

// OpenUSD v26.08 dependency.h:29-84 exposes the enumerators directly in the
// Pcp namespace in addition to using them as a bitmask type.
export const PcpDependencyTypeNone = PcpDependencyType.None
export const PcpDependencyTypeRoot = PcpDependencyType.Root
export const PcpDependencyTypePurelyDirect = PcpDependencyType.PurelyDirect
export const PcpDependencyTypePartlyDirect = PcpDependencyType.PartlyDirect
export const PcpDependencyTypeAncestral = PcpDependencyType.Ancestral
export const PcpDependencyTypeVirtual = PcpDependencyType.Virtual
export const PcpDependencyTypeNonVirtual = PcpDependencyType.NonVirtual
export const PcpDependencyTypeDirect = PcpDependencyType.Direct
export const PcpDependencyTypeAnyNonVirtual = PcpDependencyType.AnyNonVirtual
export const PcpDependencyTypeAnyIncludingVirtual = PcpDependencyType.AnyIncludingVirtual

export type PcpDependencyFlags = number

function path(value: SdfPath | string): SdfPath {
  return typeof value === 'string' ? SdfPath.fromString(value) : value
}

export class PcpDependency {
  indexPath: SdfPath
  sitePath: SdfPath

  constructor(
    indexPath: SdfPath | string,
    sitePath: SdfPath | string,
    public mapFunc: PcpMapFunction,
  ) {
    this.indexPath = path(indexPath)
    this.sitePath = path(sitePath)
  }

  equals(other: PcpDependency): boolean {
    return this.indexPath.pathString === other.indexPath.pathString &&
      this.sitePath.pathString === other.sitePath.pathString &&
      this.mapFunc.equals(other.mapFunc)
  }
}

// PcpNodeIntroducesDependency (dependency.cpp:31-51). The specialize case
// falls through to the inherit check, as the C++ switch does.
export function pcpNodeIntroducesDependency(node: PcpNodeRef): boolean {
  if (node.isInert) {
    switch (node.getArcType()) {
      case PcpArcType.Specialize:
        if (node.getParentNode() !== node.getRootNode()) return false
        // falls through
      case PcpArcType.Inherit:
        if (node.getOriginNode() !== node.getParentNode()) return false
        break
      default:
        break
    }
  }
  return true
}

// PcpClassifyNodeDependency (dependency.cpp:53-91).
export function pcpClassifyNodeDependency(node: PcpNodeRef): PcpDependencyFlags {
  if (node.getArcType() === PcpArcType.Root) return PcpDependencyType.Root
  let flags = PcpDependencyType.None
  if (node.isInert) {
    if (!pcpNodeIntroducesDependency(node)) return PcpDependencyType.None
    flags |= PcpDependencyType.Virtual
  }
  const anyDirect = node.hasTransitiveDirectDependency()
  const anyAncestral = node.hasTransitiveAncestralDependency()
  if (anyDirect) {
    flags |= anyAncestral
      ? PcpDependencyType.PartlyDirect
      : PcpDependencyType.PurelyDirect
  } else if (anyAncestral) {
    flags |= PcpDependencyType.Ancestral
  }
  if ((flags & PcpDependencyType.Virtual) === 0) flags |= PcpDependencyType.NonVirtual
  return flags
}

export function pcpDependencyFlagsToString(flags: PcpDependencyFlags): string {
  const tags: string[] = []
  if (flags === PcpDependencyType.None) tags.push('none')
  if (flags === PcpDependencyType.Root) tags.push('root')
  if (flags & PcpDependencyType.PurelyDirect) tags.push('purely-direct')
  if (flags & PcpDependencyType.PartlyDirect) tags.push('partly-direct')
  if (flags & PcpDependencyType.Ancestral) tags.push('ancestral')
  if (flags & PcpDependencyType.Virtual) tags.push('virtual')
  if (flags & PcpDependencyType.NonVirtual) tags.push('non-virtual')
  return tags.sort().join(', ')
}
