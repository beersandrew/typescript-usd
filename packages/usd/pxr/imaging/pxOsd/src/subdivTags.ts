// Ported from OpenUSD 26.11.1: pxr/imaging/pxOsd/subdivTags.cpp,
//  pxr/imaging/pxOsd/subdivTags.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/pxOsd/subdivTags.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - VtIntArray / VtFloatArray are plain number arrays.
// - ComputeHash hashes the token text rather than the TfToken object bytes
//   (subdivTags.cpp:19-48 hashes `sizeof(TfToken)` bytes, i.e. the interned
//   pointer, which is not reproducible). The hash is only an instancing key.
// - operator<< is ToString(); operator== / != are Equals() / the
//   PxOsdSubdivTagsEquals free function.

import { Token as TfToken } from 'typescript-usd/tf'
import { ArchHash64 } from 'typescript-usd/arch'

const _encoder = new TextEncoder()

// Hash helpers shared by meshTopology.ts: ArchHash64 over the bytes the
// upstream code passes (ints as int32, floats as float32).
export function PxOsd_HashInts(values: readonly number[], seed: bigint): bigint {
  const bytes = new Uint8Array(Int32Array.from(values).buffer)
  return ArchHash64(bytes, bytes.length, seed)
}
export function PxOsd_HashFloats(values: readonly number[], seed: bigint): bigint {
  const bytes = new Uint8Array(Float32Array.from(values).buffer)
  return ArchHash64(bytes, bytes.length, seed)
}
export function PxOsd_HashToken(token: string, seed: bigint): bigint {
  const bytes = _encoder.encode(token)
  return ArchHash64(bytes, bytes.length, seed)
}

// vt/streamOut.cpp:73-96 rank-1 array output.
export function PxOsd_StreamArray(values: readonly number[]): string {
  return `[${values.join(', ')}]`
}

export function PxOsd_ArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return _ArraysEqual(a, b)
}

function _ArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false
  return true
}

/** subdivTags.h:20-185 */
export class PxOsdSubdivTags {
  // subdivTags.h:167-177: note if you add members, update ComputeHash.
  private _vtxInterpolationRule: TfToken
  private _fvarInterpolationRule: TfToken
  private _creaseMethod: TfToken
  private _trianglesSubdivision: TfToken
  private _creaseIndices: number[]
  private _creaseLengths: number[]
  private _creaseWeights: number[]
  private _cornerIndices: number[]
  private _cornerWeights: number[]

  constructor()
  constructor(
    vertexInterpolationRule: string,
    faceVaryingInterpolationRule: string,
    creaseMethod: string,
    triangleSubdivision: string,
    creaseIndices: readonly number[],
    creaseLengths: readonly number[],
    creaseWeights: readonly number[],
    cornerIndices: readonly number[],
    cornerWeights: readonly number[])
  constructor(
    vertexInterpolationRule = '',
    faceVaryingInterpolationRule = '',
    creaseMethod = '',
    triangleSubdivision = '',
    creaseIndices: readonly number[] = [],
    creaseLengths: readonly number[] = [],
    creaseWeights: readonly number[] = [],
    cornerIndices: readonly number[] = [],
    cornerWeights: readonly number[] = [],
  ) {
    this._vtxInterpolationRule = TfToken(vertexInterpolationRule)
    this._fvarInterpolationRule = TfToken(faceVaryingInterpolationRule)
    this._creaseMethod = TfToken(creaseMethod)
    this._trianglesSubdivision = TfToken(triangleSubdivision)
    this._creaseIndices = [...creaseIndices]
    this._creaseLengths = [...creaseLengths]
    this._creaseWeights = [...creaseWeights]
    this._cornerIndices = [...cornerIndices]
    this._cornerWeights = [...cornerWeights]
  }

  /** Copy (the defaulted copy constructor, subdivTags.h:25). */
  copy(): PxOsdSubdivTags {
    return new PxOsdSubdivTags(
      this._vtxInterpolationRule, this._fvarInterpolationRule,
      this._creaseMethod, this._trianglesSubdivision,
      this._creaseIndices, this._creaseLengths, this._creaseWeights,
      this._cornerIndices, this._cornerWeights)
  }

