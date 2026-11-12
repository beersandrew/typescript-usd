// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/requestImpl.cpp,
//  pxr/exec/execUsd/requestImpl.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/requestImpl.h and
// requestImpl.cpp.
//
// The visitors of requestImpl.cpp:28-107 are ExecUsd_ValueKeyVisitor objects.
// ExecUsd_ExpireValueKey, a friend of ExecUsdValueKey, is a module function.
// The tbb::concurrent_vector of newly expired indices is an array, filled by
// typescript-usd/work's serial WorkParallelForN (docs/openexec-x1.md section 5).

import { Debug as TfDebug, TfBits, TF_VERIFY } from 'typescript-usd/tf'
import { WorkParallelForN, WorkWithScopedParallelism } from 'typescript-usd/work'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfUsdSceneAdapter, _EsfUsdGetPath, _EsfUsdPrimDefaultPredicate } from 'typescript-usd/esfUsd'
import {
  ExecDebugCodes,
  Exec_RequestImpl,
  ExecValueKey,
  type ExecRequestComputedValueInvalidationCallback,
  type ExecRequestIndexSet,
  type ExecRequestTimeChangeInvalidationCallback,
  type ExecValueOverrideVector,
} from 'typescript-usd/exec'

import { ExecUsdCacheView } from './cacheView.ts'
import type { ExecUsdSystem } from './system.ts'
import type { ExecUsdValueKey } from './valueKey.ts'
import type { ExecUsdValueOverrideVector } from './valueOverride.ts'
import { ExecUsd_VisitValueKey, type ExecUsd_ValueKeyVisitor } from './visitValueKey.ts'

const EXEC_REQUEST_EXPIRATION = ExecDebugCodes.EXEC_REQUEST_EXPIRATION

// Converts an ExecUsdValueKey to an ExecValueKey (requestImpl.cpp:30-58).
//
// Expired value keys are converted to ExecValueKeys with an invalid
// provider.
const _ValueKeyVisitor: ExecUsd_ValueKeyVisitor<ExecValueKey> = {
  ExecUsd_ExpiredValueKey() {
    return new ExecValueKey(
      EsfUsdSceneAdapter.adaptObject(undefined /* UsdObject() */),
      '')
  },
  ExecUsd_AttributeComputationValueKey(key) {
    return new ExecValueKey(
      EsfUsdSceneAdapter.adaptObject(key.provider),
      key.computation)
  },
  ExecUsd_PrimComputationValueKey(key) {
    return new ExecValueKey(
      EsfUsdSceneAdapter.adaptObject(key.provider),
      key.computation)
  },
}

// Returns true if the value key's provider is valid (requestImpl.cpp:60-75).
const _IsValidVisitor: ExecUsd_ValueKeyVisitor<boolean> = {
  ExecUsd_ExpiredValueKey() {
    return false
  },
  ExecUsd_AttributeComputationValueKey(key) {
    return key.provider.isValid() &&
      _EsfUsdPrimDefaultPredicate(key.provider.getPrim())
  },
  ExecUsd_PrimComputationValueKey(key) {
    return key.provider.isValid() && _EsfUsdPrimDefaultPredicate(key.provider)
  },
}

// requestImpl.cpp:95-106
function _Format(tag: string, providerPath: SdfPath, computation: string): string {
  let s = tag
  s += ' '
  s += providerPath.pathString
  s += ' ('
  s += computation
  s += ')'
  return s
}

// requestImpl.cpp:77-107
const _DebugStringVisitor: ExecUsd_ValueKeyVisitor<string> = {
  ExecUsd_ExpiredValueKey(key) {
    return _Format('[expired]', key.path, key.computation)
  },
  ExecUsd_AttributeComputationValueKey(key) {
    return _Format('[attribute]', _EsfUsdGetPath(key.provider), key.computation)
  },
  ExecUsd_PrimComputationValueKey(key) {
    return _Format('[prim]', _EsfUsdGetPath(key.provider), key.computation)
  },
}

/**
 * Expires a value key by replacing it with an ExecUsd_ExpiredValueKey
 * (requestImpl.cpp:180-202; a friend of ExecUsdValueKey, valueKey.h:72-74).
 */
export function ExecUsd_ExpireValueKey(uvk: ExecUsdValueKey): void {
  const key = uvk._key

  if (key.kind === 'ExecUsd_AttributeComputationValueKey') {
    uvk._key = {
      kind: 'ExecUsd_ExpiredValueKey',
      path: _EsfUsdGetPath(key.provider),
      computation: key.computation,
    }
  } else if (key.kind === 'ExecUsd_PrimComputationValueKey') {
    uvk._key = {
      kind: 'ExecUsd_ExpiredValueKey',
      path: _EsfUsdGetPath(key.provider),
      computation: key.computation,
    }
  } else {
    const heldTypeName = key.kind
    TF_VERIFY(false, 'false',
      `Attempted to expire unhandled key variant '${heldTypeName}'`)
  }
}

