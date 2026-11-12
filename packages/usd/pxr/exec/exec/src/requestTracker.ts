// Ported from OpenUSD 26.11.1: pxr/exec/exec/requestTracker.cpp,
//  pxr/exec/exec/requestTracker.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/requestTracker.h and
// requestTracker.cpp.
//
// The spin mutex is dropped (single-threaded). pxr_tsl::robin_set of request
// impls is an insertion-ordered Set. The destructor is Destroy().

import { Debug as TfDebug, TF_VERIFY } from 'typescript-usd/tf'
import { WorkParallelForEach, WorkWithScopedParallelism } from 'typescript-usd/work'

import { ExecDebugCodes } from './debugCodes.ts'
import type {
  Exec_AttributeValueInvalidationResult,
  Exec_DisconnectedInputsInvalidationResult,
  Exec_MetadataInvalidationResult,
} from './invalidationResult.ts'
import type { Exec_RequestImpl } from './requestImpl.ts'
import type { Exec_TimeChangeInvalidationResult } from './timeChangeInvalidationResult.ts'

/** Maintains a (non-owning) set of outstanding requests (requestTracker.h:27-93). */
export class Exec_RequestTracker {
  private readonly _requests = new Set<Exec_RequestImpl>()

  /**
   * Expires all outstanding requests (requestTracker.cpp:17-28). Expired
   * requests will not receive any future invalidation. This does not delete
   * impl objects as these are owned exclusively by their request.
   */
  destroy(): void {
    TfDebug.msg(ExecDebugCodes.EXEC_REQUEST_EXPIRATION,
      `[Exec_RequestTracker] Expiring ${this._requests.size} requests\n`)

    // The system has already released this tracker, so Expire does not
    // remove the impl from it (requestImpl.cpp:600-609).
    for (const impl of this._requests) {
      impl.expire()
    }
  }

  /** Add `impl` to the collection of outstanding requests (requestTracker.cpp:30-39). */
  insert(impl: Exec_RequestImpl): void {
    const inserted = !this._requests.has(impl)
    this._requests.add(impl)
    TF_VERIFY(inserted, 'inserted')
  }

  /** Remove `impl` from the collection of outstanding requests (requestTracker.cpp:41-50). */
  remove(impl: Exec_RequestImpl): void {
    const erased = this._requests.delete(impl)
    TF_VERIFY(erased, 'erased')
  }

  /**
   * Notify all requests of invalid computed values as a consequence of
   * attribute or metadata authored value invalidation, or of uncompilation
   * (requestTracker.cpp:52-77). The three upstream overloads are one method;
   * the request impl dispatches on the result.
   */
  didInvalidateComputedValues(
    invalidationResult:
      | Exec_AttributeValueInvalidationResult
      | Exec_MetadataInvalidationResult
      | Exec_DisconnectedInputsInvalidationResult,
  ): void {
    this.parallelForEachRequest(impl => {
      impl.didInvalidateComputedValues(invalidationResult)
    })
  }

  /**
   * Notify all requests to invalidate value keys that don't have a compiled
   * leaf node (requestTracker.cpp:79-85).
   */
  didInvalidateUnknownValues(): void {
    this.parallelForEachRequest(impl => {
      impl.didInvalidateUnknownValues()
    })
  }

  /** Notify all requests of time having changed (requestTracker.cpp:87-94). */
  didChangeTime(invalidationResult: Exec_TimeChangeInvalidationResult): void {
    this.parallelForEachRequest(impl => {
      impl.didChangeTime(invalidationResult)
    })
  }

  /**
   * Invoke `f` on each tracked request (requestTracker.h:95-107). `f` must
   * not re-enter the request tracker.
   */
  parallelForEachRequest(f: (impl: Exec_RequestImpl) => void): void {
    WorkWithScopedParallelism(() => {
      WorkParallelForEach(this._requests, impl => {
        f(impl)
      })
    })
  }
}
