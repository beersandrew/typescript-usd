export {
  TsKnot, TsKnot as Knot, TsKnotMap, TsKnotMap as KnotMap,
  TsTypedKnot, TsDoubleKnot, TsFloatKnot, TsHalfKnot, TsTimeCodeKnot,
  type TsKnotOptions,
} from './knot.ts'
export {
  TsSpline, TsSpline as Spline, TsAntiRegressionAuthoringSelector,
  TsAntiRegressionAuthoringSelector as AntiRegressionAuthoringSelector,
  TsEditBehaviorBlock, TsEditBehaviorBlock as EditBehaviorBlock,
  Ts_SplineOffsetAccess, Ts_GetSplineData, Ts_GetTypedSplineData,
  type TsCanBreakdownResult,
} from './spline.ts'
export {
  Ts_Eval, Ts_EvalAspect, Ts_EvalAtTime, Ts_EvalDerivative, Ts_EvalHeldValue,
  Ts_EvalLocation, Ts_EvalPost, Ts_EvalPre, Ts_EvalValue, Ts_Breakdown,
  type Ts_BreakdownOut,
} from './eval.ts'
export { Ts_Sample, Ts_Bake, Ts_Truncate, Ts_SampleData, type Ts_SampleDataInterface } from './sample.ts'
export {
  Ts_SegmentIterator, Ts_SegmentKnotIterator, Ts_SegmentLoopIterator,
  Ts_SegmentPrototypeIterator,
} from './iterator.ts'
export {
  TsInterpMode, TsInterpMode as InterpMode,
  TsInterpValueBlock, TsInterpValueBlock as InterpValueBlock,
  TsInterpHeld, TsInterpHeld as InterpHeld,
  TsInterpLinear, TsInterpLinear as InterpLinear,
  TsInterpCurve, TsInterpCurve as InterpCurve,
  TsCurveType, TsCurveType as CurveType,
  TsCurveTypeBezier, TsCurveTypeBezier as CurveTypeBezier,
  TsCurveTypeHermite, TsCurveTypeHermite as CurveTypeHermite,
  TsExtrapMode, TsExtrapMode as ExtrapMode,
  TsExtrapValueBlock, TsExtrapValueBlock as ExtrapValueBlock,
  TsExtrapHeld, TsExtrapHeld as ExtrapHeld,
  TsExtrapLinear, TsExtrapLinear as ExtrapLinear,
  TsExtrapSloped, TsExtrapSloped as ExtrapSloped,
  TsExtrapLoopRepeat, TsExtrapLoopRepeat as ExtrapLoopRepeat,
  TsExtrapLoopReset, TsExtrapLoopReset as ExtrapLoopReset,
  TsExtrapLoopOscillate, TsExtrapLoopOscillate as ExtrapLoopOscillate,
  TsExtrapolation, TsExtrapolation as Extrapolation,
  TsLoopParams, TsLoopParams as LoopParams,
  TsTangentAlgorithm, TsTangentAlgorithm as TangentAlgorithm,
  TsTangentAlgorithmNone, TsTangentAlgorithmNone as TangentAlgorithmNone,
  TsTangentAlgorithmCustom, TsTangentAlgorithmCustom as TangentAlgorithmCustom,
  TsTangentAlgorithmAutoEase, TsTangentAlgorithmAutoEase as TangentAlgorithmAutoEase,
  TsSplineSampleSource, TsSplineSampleSource as SplineSampleSource,
  TsSourcePreExtrap, TsSourcePreExtrap as SourcePreExtrap,
  TsSourcePreExtrapLoop, TsSourcePreExtrapLoop as SourcePreExtrapLoop,
  TsSourceInnerLoopPreEcho, TsSourceInnerLoopPreEcho as SourceInnerLoopPreEcho,
  TsSourceInnerLoopProto, TsSourceInnerLoopProto as SourceInnerLoopProto,
  TsSourceInnerLoopPostEcho, TsSourceInnerLoopPostEcho as SourceInnerLoopPostEcho,
  TsSourceKnotInterp, TsSourceKnotInterp as SourceKnotInterp,
  TsSourcePostExtrap, TsSourcePostExtrap as SourcePostExtrap,
  TsSourcePostExtrapLoop, TsSourcePostExtrapLoop as SourcePostExtrapLoop,
  TsSplineSamples, TsSplineSamples as SplineSamples,
  TsSplineSamplesWithSources, TsSplineSamplesWithSources as SplineSamplesWithSources,
  TsAntiRegressionMode, TsAntiRegressionMode as AntiRegressionMode,
  TsAntiRegressionNone, TsAntiRegressionNone as AntiRegressionNone,
  TsAntiRegressionContain, TsAntiRegressionContain as AntiRegressionContain,
  TsAntiRegressionKeepRatio, TsAntiRegressionKeepRatio as AntiRegressionKeepRatio,
  TsAntiRegressionKeepStart, TsAntiRegressionKeepStart as AntiRegressionKeepStart,
  TsDispatchToValueTypeTemplate, TsDispatchToStorageValueTypeTemplate,
  Ts_IsFinite, type TsTime,
} from './types.ts'
export {
  TsConvertToStandardTangent, TsConvertToStandardTangent as ConvertToStandardTangent,
  TsConvertFromStandardTangent, TsConvertFromStandardTangent as ConvertFromStandardTangent,
  Ts_ConvertToStandardHelper, Ts_ConvertFromStandardHelper,
} from './tangentConversions.ts'
export {
  TsRegressionPreventer, TsRegressionPreventer as RegressionPreventer,
  TsRegressionPreventerSetResult, TsRegressionPreventerInteractiveMode,
  Ts_RegressionPreventerBatchAccess,
} from './regressionPreventer.ts'
export { Ts_Segment, Ts_SegmentInterp, type Ts_Vec2 } from './segment.ts'
export {
  Ts_KnotData, Ts_TypedKnotData, Ts_KnotDataProxy, Ts_TypedKnotDataProxy,
  Ts_KnotDataFromKnot, Ts_KnotFromKnotData,
} from './knotData.ts'
export { Ts_SplineData, Ts_TypedSplineData } from './splineData.ts'
export { Ts_GetType, Ts_GetTypeFromTypeName, Ts_GetTypeNameFromType, type Ts_StorageType } from './typeHelpers.ts'
export { Ts_BinaryDataAccess } from './binary.ts'
export * from './tsTest_Museum.ts'
export * from './tsTest_SampleBezier.ts'
export * from './tsTest_SampleTimes.ts'
export * from './tsTest_TsEvaluator.ts'
export * from './tsTest_Types.ts'
export * from './TsTest_Grapher.ts'
export * from './TsTest_Comparator.ts'
export * from './TsTest_Baseliner.ts'

/** Namespace-shaped compatibility object matching `from pxr import Ts`. */
export const Ts = Object.freeze({ name: 'Ts' })
