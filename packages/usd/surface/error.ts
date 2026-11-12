// Ported from OpenUSD 26.11.1: pxr/base/tf/pyError.cpp,
//  pxr/base/tf/pyModule.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The surface's error boundary (packages/usd/docs/style-guide.md rule 5).
//
// The core posts upstream's Tf diagnostics and returns false/undefined as
// OpenUSD's C++ does. The surface instead throws one error class, as
// OpenUSD's Python bindings do: every wrapped call runs under a TfErrorMark
// and errors posted during it become a Tf.ErrorException
// (pxr/base/tf/pyModule.cpp:157-176, pyError.cpp:31-60).
import { TfErrorMark, type Error as TfError } from 'typescript-usd/tf'

/**
 * The error every surface member throws on failure.
 *
 * `errors` are the Tf errors the core posted during the failed call (taken
 * out of the diagnostic manager, so they are not also reported). `cause` is
 * the exception the core threw, when it threw one.
 *
 * @upstream TfPyConvertTfErrorsToPythonException
 */
export class UsdError extends Error {
  /**
   * The Tf errors posted during the call, oldest first.
   *
   * @upstream TfErrorMark::GetBegin
   */
  readonly errors: readonly TfError[]

  /**
   * @param message - What failed.
   * @param options - The posted errors and the thrown cause.
   * @upstream none
   */
  constructor(message: string, options: { errors?: readonly TfError[]; cause?: unknown } = {}) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined)
    this.name = 'UsdError'
    this.errors = options.errors ?? []
  }
}

function takeErrors(mark: TfErrorMark): TfError[] {
  const errors = [...mark.getErrors()]
  mark.clear()
  return errors
}

function messageOf(what: string, errors: readonly TfError[], cause?: unknown): string {
  const detail = errors[0]?.getCommentary()
    ?? (cause instanceof Error ? cause.message : cause === undefined ? '' : String(cause))
  return detail ? `${what}: ${detail}` : `${what} failed`
}

/** Runs one core call under an error mark; throws UsdError when it throws or
 * posts errors. */
export function guard<T>(what: string, call: () => T): T {
  const mark = new TfErrorMark()
  try {
    let result: T
    try {
      result = call()
    } catch (cause) {
      const errors = takeErrors(mark)
      throw new UsdError(messageOf(what, errors, cause), { errors, cause })
    }
    const errors = takeErrors(mark)
    if (errors.length > 0) throw new UsdError(messageOf(what, errors), { errors })
    return result
  } finally {
    mark.dispose()
  }
}

/** guard() for an async core call. The mark stays open across the awaits,
 * so errors other async work posts meanwhile land in it too. */
export async function guardAsync<T>(what: string, call: () => Promise<T>): Promise<T> {
  const mark = new TfErrorMark()
  try {
    let result: T
    try {
      result = await call()
    } catch (cause) {
      const errors = takeErrors(mark)
      throw new UsdError(messageOf(what, errors, cause), { errors, cause })
    }
    const errors = takeErrors(mark)
    if (errors.length > 0) throw new UsdError(messageOf(what, errors), { errors })
    return result
  } finally {
    mark.dispose()
  }
}

/** The core's false/undefined failure result as a UsdError. */
export function ensure<T>(what: string, result: T | false | undefined): T {
  if (result === false || result === undefined) throw new UsdError(`${what} failed`)
  return result
}
