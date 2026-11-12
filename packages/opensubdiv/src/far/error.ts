// Ported from OpenSubdiv 3.6.1: opensubdiv/far/error.h,
//  opensubdiv/far/error.cpp
// Copyright 2013 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Ported from OpenSubdiv 3.6.1 opensubdiv/far/error.{h,cpp} (local source
// addition, see PROVENANCE.md).
//
// Deliberate divergences:
// - The printf-style variadic `Error(err, format, ...)` and
//   `Warning(format, ...)` take an already formatted message; they are named
//   FarError and FarWarning so they do not shadow the global Error.
// - The default output (error.cpp:77-79, 92-94: printf to stdout) is
//   console.log with the same text.

/** far/error.h:33-40 */
export enum ErrorType {
  FAR_NO_ERROR,           ///< No error. Move along.
  FAR_FATAL_ERROR,        ///< Issue a fatal error and end the program.
  FAR_INTERNAL_CODING_ERROR, ///< Issue an internal programming error, but continue execution.
  FAR_CODING_ERROR,       ///< Issue a generic programming error, but continue execution.
  FAR_RUNTIME_ERROR,      ///< Issue a generic runtime error, but continue execution.
}

/** far/error.h:44-58 */
export type ErrorCallbackFunc = (err: ErrorType, message: string) => void
export type WarningCallbackFunc = (message: string) => void

// error.cpp:38-39
let errorFunc: ErrorCallbackFunc | null = null
let warningFunc: WarningCallbackFunc | null = null

/** error.cpp:45-47 */
export function SetErrorCallback(func: ErrorCallbackFunc | null): void {
  errorFunc = func
}

/** error.cpp:49-51 */
export function SetWarningCallback(func: WarningCallbackFunc | null): void {
  warningFunc = func
}

/** error.cpp:61-81 */
export function FarError(err: ErrorType, message: string): void {
  const errorTypeLabel = [
    'No Error',
    'Fatal Error',
    'Coding Error (internal)',
    'Coding Error',
    'Error',
  ]
  if (errorFunc) {
    errorFunc(err, message)
  } else {
    console.log(`${errorTypeLabel[err]}: ${message}`)
  }
}

/** error.cpp:83-96 */
export function FarWarning(message: string): void {
  if (warningFunc) {
    warningFunc(message)
  } else {
    console.log(`Warning: ${message}`)
  }
}
