// Ported from OpenUSD 26.11.1: pxr/base/trace/staticKeyData.cpp,
//  pxr/base/trace/staticKeyData.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/staticKeyData.h:26.
export class TraceStaticKeyData {
  readonly #functionName: string | undefined
  readonly #prettyFunctionName: string | undefined
  readonly #name: string | undefined

  constructor(name: string)
  constructor(functionName: string, prettyFunctionName: string, name?: string)
  constructor(first: string, second?: string, third?: string) {
    if (second === undefined) {
      this.#functionName = undefined
      this.#prettyFunctionName = undefined
      this.#name = first
    } else {
      this.#functionName = first
      this.#prettyFunctionName = second
      this.#name = third
    }
  }

  GetString(): string {
    if (!this.#functionName) return this.#name ?? ''
    return this.#name ? `${this.#functionName} (${this.#name})` : this.#functionName
  }

  Equals(other: TraceStaticKeyData): boolean {
    return this.GetString() === other.GetString() &&
      this.#prettyFunctionName === other.#prettyFunctionName
  }
}
