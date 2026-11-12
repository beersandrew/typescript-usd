// Test equality for Vt arrays and Gf vectors, as OpenUSD's Python tests
// compare them: a Vt array equals a sequence with equal elements
// (`Vt.IntArray([1, 2]) == [1, 2]`) and a Gf vector equals a sequence with
// equal components (`Gf.Vec3f(1, 2, 3) == (1, 2, 3)`). Matrices and
// quaternions do not compare equal to sequences in Python, so they don't here.
// Two Vt arrays are equal when their element types and elements are.
import { expect } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { _VecBase as GfVec } from 'typescript-usd/gf'

type Equals = (a: unknown, b: unknown, testers: unknown[]) => boolean

function vtGfEquals(this: { equals: Equals }, a: unknown, b: unknown, testers: unknown[]): boolean | undefined {
  if (a instanceof VtArray && b instanceof VtArray) {
    return a.getElementType() === b.getElementType() && this.equals(a.toArray(), b.toArray(), testers)
  }
  if (a instanceof VtArray && Array.isArray(b)) return this.equals(a.toArray(), b, testers)
  if (b instanceof VtArray && Array.isArray(a)) return this.equals(a, b.toArray(), testers)
  if (a instanceof GfVec && Array.isArray(b)) return this.equals([...a.data], b, testers)
  if (b instanceof GfVec && Array.isArray(a)) return this.equals(a, [...b.data], testers)
  return undefined
}

expect.addEqualityTesters([vtGfEquals as never])
