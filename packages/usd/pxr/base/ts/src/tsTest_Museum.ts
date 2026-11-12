// Ported from OpenUSD 26.11.1: pxr/base/ts/tsTest_Museum.cpp,
//  pxr/base/ts/tsTest_Museum.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { GfHalf, GfSqrt } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { TsKnot } from './knot.ts'
import { Ts_TypedKnotData } from './knotData.ts'
import { TsAntiRegressionAuthoringSelector, TsSpline } from './spline.ts'
import { Ts_SplineData } from './splineData.ts'
import {
  TsAntiRegressionMode, TsCurveType, TsExtrapMode, TsExtrapolation, TsInterpMode,
  TsLoopParams, TsTangentAlgorithm,
} from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/tsTest_Museum.h and
// tsTest_Museum.cpp. The builder bodies are translated statement for
// statement from tsTest_Museum.cpp:95-1487.

// tsTest_Museum.h:24-109.
export enum TsTest_MuseumDataId {
  TwoKnotBezier,
  TwoKnotBezierAutoEase,
  TwoKnotHermite,
  TwoKnotLinear,
  FourKnotBezier,
  FourKnotHermite,
  SimpleInnerLoop,
  InnerLoop2and2,
  InnerLoopPre,
  InnerLoopPost,
  ExtrapLoopRepeat,
  ExtrapLoopRepeatDualValued,
  ExtrapLoopRepeatBoundary,
  ExtrapLoopRepeatDualValuedBoundary,
  ExtrapLoopReset,
  ExtrapLoopResetDualValued,
  ExtrapLoopResetBoundary,
  ExtrapLoopResetInvalidBoundary,
  ExtrapLoopOscillate,
  ExtrapLoopOscillateBoundary,
  InnerAndExtrapLoops,
  RegressiveLoop,
  RegressiveS,
  RegressiveSStandard,
  RegressiveSPreOut,
  RegressiveSPostOut,
  RegressiveSBothOut,
  RegressivePreJ,
  RegressivePostJ,
  RegressivePreC,
  RegressivePostC,
  RegressivePreG,
  RegressivePostG,
  RegressivePreFringe,
  RegressivePostFringe,
  BoldS,
  Cusp,
  CenterVertical,
  NearCenterVertical,
  VerticalTorture,
  FourThirdOneThird,
  OneThirdFourThird,
  StartVert,
  EndVert,
  FringeVert,
  MarginalN,
  ZeroTans,
  ComplexParams,
}

// tsTest_Museum.cpp:44-93: TF_ADD_ENUM_NAME registration order, which is the
// order TfEnum::GetAllNames reports.
const _allNames: readonly string[] = [
  'TwoKnotBezier',
  'TwoKnotBezierAutoEase',
  'TwoKnotHermite',
  'TwoKnotLinear',
  'FourKnotBezier',
  'FourKnotHermite',
  'SimpleInnerLoop',
  'InnerLoop2and2',
  'InnerLoopPre',
  'InnerLoopPost',
  'ExtrapLoopRepeat',
  'ExtrapLoopRepeatDualValued',
  'ExtrapLoopRepeatDualValuedBoundary',
  'ExtrapLoopRepeatBoundary',
  'ExtrapLoopReset',
  'ExtrapLoopResetDualValued',
  'ExtrapLoopResetBoundary',
  'ExtrapLoopResetInvalidBoundary',
  'ExtrapLoopOscillate',
  'ExtrapLoopOscillateBoundary',
  'InnerAndExtrapLoops',
  'RegressiveLoop',
  'RegressiveS',
  'RegressiveSStandard',
  'RegressiveSPreOut',
  'RegressiveSPostOut',
  'RegressiveSBothOut',
  'RegressivePreJ',
  'RegressivePostJ',
  'RegressivePreC',
  'RegressivePostC',
  'RegressivePreG',
  'RegressivePostG',
  'RegressivePreFringe',
  'RegressivePostFringe',
  'BoldS',
  'Cusp',
  'CenterVertical',
  'NearCenterVertical',
  'VerticalTorture',
  'FourThirdOneThird',
  'OneThirdFourThird',
  'StartVert',
  'EndVert',
  'FringeVert',
  'MarginalN',
  'ZeroTans',
  'ComplexParams',
]

