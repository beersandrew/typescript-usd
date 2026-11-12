// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/request.cpp,
//  pxr/exec/execUsd/request.h, pxr/exec/exec/requestImpl.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/request.h and request.cpp.
//
// ExecUsdRequest is move-only upstream and owns its ExecUsd_RequestImpl
// through a unique_ptr. The TS request owns the impl the same way; its
// destructor, which destroys the impl and so removes it from the system's
// request tracker (exec/requestImpl.cpp:54-59), is Destroy() (also
// [Symbol.dispose] for `using`). A request that is never destroyed stays
// tracked by its system until the system is destroyed, like a C++ request
// that is leaked.

import type { ExecUsd_RequestImpl } from './requestImpl.ts'

/**
 * A batch of values to compute together (request.h:24-63).
 *
 * Requests are built by ExecUsdSystem::BuildRequest and computed by
 * ExecUsdSystem::Compute.
 */
export class ExecUsdRequest {
  private _impl: ExecUsd_RequestImpl | null

  /** @internal Constructed by ExecUsdSystem only (request.h:54-55,
   *  request.cpp:13-15). */
  constructor(impl: ExecUsd_RequestImpl) {
    this._impl = impl
  }

  /**
   * ~ExecUsdRequest (request.cpp:21): destroys the request implementation,
   * which removes it from the system.
   */
  destroy(): void {
    const impl = this._impl
    this._impl = null
    impl?.destroy()
  }

  /**
   * operator=(ExecUsdRequest &&) (request.h:37-38, request.cpp:19): the
   * unique_ptr move assignment destroys this request's impl and takes
   * `rhs`'s, leaving `rhs` invalid.
   */
  moveAssign(rhs: ExecUsdRequest): this {
    if (rhs === this) {
      return this
    }
    const impl = rhs._impl
    rhs._impl = null
    const old = this._impl
    this._impl = impl
    old?.destroy()
    return this
  }

  [Symbol.dispose](): void {
    this.destroy()
  }

  /**
   * Return true if this request may be used to compute values
   * (request.h:43-51, request.cpp:23-27).
   *
   * Note that a return value of true does not mean that values are cached
   * or even that the network has been compiled.  It only means that
   * calling ExecUsdSystem::PrepareRequest or ExecUsdSystem::Compute is
   * allowed.
   */
  isValid(): boolean {
    return this._impl !== null && this._impl.isValid()
  }

  /** @internal request.h:57-59 (ExecUsdSystem is a friend). */
  _getImpl(): ExecUsd_RequestImpl {
    return this._impl!
  }
}