  getVertexInterpolationRule(): TfToken { return this._vtxInterpolationRule }
  setVertexInterpolationRule(vtxInterp: string): void { this._vtxInterpolationRule = TfToken(vtxInterp) }
  getFaceVaryingInterpolationRule(): TfToken { return this._fvarInterpolationRule }
  setFaceVaryingInterpolationRule(fvarInterp: string): void { this._fvarInterpolationRule = TfToken(fvarInterp) }
  getCreaseMethod(): TfToken { return this._creaseMethod }
  setCreaseMethod(creaseMethod: string): void { this._creaseMethod = TfToken(creaseMethod) }
  getTriangleSubdivision(): TfToken { return this._trianglesSubdivision }
  setTriangleSubdivision(triangleSubdivision: string): void {
    this._trianglesSubdivision = TfToken(triangleSubdivision)
  }

  getCreaseIndices(): number[] { return this._creaseIndices }
  setCreaseIndices(creaseIndices: readonly number[]): void { this._creaseIndices = [...creaseIndices] }
  getCreaseLengths(): number[] { return this._creaseLengths }
  setCreaseLengths(creaseLengths: readonly number[]): void { this._creaseLengths = [...creaseLengths] }
  getCreaseWeights(): number[] { return this._creaseWeights }
  setCreaseWeights(creaseWeights: readonly number[]): void { this._creaseWeights = [...creaseWeights] }

  getCornerIndices(): number[] { return this._cornerIndices }
  setCornerIndices(cornerIndices: readonly number[]): void { this._cornerIndices = [...cornerIndices] }
  getCornerWeights(): number[] { return this._cornerWeights }
  setCornerWeights(cornerWeights: readonly number[]): void { this._cornerWeights = [...cornerWeights] }

  /** subdivTags.cpp:16-49 */
  computeHash(): bigint {
    let hash = 0n
    hash = PxOsd_HashToken(this._vtxInterpolationRule, hash)
    hash = PxOsd_HashToken(this._fvarInterpolationRule, hash)
    hash = PxOsd_HashToken(this._creaseMethod, hash)
    hash = PxOsd_HashToken(this._trianglesSubdivision, hash)
    hash = PxOsd_HashInts(this._cornerIndices, hash)
    hash = PxOsd_HashFloats(this._cornerWeights, hash)
    hash = PxOsd_HashInts(this._creaseIndices, hash)
    hash = PxOsd_HashInts(this._creaseLengths, hash)
    hash = PxOsd_HashFloats(this._creaseWeights, hash)
    return hash
  }

  /** subdivTags.cpp:65-77 operator== */
  Equals(rhs: PxOsdSubdivTags): boolean {
    return this.getVertexInterpolationRule() === rhs.getVertexInterpolationRule()
      && this.getFaceVaryingInterpolationRule() === rhs.getFaceVaryingInterpolationRule()
      && this.getCreaseMethod() === rhs.getCreaseMethod()
      && this.getTriangleSubdivision() === rhs.getTriangleSubdivision()
      && _ArraysEqual(this.getCreaseIndices(), rhs.getCreaseIndices())
      && _ArraysEqual(this.getCreaseLengths(), rhs.getCreaseLengths())
      && _ArraysEqual(this.getCreaseWeights(), rhs.getCreaseWeights())
      && _ArraysEqual(this.getCornerIndices(), rhs.getCornerIndices())
      && _ArraysEqual(this.getCornerWeights(), rhs.getCornerWeights())
  }

  /** subdivTags.cpp:51-63 operator<< (VtArrays stream as `[a, b]`,
   * vt/streamOut.cpp:73-96). */
  ToString(): string {
    return `(${this.getVertexInterpolationRule()}, `
      + `${this.getFaceVaryingInterpolationRule()}, `
      + `${this.getCreaseMethod()}, `
      + `${this.getTriangleSubdivision()}, (`
      + `${PxOsd_StreamArray(this.getCreaseIndices())}), (`
      + `${PxOsd_StreamArray(this.getCreaseLengths())}), (`
      + `${PxOsd_StreamArray(this.getCreaseWeights())}), (`
      + `${PxOsd_StreamArray(this.getCornerIndices())}), (`
      + `${PxOsd_StreamArray(this.getCornerWeights())}))`
  }
}

/** subdivTags.cpp:65-77 */
export function PxOsdSubdivTagsEquals(lhs: PxOsdSubdivTags, rhs: PxOsdSubdivTags): boolean {
  return lhs.Equals(rhs)
}
