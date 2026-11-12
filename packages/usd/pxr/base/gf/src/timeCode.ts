// Ported from OpenUSD 26.11.1: pxr/base/gf/timeCode.cpp,
//  pxr/base/gf/timeCode.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/base/gf/timeCode.h:28-157.
import { GfDuration } from './duration.ts'

export class GfTimeCode {
  readonly #time: number

  // GfTimeCode(double) and the explicit GfTimeCode(GfDuration)
  // (timeCode.h:39-48).
  constructor(time: number | GfTimeCode | GfDuration = 0) {
    this.#time = time instanceof GfTimeCode ? time.#time : Number(time)
  }

  GetValue(): number { return this.#time }
  valueOf(): number { return this.#time }
  toString(): string { return String(this.#time) }
  repr(): string { return `Gf.TimeCode(${this.#time})` }
  equals(rhs: number | GfTimeCode): boolean { return this.#time === Number(rhs) }
  compare(rhs: number | GfTimeCode): number {
    const value = Number(rhs)
    return this.#time < value ? -1 : this.#time > value ? 1 : 0
  }
  // operator+ with a time code, a duration or a double (timeCode.h:93-122).
  add(rhs: number | GfTimeCode | GfDuration): GfTimeCode {
    return new GfTimeCode(this.#time + Number(rhs))
  }
  // The offset between two time codes is a GfDuration (timeCode.h:98-100);
  // a duration or double offsets the time code (timeCode.h:124-137).
  subtract(rhs: GfTimeCode): GfDuration
  subtract(rhs: number | GfDuration): GfTimeCode
  subtract(rhs: number | GfTimeCode | GfDuration): GfTimeCode | GfDuration {
    return rhs instanceof GfTimeCode
      ? new GfDuration(this.#time - rhs.#time)
      : new GfTimeCode(this.#time - Number(rhs))
  }
  // Scaling by a double (timeCode.h:70-77).
  multiply(rhs: number): GfTimeCode {
    return new GfTimeCode(this.#time * rhs)
  }
  // The ratio of two time codes is a double; dividing by a double scales
  // (timeCode.h:78-87).
  divide(rhs: GfTimeCode): number
  divide(rhs: number): GfTimeCode
  divide(rhs: number | GfTimeCode): GfTimeCode | number {
    return rhs instanceof GfTimeCode
      ? this.#time / rhs.#time
      : new GfTimeCode(this.#time / rhs)
  }
  getNegated(): GfTimeCode { return new GfTimeCode(-this.#time) }
}
