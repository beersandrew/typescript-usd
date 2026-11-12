// Ported from OpenSubdiv 3.7.0: opensubdiv/sdc/types.h,
//  opensubdiv/sdc/typeTraits.cpp, opensubdiv/sdc/catmarkScheme.h,
//  opensubdiv/sdc/bilinearScheme.h, opensubdiv/sdc/loopScheme.h
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/sdc/types.h and the trait values defined in the per-scheme
// specializations (catmarkScheme.h / bilinearScheme.h / loopScheme.h), gathered
// by SchemeTypeTraits in typeTraits.cpp.

/** Enumerated type for all subdivision schemes supported by OpenSubdiv. */
export enum SchemeType {
  BILINEAR = 0,
  CATMARK = 1,
  LOOP = 2,
}

/** Enumerated type for all face splitting schemes. */
export enum Split {
  TO_QUADS = 0, // Used by Catmark and Bilinear
  TO_TRIS = 1, // Used by Loop
  HYBRID = 2, // Not currently used (potential future extension)
}

interface TraitsEntry {
  name: string
  splitType: Split
  regularFaceSize: number
  regularVertexValence: number
  localNeighborhood: number
}

// staticTraitsTable in typeTraits.cpp, indexed by SchemeType. The values come
// from each Scheme<>::GetRegularFaceSize() etc. specialization.
const STATIC_TRAITS_TABLE: readonly TraitsEntry[] = [
  { name: 'bilinear', splitType: Split.TO_QUADS, regularFaceSize: 4, regularVertexValence: 4, localNeighborhood: 0 },
  { name: 'catmark', splitType: Split.TO_QUADS, regularFaceSize: 4, regularVertexValence: 4, localNeighborhood: 1 },
  { name: 'loop', splitType: Split.TO_TRIS, regularFaceSize: 3, regularVertexValence: 6, localNeighborhood: 1 },
]

function entry(schemeType: SchemeType): TraitsEntry {
  const e = STATIC_TRAITS_TABLE[schemeType]
  if (e === undefined) throw new Error(`SchemeTypeTraits: unknown scheme ${schemeType}`)
  return e
}

/**
 * Traits associated with the types of all subdivision schemes, parameterized by
 * the scheme type. Mirrors Sdc::SchemeTypeTraits.
 */
export const SchemeTypeTraits = {
  getType(schemeType: SchemeType): SchemeType {
    return schemeType
  },
  getTopologicalSplitType(schemeType: SchemeType): Split {
    return entry(schemeType).splitType
  },
  getRegularFaceSize(schemeType: SchemeType): number {
    return entry(schemeType).regularFaceSize
  },
  getRegularVertexValence(schemeType: SchemeType): number {
    return entry(schemeType).regularVertexValence
  },
  getLocalNeighborhoodSize(schemeType: SchemeType): number {
    return entry(schemeType).localNeighborhood
  },
  getName(schemeType: SchemeType): string {
    return entry(schemeType).name
  },
} as const
