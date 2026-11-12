// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolverContextBinder.cpp,
//  pxr/usd/ar/resolverContextBinder.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArGetResolver, _currentDispatchingResolver, type ArResolver } from './resolver.ts'
import { ArResolverContext } from './resolverContext.ts'
import { _getResolverContext, _withResolverContext } from './asyncState.ts'

/** @internal Browser-safe capture point used by resolver operations. */
export function _getBoundResolverContext(resolver: ArResolver): ArResolverContext {
  // A resolver's own binding, else the context bound through ArGetResolver()
  // (ArResolver::_GetInternallyManagedCurrentContext, resolver.cpp:1772-1776).
  const dispatching = _currentDispatchingResolver()
  return _getResolverContext(resolver)
    ?? (dispatching && dispatching !== resolver ? _getResolverContext(dispatching) : undefined)
    ?? new ArResolverContext()
}

// The C++ class uses RAII (resolverContextBinder.cpp:14-40). TypeScript has no
// deterministic destructors, so the adaptation scopes ownership through run():
// BindContext before fn, UnbindContext once fn (and any promise it returns)
// settles. The async logical-context carrier stays private.
export class ArResolverContextBinder {
  constructor(
    readonly context: ArResolverContext,
    readonly resolver: ArResolver = ArGetResolver(),
  ) {}

  run<T>(fn: () => T): T {
    const bindingData: { value?: unknown } = {}
    this.resolver.bindContext(this.context, bindingData)
    let pending = false
    try {
      const result = _withResolverContext(this.resolver, this.context, fn)
      if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
        pending = true
        return Promise.resolve(result).finally(
          () => this.resolver.unbindContext(this.context, bindingData)) as T
      }
      return result
    } finally {
      if (!pending) this.resolver.unbindContext(this.context, bindingData)
    }
  }
}
