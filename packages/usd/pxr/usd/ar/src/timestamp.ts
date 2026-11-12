// Ported from OpenUSD 26.11.1: pxr/usd/ar/timestamp.cpp,
//  pxr/usd/ar/timestamp.h, pxr/usd/ar/wrapTimestamp.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArTimestamp (OpenUSD 26.11.1 pxr/usd/ar/timestamp.h:22-132, timestamp.cpp,
// wrapTimestamp.cpp:20-34): seconds since an arbitrary epoch; NaN (the
// default) marks an invalid timestamp.
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError, Hash as TfHash } from 'typescript-usd/tf'

export class ArTimestamp {
  readonly #time: number

  // timestamp.h:30-41. `undefined` is the default constructor.
  constructor(time?: number) { this.#time = time === undefined ? NaN : time }

  // timestamp.h:44-48.
  isValid(): boolean { return !Number.isNaN(this.#time) }

  // timestamp.h:52-59: a coding error (timestamp.cpp:14-18), then NaN.
  getTime(): number {
    if (!this.isValid()) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        'Cannot call GetTime on an invalid ArTimestamp', TfDiagnosticType.CodingError))
    }
    return this.#time
  }

  // timestamp.h:65-100: invalid timestamps compare equal to each other and
  // less than every valid timestamp.
  equals(rhs: ArTimestamp): boolean {
    return (!this.isValid() && !rhs.isValid()) ||
      (this.isValid() && rhs.isValid() && this.#time === rhs.#time)
  }
  notEquals(rhs: ArTimestamp): boolean { return !this.equals(rhs) }
  lessThan(rhs: ArTimestamp): boolean {
    return (!this.isValid() && rhs.isValid()) ||
      (this.isValid() && rhs.isValid() && this.#time < rhs.#time)
  }
  greaterThanOrEqual(rhs: ArTimestamp): boolean { return !this.lessThan(rhs) }
  lessThanOrEqual(rhs: ArTimestamp): boolean {
    return !this.isValid() || (rhs.isValid() && this.#time <= rhs.#time)
  }
  greaterThan(rhs: ArTimestamp): boolean { return !this.lessThanOrEqual(rhs) }

  // TfHashAppend (timestamp.h:107-112).
  hash(): bigint { return TfHash(this.#time) }

  // wrapTimestamp.cpp:26-33 (TfPyRepr of a double prints a trailing ".0"
  // for integral values).
  repr(): string {
    if (!this.isValid()) return 'Ar.Timestamp()'
    const t = this.#time
    return `Ar.Timestamp(${Number.isInteger(t) ? t.toFixed(1) : String(t)})`
  }
  toString(): string { return this.repr() }
}