function copyExtrap(e: TsExtrapolation): TsExtrapolation {
  return new TsExtrapolation(e.mode, e.slope, e.loopBoundaryTime)
}
function copyLoop(p: TsLoopParams): TsLoopParams {
  return new TsLoopParams(p.protoStart, p.protoEnd, p.numPreLoops, p.numPostLoops, p.valueOffset)
}

// tsTest_Museum.cpp:25-37.
function MakeHalf(v: number): number {
  const halfMin = 6.103515625e-05
  const halfMax = 65504
  if (v === 0) {
    return 0
  } else if (Math.abs(v) < halfMin) {
    v = v < 0 ? -halfMin : halfMin
  } else if (Math.abs(v) > halfMax) {
    v = v < 0 ? -halfMax : halfMax
  }
  return new GfHalf(v).GetValue()
}

// tsTest_Museum.cpp:95
function _TwoKnotBezier(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 1.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 1.0
  knot1.postTanSlope = 1.0
  knot1.postTanWidth = 0.5

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 5.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 2.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:117
function _TwoKnotBezierAutoEase(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 1.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 1.0
  knot1.postTanAlgorithm = TsTangentAlgorithm.AutoEase

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 5.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 2.0
  knot2.preTanAlgorithm = TsTangentAlgorithm.AutoEase

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:140
function _TwoKnotHermite(): Ts_SplineData {
  // Same as TwoKnotBezier but with Hermite interpolation
  const data = _TwoKnotBezier()
  data.curveType = TsCurveType.Hermite
  return data
}

// tsTest_Museum.cpp:148
function _TwoKnotLinear(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 1.0
  knot1.nextInterp = TsInterpMode.Linear
  knot1.value = 1.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 5.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 2.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:166
function _FourKnotBezier(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 1.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 1.0
  knot1.postTanSlope = -0.25
  knot1.postTanWidth = 0.25

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 2.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 2.0
  knot2.preTanSlope = 0.25
  knot2.preTanWidth = 0.25
  knot2.postTanSlope = 0.25
  knot2.postTanWidth = 0.25

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 3.0
  knot3.nextInterp = TsInterpMode.Curve
  knot3.value = 1.0
  knot3.preTanSlope = -0.25
  knot3.preTanWidth = 0.25
  knot3.postTanSlope = -0.25
  knot3.postTanWidth = 0.25

  const knot4 = new Ts_TypedKnotData()
  knot4.time = 4.0
  knot4.nextInterp = TsInterpMode.Curve
  knot4.value = 2.0
  knot4.preTanSlope = 0.25
  knot4.preTanWidth = 0.25

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  data.setKnot(knot4)
  return data
}

// tsTest_Museum.cpp:208
function _FourKnotHermite(): Ts_SplineData {
  // Same as FourKnotBezier but with Hermite interpolation
  const data = _FourKnotBezier()
  data.curveType = TsCurveType.Hermite
  return data
}

// tsTest_Museum.cpp:216
function _SimpleInnerLoop(): Ts_SplineData {
  // proto len: 18
  // pre-loop len: 18 (1 iteration)
  // post-loop len: 18 (1 iteration)

  // pre-unlooped: 112
  // pre-shadowed: none
  // pre-echo: 119 (from 137), 127 (from 145)
  // proto: 137, 145
  // post-echo: 155 (from 137), 163 (from 145)
  // final echo: 173 (from 137)
  // post-shadowed: 155
  // post-unlooped: 181

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 112.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 8.8
  knot1.postTanSlope = 15.0
  knot1.postTanWidth = 0.9

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 137.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 0.0
  knot2.preTanSlope = -5.3
  knot2.postTanSlope = -5.3
  knot2.preTanWidth = 1.3
  knot2.postTanWidth = 1.8

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 145.0
  knot3.nextInterp = TsInterpMode.Curve
  knot3.value = 8.5
  knot3.preTanSlope = 12.5
  knot3.postTanSlope = 12.5
  knot3.preTanWidth = 1.0
  knot3.postTanWidth = 1.2

  const knot4 = new Ts_TypedKnotData()
  knot4.time = 155.0
  knot4.nextInterp = TsInterpMode.Curve
  knot4.value = 20.2
  knot4.preTanSlope = -15.7
  knot4.postTanSlope = -15.7
  knot4.preTanWidth = 0.7
  knot4.postTanWidth = 0.8

  const knot5 = new Ts_TypedKnotData()
  knot5.time = 181.0
  knot5.nextInterp = TsInterpMode.Curve
  knot5.value = 38.2
  knot5.preTanSlope = -9.0
  knot5.preTanWidth = 2.0

  const lp = new TsLoopParams()
  lp.protoStart = 137.0
  lp.protoEnd = 155.0
  lp.numPreLoops = 1
  lp.numPostLoops = 1
  lp.valueOffset = 20.2

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  data.setKnot(knot4)
  data.setKnot(knot5)
  data.loopParams = copyLoop(lp)
  return data
}

// tsTest_Museum.cpp:289
function _InnerLoop2and2(): Ts_SplineData {
  // proto len: 10
  // pre-loop len: 20 (2 iterations)
  // post-loop len: 20 (2 iterations)

  // pre-unlooped: none
  // pre-shadowed: none
  // pre-echo:
  //   80 (from 100), 85 (from 105)
  //   90 (from 100), 95 (from 105)
  // proto: 100, 105
  // post-echo:
  //   110 (from 100), 115 (from 105)
  //   120 (from 100), 125 (from 105)
  // final echo: 130 (from 100)
  // post-shadowed: none
  // post-unlooped: none

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 20.0
  knot1.preTanSlope = 2.0
  knot1.postTanSlope = 2.0
  knot1.preTanWidth = 2.0
  knot1.postTanWidth = 2.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 10.0
  knot2.preTanSlope = 1.5
  knot2.postTanSlope = 1.5
  knot2.preTanWidth = 2.5
  knot2.postTanWidth = 2.5

  const lp = new TsLoopParams()
  lp.protoStart = 100.0
  lp.protoEnd = 110.0
  lp.numPreLoops = 2
  lp.numPostLoops = 2
  lp.valueOffset = -5.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.loopParams = copyLoop(lp)
  return data
}

// tsTest_Museum.cpp:340
function _InnerLoopPre(): Ts_SplineData {
  // proto len: 10
  // pre-loop len: 20 (2 iterations)
  // post-loop len: 0 (0 iterations)

  // pre-unlooped: 70
  // pre-shadowed: 85
  // pre-echo:
  //   80 (from 100), 85 (from 105)
  //   90 (from 100), 95 (from 105)
  // proto: 100, 105
  // post-echo: none
  // final echo: 110 (from 100)
  // post-shadowed: none
  // post-unlooped: 120

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 70.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 8.8
  knot1.postTanSlope = -1.0
  knot1.postTanWidth = 2.2

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 85.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 35.0
  knot2.preTanSlope = -5.3
  knot2.postTanSlope = -5.3
  knot2.preTanWidth = 1.3
  knot2.postTanWidth = 1.8

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 100.0
  knot3.nextInterp = TsInterpMode.Curve
  knot3.value = 20.0
  knot3.preTanSlope = 2.0
  knot3.postTanSlope = 2.0
  knot3.preTanWidth = 2.0
  knot3.postTanWidth = 2.0

  const knot4 = new Ts_TypedKnotData()
  knot4.time = 105.0
  knot4.nextInterp = TsInterpMode.Curve
  knot4.value = 10.0
  knot4.preTanSlope = 1.5
  knot4.postTanSlope = 1.5
  knot4.preTanWidth = 2.5
  knot4.postTanWidth = 2.5

  const knot5 = new Ts_TypedKnotData()
  knot5.time = 120.0
  knot5.nextInterp = TsInterpMode.Curve
  knot5.value = 15.0
  knot5.preTanSlope = -4.0
  knot5.preTanWidth = 3.0

  const lp = new TsLoopParams()
  lp.protoStart = 100.0
  lp.protoEnd = 110.0
  lp.numPreLoops = 2
  lp.numPostLoops = 0
  lp.valueOffset = -5.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  data.setKnot(knot4)
  data.setKnot(knot5)
  data.loopParams = copyLoop(lp)
  return data
}

// tsTest_Museum.cpp:415
function _InnerLoopPost(): Ts_SplineData {
  // proto len: 10
  // pre-loop len: 0 (0 iterations)
  // post-loop len: 20 (2 iterations)

  // pre-unlooped: 90
  // pre-shadowed: none
  // pre-echo: none
  // proto: 100, 105
  // post-echo:
  //   110 (from 100), 115 (from 105)
  //   120 (from 100), 125 (from 105)
  // final echo: 130 (from 100)
  // post-shadowed: 125
  // post-unlooped: 140

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 90.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 8.8
  knot1.postTanSlope = -1.0
  knot1.postTanWidth = 2.2

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 100.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 20.0
  knot2.preTanSlope = 2.0
  knot2.postTanSlope = 2.0
  knot2.preTanWidth = 2.0
  knot2.postTanWidth = 2.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 105.0
  knot3.nextInterp = TsInterpMode.Curve
  knot3.value = 10.0
  knot3.preTanSlope = 1.5
  knot3.postTanSlope = 1.5
  knot3.preTanWidth = 2.5
  knot3.postTanWidth = 2.5

  const knot4 = new Ts_TypedKnotData()
  knot4.time = 125.0
  knot4.nextInterp = TsInterpMode.Curve
  knot4.value = 35.0
  knot4.preTanSlope = -5.3
  knot4.postTanSlope = -5.3
  knot4.preTanWidth = 1.3
  knot4.postTanWidth = 1.8

  const knot5 = new Ts_TypedKnotData()
  knot5.time = 140.0
  knot5.nextInterp = TsInterpMode.Curve
  knot5.value = 15.0
  knot5.preTanSlope = -4.0
  knot5.preTanWidth = 3.0

  const lp = new TsLoopParams()
  lp.protoStart = 100.0
  lp.protoEnd = 110.0
  lp.numPreLoops = 0
  lp.numPostLoops = 2
  lp.valueOffset = -5.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  data.setKnot(knot4)
  data.setKnot(knot5)
  data.loopParams = copyLoop(lp)
  return data
}

// tsTest_Museum.cpp:490
function _ExtrapLoopRepeat(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:521
function _ExtrapLoopRepeatDualValued(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.preValue = -10.0
  knot1.dualValued = true
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:554
function _ExtrapLoopRepeatBoundary(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  extrap.loopBoundaryTime = 105.0
  data.preExtrapolation = copyExtrap(extrap)

  extrap.loopBoundaryTime = 100.0
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:588
function _ExtrapLoopRepeatDualValuedBoundary(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.preValue = -10.0
  knot1.dualValued = true
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0
  knot3.preValue = 25.0
  knot3.dualValued = true

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  extrap.loopBoundaryTime = 110.0
  data.preExtrapolation = copyExtrap(extrap)

  extrap.loopBoundaryTime = 105.0
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:626
function _ExtrapLoopReset(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopReset)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:657
function _ExtrapLoopResetDualValued(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 20.0
  knot3.dualValued = true
  knot3.preValue = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopReset)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:690
function _ExtrapLoopResetBoundary(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopReset)
  extrap.loopBoundaryTime = 105.0
  data.preExtrapolation = copyExtrap(extrap)

  extrap.loopBoundaryTime = 105.0
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:724
function _ExtrapLoopResetInvalidBoundary(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopReset)
  extrap.loopBoundaryTime = 99.0
  data.preExtrapolation = copyExtrap(extrap)

  extrap.loopBoundaryTime = 107.0
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:758
function _ExtrapLoopOscillate(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopOscillate)
  data.preExtrapolation = copyExtrap(extrap)
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:789
function _ExtrapLoopOscillateBoundary(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 10.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Linear
  knot2.value = 20.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 110.0
  knot3.nextInterp = TsInterpMode.Held
  knot3.value = 15.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopOscillate)
  extrap.loopBoundaryTime = 105.0
  data.preExtrapolation = copyExtrap(extrap)

  extrap.loopBoundaryTime = 110.0
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:823
function _InnerAndExtrapLoops(): Ts_SplineData {
  // Same knots and inner loop params as InnerLoop2and2

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 100.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 20.0
  knot1.preTanSlope = 2.0
  knot1.postTanSlope = 2.0
  knot1.preTanWidth = 2.0
  knot1.postTanWidth = 2.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 105.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 10.0
  knot2.preTanSlope = 1.5
  knot2.postTanSlope = 1.5
  knot2.preTanWidth = 2.5
  knot2.postTanWidth = 2.5

  const lp = new TsLoopParams()
  lp.protoStart = 100.0
  lp.protoEnd = 110.0
  lp.numPreLoops = 2
  lp.numPostLoops = 2
  lp.valueOffset = -5.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  data.loopParams = copyLoop(lp)
  const extrap = new TsExtrapolation(TsExtrapMode.LoopRepeat)
  data.preExtrapolation = copyExtrap(extrap)
  extrap.mode = TsExtrapMode.LoopOscillate
  data.postExtrapolation = copyExtrap(extrap)
  return data
}

// tsTest_Museum.cpp:863
function _RegressiveLoop(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 156.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.preTanSlope = -1.3
  knot1.postTanSlope = -1.3
  knot1.preTanWidth = 6.2
  knot1.postTanWidth = 15.8

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 167.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 28.8
  knot2.preTanSlope = 2.4
  knot2.postTanSlope = 2.4
  knot2.preTanWidth = 21.7
  knot2.postTanWidth = 5.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:889
function _RegressiveS(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 156.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = -1.3
  knot1.postTanWidth = 15.8

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 167.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 28.8
  knot2.preTanSlope = 0.4
  knot2.preTanWidth = 16.8

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:911
function _RegressiveSStandard(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.2

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.2

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:933
function _RegressiveSPreOut(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.5
  knot1.postTanWidth = 1.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 3.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:955
function _RegressiveSPostOut(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.5
  knot2.preTanWidth = 1.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:977
function _RegressiveSBothOut(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 4.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 4.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:999
function _RegressivePreJ(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 2.5

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.6
  knot2.preTanWidth = 2.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1021
function _RegressivePostJ(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.6
  knot1.postTanWidth = 2.5

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 2.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1043
function _RegressivePreC(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 0.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 2.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1065
function _RegressivePostC(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 2.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1087
function _RegressivePreG(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 2.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.57
  knot2.preTanWidth = 3.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1109
function _RegressivePostG(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.57
  knot1.postTanWidth = 3.5

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 2.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1131
function _RegressivePreFringe(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 0.05

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.3

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1153
function _RegressivePostFringe(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.3

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.05

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1175
function _BoldS(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.25

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.5

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1197
function _Cusp(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.5
  knot1.postTanWidth = 1.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 0.0
  knot2.preTanSlope = -0.5
  knot2.preTanWidth = 1.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1219
function _CenterVertical(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1241
function _NearCenterVertical(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 0.8

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.8

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1263
function _VerticalTorture(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.5
  knot1.postTanWidth = 0.44092698519760592513

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.3227809555928178309

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1285
function _FourThirdOneThird(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 4.0 / 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.0 / 3.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1307
function _OneThirdFourThird(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.0 / 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 4.0 / 3.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1329
function _StartVert(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 0.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 1.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1351
function _EndVert(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 1.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1373
function _FringeVert(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = (2.0 + GfSqrt(3.0)) / 3.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = (2.0 - GfSqrt(3.0)) / 3.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1395
function _MarginalN(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 1e12
  knot1.postTanWidth = 5e-12

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 1e12
  knot2.preTanWidth = 5e-12

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1417
function _ZeroTans(): Ts_SplineData {
  const knot1 = new Ts_TypedKnotData()
  knot1.time = 0.0
  knot1.nextInterp = TsInterpMode.Curve
  knot1.value = 0.0
  knot1.postTanSlope = 0.0
  knot1.postTanWidth = 0.0

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 1.0
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 1.0
  knot2.preTanSlope = 0.0
  knot2.preTanWidth = 0.0

  const data = new Ts_SplineData()
  data.setKnot(knot1)
  data.setKnot(knot2)
  return data
}

// tsTest_Museum.cpp:1439
function _ComplexParams(): Ts_SplineData {
  const data = new Ts_SplineData()

  data.preExtrapolation = new TsExtrapolation(TsExtrapMode.Linear)
  const postExtrap = new TsExtrapolation(TsExtrapMode.Sloped)
  postExtrap.slope = 0.57
  data.postExtrapolation = copyExtrap(postExtrap)

  // Note: These params were never used in the original
  // implementation of _ComplexParams, so continue to omit
  // them. Enable them as desired.
  // TsInnerLoopParams lp;
  // lp.protoStart = 15;
  // lp.protoEnd = 25;
  // lp.numPreLoops = 1;
  // lp.numPostLoops = 2;
  // lp.valueOffset = 11.7;
  // data.loopParams = lp;

  const knot1 = new Ts_TypedKnotData()
  knot1.time = 7
  knot1.nextInterp = TsInterpMode.Held
  knot1.dualValued = true
  knot1.preValue = 5.5
  knot1.value = 7.21

  const knot2 = new Ts_TypedKnotData()
  knot2.time = 15
  knot2.nextInterp = TsInterpMode.Curve
  knot2.value = 8.18
  knot2.postTanSlope = 1.17
  knot2.postTanWidth = 2.49

  const knot3 = new Ts_TypedKnotData()
  knot3.time = 20
  knot3.nextInterp = TsInterpMode.Curve
  knot3.value = 14.72
  knot3.preTanSlope = -1.4
  knot3.preTanWidth = 3.77
  knot3.postTanSlope = -1.4
  knot3.postTanWidth = 1.1

  data.setKnot(knot1)
  data.setKnot(knot2)
  data.setKnot(knot3)

  return data
}


// tsTest_Museum.cpp:1489-1543.
function _GetData(id: TsTest_MuseumDataId): Ts_SplineData {
  switch (id) {
    case TsTest_MuseumDataId.TwoKnotBezier: return _TwoKnotBezier()
    case TsTest_MuseumDataId.TwoKnotBezierAutoEase: return _TwoKnotBezierAutoEase()
    case TsTest_MuseumDataId.TwoKnotHermite: return _TwoKnotHermite()
    case TsTest_MuseumDataId.TwoKnotLinear: return _TwoKnotLinear()
    case TsTest_MuseumDataId.FourKnotBezier: return _FourKnotBezier()
    case TsTest_MuseumDataId.FourKnotHermite: return _FourKnotHermite()
    case TsTest_MuseumDataId.SimpleInnerLoop: return _SimpleInnerLoop()
    case TsTest_MuseumDataId.InnerLoop2and2: return _InnerLoop2and2()
    case TsTest_MuseumDataId.InnerLoopPre: return _InnerLoopPre()
    case TsTest_MuseumDataId.InnerLoopPost: return _InnerLoopPost()
    case TsTest_MuseumDataId.ExtrapLoopRepeat: return _ExtrapLoopRepeat()
    case TsTest_MuseumDataId.ExtrapLoopRepeatDualValued: return _ExtrapLoopRepeatDualValued()
    case TsTest_MuseumDataId.ExtrapLoopRepeatBoundary: return _ExtrapLoopRepeatBoundary()
    case TsTest_MuseumDataId.ExtrapLoopRepeatDualValuedBoundary: return _ExtrapLoopRepeatDualValuedBoundary()
    case TsTest_MuseumDataId.ExtrapLoopReset: return _ExtrapLoopReset()
    case TsTest_MuseumDataId.ExtrapLoopResetDualValued: return _ExtrapLoopResetDualValued()
    case TsTest_MuseumDataId.ExtrapLoopResetBoundary: return _ExtrapLoopResetBoundary()
    case TsTest_MuseumDataId.ExtrapLoopResetInvalidBoundary: return _ExtrapLoopResetInvalidBoundary()
    case TsTest_MuseumDataId.ExtrapLoopOscillate: return _ExtrapLoopOscillate()
    case TsTest_MuseumDataId.ExtrapLoopOscillateBoundary: return _ExtrapLoopOscillateBoundary()
    case TsTest_MuseumDataId.InnerAndExtrapLoops: return _InnerAndExtrapLoops()
    case TsTest_MuseumDataId.RegressiveLoop: return _RegressiveLoop()
    case TsTest_MuseumDataId.RegressiveS: return _RegressiveS()
    case TsTest_MuseumDataId.RegressiveSStandard: return _RegressiveSStandard()
    case TsTest_MuseumDataId.RegressiveSPreOut: return _RegressiveSPreOut()
    case TsTest_MuseumDataId.RegressiveSPostOut: return _RegressiveSPostOut()
    case TsTest_MuseumDataId.RegressiveSBothOut: return _RegressiveSBothOut()
    case TsTest_MuseumDataId.RegressivePreJ: return _RegressivePreJ()
    case TsTest_MuseumDataId.RegressivePostJ: return _RegressivePostJ()
    case TsTest_MuseumDataId.RegressivePreC: return _RegressivePreC()
    case TsTest_MuseumDataId.RegressivePostC: return _RegressivePostC()
    case TsTest_MuseumDataId.RegressivePreG: return _RegressivePreG()
    case TsTest_MuseumDataId.RegressivePostG: return _RegressivePostG()
    case TsTest_MuseumDataId.RegressivePreFringe: return _RegressivePreFringe()
    case TsTest_MuseumDataId.RegressivePostFringe: return _RegressivePostFringe()
    case TsTest_MuseumDataId.BoldS: return _BoldS()
    case TsTest_MuseumDataId.Cusp: return _Cusp()
    case TsTest_MuseumDataId.CenterVertical: return _CenterVertical()
    case TsTest_MuseumDataId.NearCenterVertical: return _NearCenterVertical()
    case TsTest_MuseumDataId.VerticalTorture: return _VerticalTorture()
    case TsTest_MuseumDataId.FourThirdOneThird: return _FourThirdOneThird()
    case TsTest_MuseumDataId.OneThirdFourThird: return _OneThirdFourThird()
    case TsTest_MuseumDataId.StartVert: return _StartVert()
    case TsTest_MuseumDataId.EndVert: return _EndVert()
    case TsTest_MuseumDataId.FringeVert: return _FringeVert()
    case TsTest_MuseumDataId.MarginalN: return _MarginalN()
    case TsTest_MuseumDataId.ZeroTans: return _ZeroTans()
    case TsTest_MuseumDataId.ComplexParams: return _ComplexParams()
  }
  return new Ts_SplineData()
}

export class TsTest_Museum {
  static readonly DataId = TsTest_MuseumDataId

  // tsTest_Museum.cpp:1545-1636.
  static _splineDataToSpline(data: Ts_SplineData, valueType: TfType): TsSpline {
    if (!TsSpline.isSupportedValueType(valueType)) {
      return new TsSpline()
    }

    const spline = new TsSpline(valueType)
    spline.setCurveType(data.curveType)
    spline.setPreExtrapolation(data.preExtrapolation)
    spline.setPostExtrapolation(data.postExtrapolation)
    spline.setInnerLoopParams(data.loopParams)

    // Don't de-regress.  If the SplineData is regressive, the Spline should be
    // too.
    const selector = new TsAntiRegressionAuthoringSelector(TsAntiRegressionMode.None)
    try {
      const typeName = valueType.getTypeName()
      for (const knotData of data.knots) {
        const knot = new TsKnot(valueType)
        knot.SetTime(knotData.time)
        knot.setPreTanWidth(knotData.preTanWidth)
        knot.setPostTanWidth(knotData.postTanWidth)
        knot.setNextInterpolation(knotData.nextInterp)
        knot.setPreTanAlgorithm(knotData.preTanAlgorithm)
        knot.setPostTanAlgorithm(knotData.postTanAlgorithm)

        if (typeName === 'double') {
          knot.setValue(knotData.value)
          if (knotData.dualValued) {
            knot.setPreValue(knotData.preValue)
          }
          knot.setPreTanSlope(knotData.preTanSlope)
          knot.setPostTanSlope(knotData.postTanSlope)
        } else if (typeName === 'float') {
          knot.setValue(Math.fround(knotData.value))
          if (knotData.dualValued) {
            knot.setPreValue(Math.fround(knotData.preValue))
          }
          knot.setPreTanSlope(Math.fround(knotData.preTanSlope))
          knot.setPostTanSlope(Math.fround(knotData.postTanSlope))
        } else if (typeName === 'GfHalf') {
          knot.setValue(MakeHalf(knotData.value))
          if (knotData.dualValued) {
            knot.setPreValue(MakeHalf(knotData.preValue))
          }
          const preHeight = knotData.preTanSlope * knotData.preTanWidth
          const preTanSlope = MakeHalf(knotData.preTanSlope)
          const preWidth = preTanSlope === 0 ? knotData.preTanWidth : preHeight / preTanSlope
          knot.setPreTanSlope(preTanSlope)
          knot.setPreTanWidth(preWidth)

          const postHeight = knotData.postTanSlope * knotData.postTanWidth
          const postTanSlope = MakeHalf(knotData.postTanSlope)
          const postWidth = postTanSlope === 0 ? knotData.postTanWidth : postHeight / postTanSlope
          knot.setPostTanSlope(postTanSlope)
          knot.setPostTanWidth(postWidth)
        } else {
          return new TsSpline(valueType)
        }

        spline.setKnot(knot)
      }
    } finally {
      selector.close()
    }

    return spline
  }

  // tsTest_Museum.cpp:1639-1645.
  static getSpline(id: TsTest_MuseumDataId, valueType: TfType | string = 'double'): TsSpline {
    const type = typeof valueType === 'string' ? TfType.declare(valueType) : valueType
    return TsTest_Museum._splineDataToSpline(_GetData(id), type)
  }

  // tsTest_Museum.cpp:1647-1651.
  static getAllNames(): string[] {
    return [..._allNames]
  }

  // tsTest_Museum.cpp:1653-1665.
  static getSplineByName(name: string, valueType: TfType | string = 'double'): TsSpline {
    const id = (TsTest_MuseumDataId as unknown as Record<string, number | undefined>)[name]
    if (id === undefined || !_allNames.includes(name)) {
      return new TsSpline()
    }
    return TsTest_Museum.getSpline(id, valueType)
  }
}
