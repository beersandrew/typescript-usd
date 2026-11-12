// Ported from OpenSubdiv 3.6.1: opensubdiv/far/types.h
// Copyright 2014 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/types.h:41-53 -- the Far index
// typedefs inherited from Vtr. Local source addition (see PROVENANCE.md).

export {
  type Index,
  type LocalIndex,
  type IndexArray,
  type LocalIndexArray,
  type ConstIndexArray,
  type ConstLocalIndexArray,
  IndexIsValid,
  INDEX_INVALID,
  VALENCE_LIMIT,
} from '../vtr/types.ts'

// DIVERGENCE: the C++ tables and factories are templates over REAL (float or
// double; e.g. StencilTableReal<REAL>, far/stencilTable.h:62). JavaScript
// computes in double, so the REAL parameter becomes a runtime tag and
// float-instantiated code rounds through Math.fround wherever the C++ stores
// a REAL (each stored weight and each accumulated sum). Intermediate
// expressions are evaluated in double, so float results can differ from the
// native build in the last few bits.
export type Real = 'float' | 'double'

const identity = (x: number): number => x

/** The store-rounding function for values of the given precision. */
export function realRound(real: Real): (x: number) => number {
  return real === 'float' ? Math.fround : identity
}
