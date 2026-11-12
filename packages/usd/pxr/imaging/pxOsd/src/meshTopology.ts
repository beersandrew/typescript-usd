// Ported from OpenUSD 26.11.1: pxr/imaging/pxOsd/meshTopology.cpp,
//  pxr/imaging/pxOsd/meshTopology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/pxOsd/meshTopology.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - VtIntArray is a plain number array; ID (uint64_t) is a bigint.
// - The four constructors (meshTopology.cpp:31-90) are one overloaded
//   constructor; the fifth argument is either hole indices or subdiv tags.
// - ComputeHash hashes token text instead of the TfToken object bytes
//   (meshTopology.cpp:92-107 hashes `sizeof(TfToken)` bytes); the hash is only
//   an instancing key.
// - operator== / != are Equals(); operator<< is ToString().
// - _validated is a plain boolean (no std::atomic needed in JS).

import { Token as TfToken } from 'typescript-usd/tf'
import { PxOsdOpenSubdivTokens } from './tokens.ts'
import {
  PxOsdSubdivTags, PxOsd_ArraysEqual, PxOsd_HashInts, PxOsd_HashToken, PxOsd_StreamArray,
} from './subdivTags.ts'
import { PxOsdMeshTopologyValidation } from './meshTopologyValidation.ts'

/** meshTopology.h:22-246 */
export class PxOsdMeshTopology {
  private _scheme: TfToken
  private _orientation: TfToken
  private _faceVertexCounts: number[]
  private _faceVertexIndices: number[]
  private _holeIndices: number[]
  private _subdivTags: PxOsdSubdivTags
  // meshTopology.h:236-242: true once successfully validated; not hashed.
  private _validated = false

  /** meshTopology.cpp:22-29 */
  constructor()
  /** meshTopology.cpp:31-41 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[])
  /** meshTopology.cpp:43-54 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[],
    holeIndices: readonly number[])
  /** meshTopology.cpp:56-68 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[],
    holeIndices: readonly number[], subdivTags: PxOsdSubdivTags)
  /** meshTopology.cpp:70-81 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[],
    subdivTags: PxOsdSubdivTags)
  constructor(
    scheme: string = PxOsdOpenSubdivTokens.bilinear,
    orientation: string = PxOsdOpenSubdivTokens.rightHanded,
    faceVertexCounts: readonly number[] = [],
    faceVertexIndices: readonly number[] = [],
    holeIndicesOrTags?: readonly number[] | PxOsdSubdivTags,
    subdivTags?: PxOsdSubdivTags,
  ) {
    this._scheme = TfToken(scheme)
    this._orientation = TfToken(orientation)
    this._faceVertexCounts = [...faceVertexCounts]
    this._faceVertexIndices = [...faceVertexIndices]
    if (holeIndicesOrTags instanceof PxOsdSubdivTags) {
      this._holeIndices = []
      this._subdivTags = holeIndicesOrTags.copy()
    } else {
      this._holeIndices = holeIndicesOrTags ? [...holeIndicesOrTags] : []
      this._subdivTags = subdivTags ? subdivTags.copy() : new PxOsdSubdivTags()
    }
  }

  getScheme(): TfToken { return this._scheme }
  getFaceVertexCounts(): number[] { return this._faceVertexCounts }
  getFaceVertexIndices(): number[] { return this._faceVertexIndices }
  getOrientation(): TfToken { return this._orientation }
  getHoleIndices(): number[] { return this._holeIndices }
  getSubdivTags(): PxOsdSubdivTags { return this._subdivTags }

  /** meshTopology.h:150-155 */
  withScheme(scheme: string): PxOsdMeshTopology {
    return new PxOsdMeshTopology(scheme, this.getOrientation(),
      this.getFaceVertexCounts(), this.getFaceVertexIndices(),
      this.getHoleIndices(), this.getSubdivTags())
  }

  /** meshTopology.h:158-162 */
  withOrientation(orient: string): PxOsdMeshTopology {
    return new PxOsdMeshTopology(this.getScheme(), orient,
      this.getFaceVertexCounts(), this.getFaceVertexIndices(),
      this.getHoleIndices(), this.getSubdivTags())
  }

  /** meshTopology.h:165-169 */
  withSubdivTags(tags: PxOsdSubdivTags): PxOsdMeshTopology {
    return new PxOsdMeshTopology(this.getScheme(), this.getOrientation(),
      this.getFaceVertexCounts(), this.getFaceVertexIndices(),
      this.getHoleIndices(), tags)
  }

  /** meshTopology.h:172-176 */
  withHoleIndices(holeIndices: readonly number[]): PxOsdMeshTopology {
    return new PxOsdMeshTopology(this.getScheme(), this.getOrientation(),
      this.getFaceVertexCounts(), this.getFaceVertexIndices(),
      holeIndices, this.getSubdivTags())
  }

  /** meshTopology.cpp:92-107 */
  computeHash(): bigint {
    let hash = this._subdivTags.computeHash()
    hash = PxOsd_HashToken(this._scheme, hash)
    hash = PxOsd_HashToken(this._orientation, hash)
    hash = PxOsd_HashInts(this._faceVertexCounts, hash)
    hash = PxOsd_HashInts(this._faceVertexIndices, hash)
    hash = PxOsd_HashInts(this._holeIndices, hash)
    return hash
  }

  /** meshTopology.cpp:109-120 operator== */
  Equals(other: PxOsdMeshTopology): boolean {
    return this._scheme === other._scheme
      && this._orientation === other._orientation
      && PxOsd_ArraysEqual(this._faceVertexCounts, other._faceVertexCounts)
      && PxOsd_ArraysEqual(this._faceVertexIndices, other._faceVertexIndices)
      && this._subdivTags.Equals(other._subdivTags)
      && PxOsd_ArraysEqual(this._holeIndices, other._holeIndices)
  }

  /** meshTopology.cpp:122-133 */
  validate(): PxOsdMeshTopologyValidation {
    if (this._validated) {
      return new PxOsdMeshTopologyValidation()
    }
    const validation = new PxOsdMeshTopologyValidation(this)
    this._validated = validation.isValid()
    return validation
  }

  /** meshTopology.cpp:135-144 operator<< */
  ToString(): string {
    return `(${this.getOrientation()}, ${this.getScheme()}, (`
      + `${PxOsd_StreamArray(this.getFaceVertexCounts())}), (`
      + `${PxOsd_StreamArray(this.getFaceVertexIndices())}), (`
      + `${PxOsd_StreamArray(this.getHoleIndices())}))`
  }
}

/** meshTopology.cpp:146-149 */
export function PxOsdMeshTopologyNotEquals(lhs: PxOsdMeshTopology, rhs: PxOsdMeshTopology): boolean {
  return !lhs.Equals(rhs)
}
