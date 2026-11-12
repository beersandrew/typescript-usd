// vtr — Vectorized Topology Representation: levels + refinement (internal).
// Mirrors opensubdiv/vtr/.

export {
  type Index,
  type LocalIndex,
  type IndexArray,
  type ConstIndexArray,
  type LocalIndexArray,
  type ConstLocalIndexArray,
  INDEX_INVALID,
  IndexIsValid,
  VALENCE_LIMIT,
} from './types.ts'
export { Level, VTag, ETag, FTag, VSpan } from './level.ts'
export { Refinement } from './refinement.ts'
export { QuadRefinement } from './quadRefinement.ts'
export { FVarLevel, FVarETag, FVarValueTag, CreaseEndPair } from './fvarLevel.ts'
export { FVarRefinement } from './fvarRefinement.ts'
export { TriRefinement } from './triRefinement.ts'
