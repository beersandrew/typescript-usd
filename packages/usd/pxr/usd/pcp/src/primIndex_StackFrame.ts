// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex_StackFrame.cpp,
//  pxr/usd/pcp/primIndex_StackFrame.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpPrimIndex_StackFrame. Port of OpenUSD v26.08
// pxr/usd/pcp/primIndex_StackFrame.h: links a recursive Pcp_BuildPrimIndex
// call to the graph that will receive its result.

import { PcpArcType } from './arc.ts'
import type { PcpArc } from './arc.ts'
import type { PcpNodeRef } from './node.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import type { PcpLayerStackSite } from './site.ts'

export class PcpPrimIndex_StackFrame {
  constructor(
    readonly requestedSite: PcpLayerStackSite,
    readonly parentNode: PcpNodeRef,
    readonly arcToParent: PcpArc,
    readonly previousFrame: PcpPrimIndex_StackFrame | null,
    readonly originatingIndex: PcpPrimIndex | null,
    readonly skipDuplicateNodes: boolean,
  ) {}
}

export class PcpPrimIndex_StackFrameIterator {
  constructor(
    public node: PcpNodeRef | null,
    public previousFrame: PcpPrimIndex_StackFrame | null,
  ) {}

  // Step to the next parent node.
  next(): void {
    if (!this.node) return
    if (this.node.getArcType() !== PcpArcType.Root) {
      this.node = this.node.getParentNode()
    } else if (this.previousFrame) {
      this.node = this.previousFrame.parentNode
      this.previousFrame = this.previousFrame.previousFrame
    } else {
      this.node = null
    }
  }

  // Step to the first parent node in the next recursive call.
  nextFrame(): void {
    if (this.previousFrame) {
      this.node = this.previousFrame.parentNode
      this.previousFrame = this.previousFrame.previousFrame
    } else {
      this.node = null
    }
  }

  // The type of arc connecting the current node with its parent.
  getArcType(): PcpArcType {
    if (!this.node) return PcpArcType.Root
    if (this.node.getArcType() !== PcpArcType.Root) return this.node.getArcType()
    if (this.previousFrame) return this.previousFrame.arcToParent.type
    return PcpArcType.Root
  }
}
