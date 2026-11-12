// Ported from OpenUSD 26.11.1: pxr/base/tf/token.cpp, pxr/base/tf/token.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfToken — faithful port of OpenUSD pxr/base/tf/token.{h,cpp}.
//
// A token is an interned, immutable string whose IDENTITY IS ITS STRING VALUE.
// In token.h the rep is `_Rep { ... std::string _str; ... }` — the string is
// the identity; the rep pointer and `_compareCode` (uint64) are perf caches,
// NOT an integer id. So in TS we model a token as a BRANDED string:
//
//   - runtime representation is the string itself, so `===` is value equality
//     (matching TfToken::operator== — interning just makes that a pointer
//     compare in C++), `<` is lexicographic (matching TfToken::operator<), and
//     a token interoperates directly with every string-keyed boundary it must
//     cross: USDA text and the Sdf crate token table,
//     schema/property names, data-source keys.
//   - the brand restores the NOMINAL type boundary C++ gets from TfToken being
//     a distinct type: a bare `string` will not satisfy `TfToken`, so callers
//     must cross via `TfToken(s)` — mirroring the explicit C++ constructor
//     `explicit TfToken(std::string const&)`.
//
// refcount-immortality, O(1) pointer-equality, and the `_compareCode` sort
// fast-path to JS value semantics. All unobservable — `==`, `!=`, `<`, `>`,
// IsEmpty, and hashing-by-value match upstream; only the C++ perf profile is
// dropped (WEB-SUB). Grade: idiomatic.

declare const __tfToken: unique symbol

/** An interned, immutable string identified by its value. @see token.h */
export type TfToken = string & { readonly [__tfToken]: true }

/**
 * Construct a token from a string (default: the empty token).
 * Mirrors `explicit TfToken(std::string const&)` — the explicit crossing from
 * `string` into the `TfToken` type.
 */
export function TfToken(s: string = ''): TfToken {
  return s as TfToken
}

export namespace TfToken {
  /** The empty token (`TfToken()` / `""`). Mirrors a default-constructed token. */
  export const Empty: TfToken = '' as TfToken

  /** True iff this is the empty token. Mirrors `TfToken::IsEmpty()`. */
  export function IsEmpty(t: TfToken): boolean {
    return t.length === 0
  }
}

/**
 * Define a named set of tokens — the idiomatic analog of tf/staticTokens.h's
 * `TF_DEFINE_*_TOKENS` macros (e.g. `TF_DEFINE_PUBLIC_TOKENS(HdTokens, ...)`),
 * which declare a struct whose members are `TfToken`s. Brands every value of a
 * string-literal table as a `TfToken` while preserving the keys, so
 * `Set.member` is typed `TfToken`:
 *
 *   export const HdTokens = TfMakeTokens({ mesh: 'mesh', points: 'points' })
 *   HdTokens.mesh  // TfToken
 */
export function TfMakeTokens<T extends Record<string, string>>(
  tokens: T,
): { readonly [K in keyof T]: TfToken } & { readonly allTokens: readonly TfToken[] } {
  const holder = tokens as unknown as {
    [K in keyof T]: TfToken
  } & { readonly allTokens: readonly TfToken[] }
  // staticTokens.cpp:32-39 exposes declaration-order `allTokens` on every
  // generated holder. Keep it non-enumerable so JS object iteration does not
  // mistake the aggregate for a named token.
  Object.defineProperty(holder, 'allTokens', {
    value: Object.values(tokens).map(TfToken),
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return holder
}

/** Convert strings to tokens. Mirrors `TfToToken Vector` (TfToTokenVector). */
export function TfToTokenVector(strings: readonly string[]): TfToken[] {
  return strings.map((s) => TfToken(s))
}

/** Convert tokens to plain strings. Mirrors `TfToStringVector`. */
export function TfToStringVector(tokens: readonly TfToken[]): string[] {
  return tokens.map((t) => t as string)
}
