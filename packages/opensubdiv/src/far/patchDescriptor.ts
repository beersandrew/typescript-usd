// Ported from OpenSubdiv 3.6.1: opensubdiv/far/patchDescriptor.h,
//  opensubdiv/far/patchDescriptor.cpp
// Copyright 2013 Pixar. Copyright 2014 DreamWorks Animation LLC. Modified
//  Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/patchDescriptor.h:44-182 and
// patchDescriptor.cpp:46-86 -- Far::PatchDescriptor. Local source addition
// (see PROVENANCE.md).

import { SchemeType } from '../sdc/types.ts'

// patchDescriptor.h:48-64
export enum PatchType {
  NON_PATCH = 0,
  POINTS,
  LINES,
  QUADS,
  TRIANGLES,
  LOOP,
  REGULAR,
  GREGORY,
  GREGORY_BOUNDARY,
  GREGORY_BASIS,
  GREGORY_TRIANGLE,
}

export class PatchDescriptor {
  /** The Type enum (PatchDescriptor::Type) as a static member, as in C++. */
  static readonly Type = PatchType
  static readonly NON_PATCH = PatchType.NON_PATCH
  static readonly POINTS = PatchType.POINTS
  static readonly LINES = PatchType.LINES
  static readonly QUADS = PatchType.QUADS
  static readonly TRIANGLES = PatchType.TRIANGLES
  static readonly LOOP = PatchType.LOOP
  static readonly REGULAR = PatchType.REGULAR
  static readonly GREGORY = PatchType.GREGORY
  static readonly GREGORY_BOUNDARY = PatchType.GREGORY_BOUNDARY
  static readonly GREGORY_BASIS = PatchType.GREGORY_BASIS
  static readonly GREGORY_TRIANGLE = PatchType.GREGORY_TRIANGLE

  _type: PatchType

  // patchDescriptor.h:68-78
  constructor(type: PatchType | PatchDescriptor = PatchType.NON_PATCH) {
    this._type = type instanceof PatchDescriptor ? type.getType() : type
  }

  // patchDescriptor.h:87-89
  getType(): PatchType {
    return this._type
  }

  // patchDescriptor.h:92-99
  static isAdaptive(type: PatchType): boolean {
    return type > PatchType.TRIANGLES
  }
  isAdaptive(): boolean {
    return PatchDescriptor.isAdaptive(this.getType())
  }

  // patchDescriptor.h:148-163
  static getNumControlVertices(type: PatchType): number {
    switch (type) {
      case PatchType.REGULAR:
        return PatchDescriptor.getRegularPatchSize()
      case PatchType.LOOP:
        return 12
      case PatchType.QUADS:
        return 4
      case PatchType.GREGORY:
      case PatchType.GREGORY_BOUNDARY:
        return PatchDescriptor.getGregoryPatchSize()
      case PatchType.GREGORY_BASIS:
        return PatchDescriptor.getGregoryBasisPatchSize()
      case PatchType.GREGORY_TRIANGLE:
        return 18
      case PatchType.TRIANGLES:
        return 3
      case PatchType.LINES:
        return 2
      case PatchType.POINTS:
        return 1
      default:
        return -1
    }
  }

  // patchDescriptor.h:166-170
  static getNumFVarControlVertices(type: PatchType): number {
    return PatchDescriptor.getNumControlVertices(type)
  }

  // patchDescriptor.h:110-117
  getNumControlVertices(): number {
    return PatchDescriptor.getNumControlVertices(this.getType())
  }
  getNumFVarControlVertices(): number {
    return PatchDescriptor.getNumFVarControlVertices(this.getType())
  }

  // patchDescriptor.h:120-126
  static getRegularPatchSize(): number {
    return 16
  }
  static getGregoryPatchSize(): number {
    return 4
  }
  static getGregoryBasisPatchSize(): number {
    return 20
  }

  // patchDescriptor.cpp:46-74
  static getAdaptivePatchDescriptors(type: SchemeType): PatchDescriptor[] {
    switch (type) {
      case SchemeType.BILINEAR:
        return []
      case SchemeType.CATMARK:
        return [
          new PatchDescriptor(PatchType.REGULAR),
          new PatchDescriptor(PatchType.GREGORY),
          new PatchDescriptor(PatchType.GREGORY_BOUNDARY),
          new PatchDescriptor(PatchType.GREGORY_BASIS),
        ]
      case SchemeType.LOOP:
        return [new PatchDescriptor(PatchType.LOOP), new PatchDescriptor(PatchType.GREGORY_TRIANGLE)]
    }
  }

  // patchDescriptor.h:173-182
  lessThan(other: PatchDescriptor): boolean {
    return this._type < other._type
  }
  equals(other: PatchDescriptor): boolean {
    return this._type === other._type
  }

  // patchDescriptor.cpp:76-86
  print(): string {
    const types = [
      'NON_PATCH',
      'POINTS',
      'LINES',
      'QUADS',
      'TRIANGLES',
      'LOOP',
      'REGULAR',
      'GREGORY',
      'GREGORY_BOUNDARY',
      'GREGORY_BASIS',
      'GREGORY_TRIANGLE',
    ]
    return `    type ${types[this._type]}\n`
  }
}
