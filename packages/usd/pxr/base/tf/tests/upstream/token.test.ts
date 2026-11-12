// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/token.cpp,
//  pxr/base/tf/testenv/staticTokens.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/base/tf/testenv/token.cpp (TfToken) and
// staticTokens.cpp (TfStaticTokens).
//
// Adaptation notes (branded-string TfToken — see src/token.ts):
//   - `t1 == t2` / `t1 != t2`        -> value equality (toBe / not.toBe)
//   - `t == ""` / `"" == t` (both    -> a token IS a string at runtime, so
//     directions, token<->string)       string/token comparisons are native
//   - `.Hash()` equality             -> subsumed by value equality (equal
//                                         tokens are the same value); the
//                                         hash-collision asserts are dropped as
//                                         C++ hashing mechanics, not behavior
//   - `.Swap()` / `std::swap`        -> tokens are immutable values; the swap
//                                         asserts become plain reassignment
//   - `<` / `>`                      -> native lexicographic order
import { describe, it, expect } from 'vitest'
import { Token as TfToken, MakeTokens as TfMakeTokens, ToTokenVector as TfToTokenVector, ToStringVector as TfToStringVector } from '../../src/index.ts'

describe('TfToken', () => {
  it('empty tokens, equality, and string comparison', () => {
    const empty1 = TfToken()
    const empty2 = TfToken()
    const nonEmpty3 = TfToken('nonEmpty')
    const sEmpty1 = ''

    expect(empty1).toBe(empty2)
    expect(empty1).not.toBe(nonEmpty3)
    expect(empty1 === '' && empty2 === '').toBe(true)
    // token <-> string, both directions
    expect(sEmpty1 === empty1 && sEmpty1 === empty2).toBe(true)
    expect(empty1 === sEmpty1 && empty2 === sEmpty1).toBe(true)
    expect(sEmpty1).not.toBe(nonEmpty3)
    expect(nonEmpty3).not.toBe(sEmpty1)
    expect('' === empty1).toBe(true)
    expect('' !== nonEmpty3).toBe(true)
    expect(TfToken.IsEmpty(empty1)).toBe(true)
    expect(TfToken.IsEmpty(nonEmpty3)).toBe(false)
  })

  it('reassignment (C++ Swap is immutable-value reassignment here)', () => {
    let empty1 = TfToken()
    let nonEmpty3 = TfToken('nonEmpty')

    // empty1.Swap(nonEmpty3)
    ;[empty1, nonEmpty3] = [nonEmpty3, empty1]
    expect(TfToken.IsEmpty(nonEmpty3)).toBe(true)
    expect(TfToken.IsEmpty(empty1)).toBe(false)
    expect(empty1).toBe(TfToken('nonEmpty'))
    expect(nonEmpty3).toBe(TfToken(''))

    // std::swap(nonEmpty3, empty1)
    ;[nonEmpty3, empty1] = [empty1, nonEmpty3]
    expect(TfToken.IsEmpty(empty1)).toBe(true)
    expect(TfToken.IsEmpty(nonEmpty3)).toBe(false)
    expect(empty1).toBe(TfToken(''))
    expect(nonEmpty3).toBe(TfToken('nonEmpty'))
  })

  it('interning identity and lexicographic ordering', () => {
    const a = 'alphabet'
    const b = 'barnacle'
    const c = 'cinnamon'

    expect(TfToken(a) < TfToken(b)).toBe(true)

    // Equal strings produce equal (interned) tokens.
    expect(TfToken(a)).toBe(TfToken(a))
    expect(TfToken(b)).toBe(TfToken(b))
    expect(TfToken(c)).toBe(TfToken(c))

    expect(TfToken(a)).not.toBe(TfToken(b))
    expect(TfToken(a)).not.toBe(TfToken(c))
    expect(TfToken(b)).not.toBe(TfToken(c))

    expect(TfToken(b) > TfToken(a)).toBe(true)
  })

  it('copy construct and assignment (value semantics)', () => {
    const a = 'alphabet'
    const b = 'barnacle'

    let t1 = TfToken(a)
    const t2 = t1 // copy
    expect(t1).toBe(t2)

    t1 = TfToken(b)
    expect(t1).not.toBe(t2)

    let t2b = TfToken(b)
    expect(t1).toBe(t2b)
    expect(t1).toBe(TfToken('barnacle'))
    expect(t2b).toBe(t1)
  })

  it('TfMakeTokens defines a named token set (staticTokens.h analog)', () => {
    const Set = TfMakeTokens({ mesh: 'mesh', points: 'points' })
    // members are tokens equal to the corresponding constructed tokens
    expect(Set.mesh).toBe(TfToken('mesh'))
    expect(Set.points).toBe(TfToken('points'))
    // and usable directly as their string value (token IS a string)
    expect(Set.mesh).toBe('mesh')
    expect(Set.allTokens).toEqual([TfToken('mesh'), TfToken('points')])
    expect(Object.keys(Set)).toEqual(['mesh', 'points'])
  })

  it('TfToTokenVector / TfToStringVector round-trip', () => {
    const strVec = ['string1', 'string2', 'string3']
    const tokVec = TfToTokenVector(strVec)

    expect(TfToken(strVec[0]!)).toBe(tokVec[0])
    expect(TfToken(strVec[1]!)).toBe(tokVec[1])
    expect(TfToken(strVec[2]!)).toBe(tokVec[2])

    const strVec2 = TfToStringVector(tokVec)
    expect(TfToken(strVec2[0]!)).toBe(tokVec[0])
    expect(TfToken(strVec2[1]!)).toBe(tokVec[1])
    expect(TfToken(strVec2[2]!)).toBe(tokVec[2])
  })
})
