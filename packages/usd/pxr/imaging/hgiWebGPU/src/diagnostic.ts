// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/diagnostic.h,
//  pxr/imaging/hgiMetal/diagnostic.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU diagnostics. Modelled on pxr/imaging/hgiMetal/diagnostic.{h,mm}:
// device errors that the API reports out of band (Metal's pending errors,
// WebGPU's uncapturederror events and error scopes) are posted as Tf
// errors, and the TF_* helpers the backend uses are spelled here.

import {
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
} from 'typescript-usd/tf'

/** TF_CODING_ERROR (pxr/base/tf/diagnostic.h:311-315). */
export function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(
    new TfError(message, TfDiagnosticType.CodingError))
}

/** TF_RUNTIME_ERROR (pxr/base/tf/diagnostic.h). */
export function TF_RUNTIME_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(
    new TfError(message, TfDiagnosticType.RuntimeError))
}

/** TF_VERIFY (pxr/base/tf/diagnostic.h:399-405). */
export function TF_VERIFY(cond: unknown, message = ''): boolean {
  if (!cond) {
    TF_CODING_ERROR(message ? `Failed verification: ' ${message} '` : 'Failed verification')
  }
  return Boolean(cond)
}

/** TF_WARN (pxr/base/tf/diagnostic.h:377-381). */
export function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

/** HgiMetalSetupMetalDebug (hgiMetal/diagnostic.mm): route errors the device
 *  reports outside an error scope to Tf, as HgiMetalPostPendingErrors does
 *  for Metal's pending errors. */
export function HgiWebGPUSetupDebug(device: GPUDevice): void {
  const target = device as GPUDevice & { addEventListener?: GPUDevice['addEventListener'] }
  target.addEventListener?.('uncapturederror', (event: Event) => {
    const error = (event as GPUUncapturedErrorEvent).error
    TF_RUNTIME_ERROR(`HgiWebGPU: ${error?.message ?? 'unknown device error'}`)
  })
}
