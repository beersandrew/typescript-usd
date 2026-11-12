// far — Feature Adaptive Representation: public API.
// Mirrors opensubdiv/far/.
//
// M1: uniform Catmull-Clark refinement. TopologyDescriptor -> factory ->
// TopologyRefiner.RefineUniform -> TopologyLevel readout + PrimvarRefiner.
// Adaptive refinement, stencil/patch tables, and limit-surface evaluation are
// later milestones.

export {
  type TopologyDescriptor,
  type FVarChannel,
  type NormalizedCreases,
  normalizeCreases,
} from './topologyDescriptor.ts'
export {
  TopologyRefinerFactory,
  type CreateOptions,
  CreateTopologyRefiner,
  TopologyRefinerFactoryAccess,
  TopologyRefinerFactoryOptions,
  TopologyError,
  type TopologyRefinerFactorySpecialization,
} from './topologyRefinerFactory.ts'
export {
  ErrorType,
  FarError,
  FarWarning,
  SetErrorCallback,
  SetWarningCallback,
  type ErrorCallbackFunc,
  type WarningCallbackFunc,
} from './error.ts'
export { TopologyRefiner, type UniformOptions } from './topologyRefiner.ts'
export { TopologyLevel } from './topologyLevel.ts'
export { PrimvarRefiner } from './primvarRefiner.ts'

// Far stencil and patch tables: local source additions ported from
// OpenSubdiv 3.6.1 (see PROVENANCE.md).
export { AdaptiveOptions } from './topologyRefiner.ts'
export { type Real, realRound, INDEX_INVALID, IndexIsValid, type Index } from './types.ts'
export {
  PrimvarRefinerReal,
  FlatPrimvarBuffer,
  FlatPrimvarElement,
  type Primvar,
  type PrimvarBuffer,
} from './primvarRefinerReal.ts'
export { StencilReal, StencilTableReal, LimitStencilReal, LimitStencilTableReal } from './stencilTable.ts'
export { StencilBuilder, StencilBuilderIndex } from './stencilBuilder.ts'
export {
  StencilTableFactory,
  StencilTableFactoryReal,
  StencilTableFactoryOptions,
  LimitStencilTableFactory,
  LimitStencilTableFactoryReal,
  LimitStencilTableFactoryOptions,
  StencilInterpolationMode,
  type LocationArray,
} from './stencilTableFactory.ts'
export { PatchDescriptor, PatchType } from './patchDescriptor.ts'
export { PatchParam } from './patchParam.ts'
export {
  EvaluatePatchBasis,
  EvaluatePatchBasisNormalized,
  EvalBasisLinear,
  EvalBasisLinearTri,
  EvalBasisBSpline,
  EvalBasisBezier,
  EvalBasisGregory,
  EvalBasisBoxSplineTri,
  EvalBasisBezierTri,
  EvalBasisGregoryTri,
  type BasisWeights,
} from './patchBasis.ts'
export { PatchTable, PatchHandle, PatchArray, FVarPatchChannel } from './patchTable.ts'
export { PatchMap } from './patchMap.ts'
export { PtexIndices } from './ptexIndices.ts'
export { PatchBuilder, PatchBuilderOptions, BasisType, type SingleCreaseInfo } from './patchBuilder.ts'
export { CatmarkPatchBuilder } from './catmarkPatchBuilder.ts'
export { LoopPatchBuilder } from './loopPatchBuilder.ts'
export { BilinearPatchBuilder } from './bilinearPatchBuilder.ts'
export { PatchTableFactory, PatchTableFactoryOptions, PatchFaceTag, EndCapType } from './patchTableFactory.ts'
