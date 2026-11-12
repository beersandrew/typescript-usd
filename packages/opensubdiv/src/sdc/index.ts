// sdc — Subdivision Core: scheme rules, crease, options.
// Mirrors opensubdiv/sdc/.

export { SchemeType, Split, SchemeTypeTraits } from './types.ts'
export {
  Options,
  VtxBoundaryInterpolation,
  FVarLinearInterpolation,
  CreasingMethod,
  TriangleSubdivision,
} from './options.ts'
export {
  Crease,
  Rule,
  SHARPNESS_SMOOTH,
  SHARPNESS_INFINITE,
  IsSmooth,
  IsSharp,
  IsInfinite,
  IsSemiSharp,
} from './crease.ts'
export {
  Scheme,
  Mask,
  type IMask,
  type FaceNeighborhood,
  type EdgeNeighborhood,
  type VertexNeighborhood,
} from './scheme.ts'
export { CatmarkScheme } from './catmarkScheme.ts'
export { LoopScheme } from './loopScheme.ts'
export { BilinearScheme } from './bilinearScheme.ts'