/**
 * Implements ExecUsdRequest (requestImpl.h:28-82).
 */
export class ExecUsd_RequestImpl extends Exec_RequestImpl {
  private readonly _valueKeys: ExecUsdValueKey[]
  private readonly _expired: TfBits
  private _isValid: boolean

  /** requestImpl.cpp:111-126 */
  constructor(
    system: ExecUsdSystem,
    valueKeys: ExecUsdValueKey[],
    valueCallback: ExecRequestComputedValueInvalidationCallback | null,
    timeCallback: ExecRequestTimeChangeInvalidationCallback | null,
  ) {
    super(system, valueCallback, timeCallback)
    this._valueKeys = valueKeys
    this._expired = new TfBits(this._valueKeys.length)
    this._isValid = true

    // Because request expiration is driven by change processing, we must
    // check the initial validity of value keys and immediately expire indices
    // for invalid keys.
    this.expireInvalidIndices()
  }

  /** Returns false if any value key in the request has expired
   *  (requestImpl.h:43-46). */
  isValid(): boolean {
    return this._isValid
  }

  /** Returns per-index expiration state (requestImpl.h:48-51). */
  getExpiredIndices(): TfBits {
    return this._expired
  }

  /** Compile the request (requestImpl.cpp:130-148). */
  Compile(): void {
    if (!this._requiresCompilation()) {
      return
    }

    const valueKeys: ExecValueKey[] = []
    for (const uvk of this._valueKeys) {
      valueKeys.push(ExecUsd_VisitValueKey(_ValueKeyVisitor, uvk))
    }

    this._compile(valueKeys)
  }

  /** Schedule the request (requestImpl.cpp:150-154). */
  schedule(): void {
    this._Schedule()
  }

  /** Computes the value keys in the request (requestImpl.cpp:156-160). */
  compute(): ExecUsdCacheView {
    return new ExecUsdCacheView(this._compute())
  }

  /**
   * Computes the value keys in the request in the presence of the provided
   * `valueOverrides` (requestImpl.cpp:162-178).
   */
  computeWithOverrides(valueOverrides: ExecUsdValueOverrideVector): ExecUsdCacheView {
    // Transform ExecUsdValueOverrides into ExecValueOverrides.
    const execValueOverrides: ExecValueOverrideVector = []
    for (const valueOverride of valueOverrides) {
      execValueOverrides.push({
        valueKey: ExecUsd_VisitValueKey(_ValueKeyVisitor, valueOverride.valueKey),
        overrideValue: valueOverride.overrideValue,
      })
    }

    return new ExecUsdCacheView(
      this._computeWithOverrides(execValueOverrides))
  }

  /**
   * Expires the request based on providers that have become invalid
   * (requestImpl.cpp:204-253).
   */
  expireInvalidIndices(): void {
    const newExpired: number[] = []
    WorkWithScopedParallelism(() => {
      WorkParallelForN(
        this._valueKeys.length,
        (i: number, n: number) => {
          for (; i < n; ++i) {
            // Each index only expires once.
            if (this._expired.isSet(i)) {
              continue
            }

            const uvk = this._valueKeys[i]!
            const isKeyValid = ExecUsd_VisitValueKey(_IsValidVisitor, uvk)
            if (!isKeyValid) {
              newExpired.push(i)
              ExecUsd_ExpireValueKey(uvk)
            }
          }
        })
    })

    if (TfDebug.isEnabled(EXEC_REQUEST_EXPIRATION)) {
      TfDebug.msg(EXEC_REQUEST_EXPIRATION,
        `[ExecUsd_RequestImpl::ExpireInvalidIndices] Expiring ` +
        `${newExpired.length} indices:\n`)
      for (const i of newExpired) {
        const uvk = this._valueKeys[i]!

        TfDebug.msg(EXEC_REQUEST_EXPIRATION,
          ` ... ${i} : ${ExecUsd_VisitValueKey(_DebugStringVisitor, uvk)}\n`)
      }
    }

    if (newExpired.length !== 0) {
      this._isValid = false
      for (const i of newExpired) {
        this._expired.Set(i)
      }
      const indices: ExecRequestIndexSet = new Set(newExpired)
      this._expireIndices(indices)
    }
  }

  /**
   * Removes the request from the system (requestImpl.cpp:255-260).
   *
   * This prevents any further notification and releases internal request
   * data structures.
   */
  discard(): void {
    this._discard()
    this._expired.resize(0)
  }
}
