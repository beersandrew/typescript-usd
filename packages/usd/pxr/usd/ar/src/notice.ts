// Ported from OpenUSD 26.11.1: pxr/usd/ar/notice.cpp, pxr/usd/ar/notice.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArResolverContext } from './resolverContext.ts'

export namespace ArNotice {
  // ArNotice::ResolverChanged (notice.h:58-111, notice.cpp:28-45).
  export class ResolverChanged {
    readonly affectsContext: (context: ArResolverContext) => boolean

    // No argument: affects every context (notice.cpp:28-31). A function is
    // the affects predicate (notice.cpp:33-37). An ArResolverContext affects
    // contexts that Contain all of its objects, and a context object affects
    // contexts that Contain it (notice.h:79-101).
    constructor(affects?: ((context: ArResolverContext) => boolean) | ArResolverContext | object) {
      if (affects === undefined) {
        this.affectsContext = () => true
      } else if (typeof affects === 'function') {
        this.affectsContext = affects as (context: ArResolverContext) => boolean
      } else {
        const held = affects
        this.affectsContext = other => other.contains(held)
      }
    }

    // ArNotice::ResolverChanged::AffectsContext (notice.cpp:41-45).
    AffectsContext(context: ArResolverContext): boolean { return this.affectsContext(context) }
  }
}

const resolverChangedListeners = new Set<(notice: ArNotice.ResolverChanged) => void>()

/** @internal Sdf subscribes here to mirror TfNotice delivery. */
export function _onResolverChanged(
  listener: (notice: ArNotice.ResolverChanged) => void,
): () => void {
  resolverChangedListeners.add(listener)
  return () => resolverChangedListeners.delete(listener)
}

/** @internal Called by ArResolver::refreshContext implementations. */
export function _sendResolverChanged(notice: ArNotice.ResolverChanged): void {
  for (const listener of resolverChangedListeners) listener(notice)
}
