// Ported from OpenUSD 26.11.1: pxr/base/tf/diagnostic.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local spellings of the pxr/base/tf/diagnostic.h macros the hgi sources use
// (TF_CODING_ERROR, TF_VERIFY, TF_WARN). Not part of the hgi barrel.

import {
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
} from 'typescript-usd/tf'

/** TF_CODING_ERROR (diagnostic.h:311-315): post a coding error and continue. */
export function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(
    new TfError(message, TfDiagnosticType.CodingError))
}

/** TF_VERIFY (diagnostic.h:399-405): post a coding error when `cond` is
 *  false and return `cond`. */
export function TF_VERIFY(cond: unknown, message = ''): boolean {
  if (!cond) {
    TF_CODING_ERROR(message
      ? `Failed verification: ' ${message} '`
      : 'Failed verification')
  }
  return Boolean(cond)
}

/** TF_WARN (diagnostic.h:377-381). */
export function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}
