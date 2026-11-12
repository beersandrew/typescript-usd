// Ported from OpenUSD 26.11.1: pxr/exec/exec/validationError.cpp,
//  pxr/exec/exec/validationError.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/validationError.h and
// validationError.cpp.

import { Enum as TfEnum } from 'typescript-usd/tf'

/**
 * Types of errors reported by exec compilation (validationError.h:15-29).
 *
 * Errors are reported by TF_ERROR(ExecValidationErrorType::..., message);
 * clients check for them with a TfErrorMark.
 */
export enum ExecValidationErrorType {
  /** Exec compilation encountered a computation that depends on itself. */
  DataDependencyCycle = 'ExecValidationErrorType::DataDependencyCycle',
}

// TF_REGISTRY_FUNCTION(TfEnum) (validationError.cpp:14-18).
TfEnum.addName(
  ExecValidationErrorType.DataDependencyCycle, 'DataDependencyCycle', 'Data Dependency Cycle',
  'ExecValidationErrorType::DataDependencyCycle')
