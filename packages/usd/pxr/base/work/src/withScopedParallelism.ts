// Ported from OpenUSD 26.11.1: pxr/base/work/withScopedParallelism.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/base/work/withScopedParallelism.h (OpenUSD 26.11.1). There
// is no Python GIL to drop and no task arena to isolate.

import { WorkDispatcher } from './dispatcher.ts'

/** WorkWithScopedParallelism (withScopedParallelism.h:98-109). */
export function WorkWithScopedParallelism<R>(fn: () => R, _dropPythonGIL = true): R {
  return fn()
}

/**
 * WorkWithScopedDispatcher (withScopedParallelism.h:117-127): runs fn with a
 * new dispatcher and then waits on it, as the dispatcher's destructor does.
 */
export function WorkWithScopedDispatcher<R>(fn: (dispatcher: WorkDispatcher) => R,
  dropPythonGIL = true): R {
  return WorkWithScopedParallelism(() => {
    const dispatcher = new WorkDispatcher()
    try {
      return fn(dispatcher)
    } finally {
      dispatcher.Wait()
    }
  }, dropPythonGIL)
}
