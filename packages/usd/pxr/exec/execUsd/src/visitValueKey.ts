// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/visitValueKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/visitValueKey.h.
//
// std::visit over the key variant: the visitor's overloaded operator() is an
// object with one method per alternative, named after the alternative struct.

import type {
  ExecUsd_AttributeComputationValueKey,
  ExecUsd_ExpiredValueKey,
  ExecUsd_PrimComputationValueKey,
  ExecUsdValueKey,
} from './valueKey.ts'

/** A visitor of ExecUsdValueKey's variant (one operator() per alternative). */
export interface ExecUsd_ValueKeyVisitor<R> {
  ExecUsd_ExpiredValueKey(key: ExecUsd_ExpiredValueKey): R
  ExecUsd_AttributeComputationValueKey(key: ExecUsd_AttributeComputationValueKey): R
  ExecUsd_PrimComputationValueKey(key: ExecUsd_PrimComputationValueKey): R
}

/** visitValueKey.h:20-26 */
export function ExecUsd_VisitValueKey<R>(
  visitor: ExecUsd_ValueKeyVisitor<R>,
  uvk: ExecUsdValueKey,
): R {
  const key = uvk._key
  switch (key.kind) {
    case 'ExecUsd_ExpiredValueKey':
      return visitor.ExecUsd_ExpiredValueKey(key)
    case 'ExecUsd_AttributeComputationValueKey':
      return visitor.ExecUsd_AttributeComputationValueKey(key)
    case 'ExecUsd_PrimComputationValueKey':
      return visitor.ExecUsd_PrimComputationValueKey(key)
  }
}
