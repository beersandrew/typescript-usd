// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/basisCurvesShaderKey.cpp,
//  pxr/imaging/hdSt/basisCurvesShaderKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/basisCurvesShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The fixed-size mixin arrays (VS[8], TCS[8], ...) are arrays of the same
//   length filled with empty tokens, as C++ default-constructs them.
// - The nested DrawStyle and NormalStyle enums are
//   HdSt_BasisCurvesShaderKeyDrawStyle and HdSt_BasisCurvesShaderKeyNormalStyle,
//   also reachable as HdSt_BasisCurvesShaderKey.DrawStyle / .NormalStyle.
// - The TfEnum name registrations (basisCurvesShaderKey.cpp:17-29) are the
//   enums' own member names.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { BasisCurvesReprDescTokens as HdBasisCurvesReprDescTokens, Tokens as HdTokens } from 'typescript-usd/hd'
import { HdSt_GeometricShader, HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** basisCurvesShaderKey.cpp:31-139 */
const _tokens = TfMakeTokens({
  baseGLSLFX: 'basisCurves.glslfx',
  curvesCommonData: 'Curves.CommonData',
  curvesPostTessCurveData: 'Curves.PostTess.CurveData',
  curvesTessCurveDataPatch: 'Curves.Tess.CurveData.Patch',
  curvesTessCurveDataWire: 'Curves.Tess.CurveData.Wire',
  curvesTessFactorsGLSL: 'Curves.TessFactorsGLSL',
  curvesTessFactorsMSL: 'Curves.TessFactorsMSL',
  curvesVertexNormalOriented: 'Curves.Vertex.Normal.Oriented',
  curvesVertexNormalImplicit: 'Curves.Vertex.Normal.Implicit',
  curvesPostTessNormalOriented: 'Curves.PostTess.Normal.Oriented',
  curvesPostTessNormalImplicit: 'Curves.PostTess.Normal.Implicit',
  curvesCoeffs: 'Curves.Coeffs',
  curvesBezier: 'Curves.BezierBasis',
  curvesBspline: 'Curves.BsplineBasis',
  curvesCatmullRom: 'Curves.CatmullRomBasis',
  curvesCentripetalCatmullRom: 'Curves.CentripetalCatmullRomBasis',
  curvesFallback: 'Curves.LinearBasis',
  pointIdNoneVS: 'PointId.Vertex.None',
  pointIdVS: 'PointId.Vertex.PointParam',
  pointIdSelDecodeUtilsVS: 'Selection.DecodeUtils',
  pointIdSelPointSelVS: 'Selection.Vertex.PointSel',
  pointIdFallbackFS: 'PointId.Fragment.Fallback',
  pointIdFS: 'PointId.Fragment.PointParam',
  topVisFallbackFS: 'Visibility.Fragment.Fallback',
  topVisFS: 'Visibility.Fragment.Topology',
  curveCubicWidthsBasis: 'Curves.Cubic.Widths.Basis',
  curveCubicWidthsLinear: 'Curves.Cubic.Widths.Linear',
  curveCubicNormalsBasis: 'Curves.Cubic.Normals.Basis',
  curveCubicNormalsLinear: 'Curves.Cubic.Normals.Linear',
  curvesLinearVaryingInterp: 'Curves.Linear.VaryingInterpolation',
  curvesCubicVaryingInterp: 'Curves.Cubic.VaryingInterpolation',
  curvesCommonControl: 'Curves.CommonControl',
  curvesCommonControlLinearRibbon: 'Curves.CommonControl.Linear.Ribbon',
  curvesCommonControlLinearHalfTube: 'Curves.CommonControl.Linear.HalfTube',
  curvesCommonControlCubicRibbon: 'Curves.CommonControl.Cubic.Ribbon',
  curvesCommonControlCubicHalfTube: 'Curves.CommonControl.Cubic.HalfTube',
  curvesCommonEvalLinearPatch: 'Curves.CommonEval.Linear.Patch',
  curvesCommonEvalCubicPatch: 'Curves.CommonEval.Cubic.Patch',
  curvesCommonEvalRibbonImplicit: 'Curves.CommonEval.Ribbon.Implicit',
  curvesCommonEvalRibbonOriented: 'Curves.CommonEval.Ribbon.Oriented',
  curvesCommonEvalHalfTube: 'Curves.CommonEval.HalfTube',
  curvesFragmentHalfTube: 'Curves.Fragment.HalfTube',
  curvesFragmentRibbonRound: 'Curves.Fragment.Ribbon.Round',
  curvesFragmentRibbonOriented: 'Curves.Fragment.Ribbon.Oriented',
  curvesFragmentHair: 'Curves.Fragment.Hair',
  curvesVertexPatch: 'Curves.Vertex.Patch',
  curvesVertexWire: 'Curves.Vertex.Wire',
  curvesTessControlLinearPatch: 'Curves.TessControl.Linear.Patch',
  curvesTessControlCubicWire: 'Curves.TessControl.Cubic.Wire',
  curvesTessControlCubicPatch: 'Curves.TessControl.Cubic.Patch',
  curvesTessEvalPatch: 'Curves.TessEval.Patch',
  curvesTessEvalCubicWire: 'Curves.TessEval.Cubic.Wire',
  curvesPostTessControlLinearPatch: 'Curves.PostTessControl.Linear.Patch',
  curvesPostTessControlCubicWire: 'Curves.PostTessControl.Cubic.Wire',
  curvesPostTessControlCubicPatch: 'Curves.PostTessControl.Cubic.Patch',
  curvesPostTessVertexPatch: 'Curves.PostTessVertex.Patch',
  curvesPostTessVertexWire: 'Curves.PostTessVertex.Wire',
  curvesPostTessVertexCubicWire: 'Curves.PostTessVertex.Cubic.Wire',
  curvesCommonEvalPatch: 'Curves.CommonEval.Patch',
  curvesFragmentWire: 'Curves.Fragment.Wire',
  curvesFragmentPatch: 'Curves.Fragment.Patch',
  instancing: 'Instancing.Transform',
  skinning: 'Vertex.SkinPoints',
  commonFS: 'Fragment.CommonTerminals',
  hullColorFS: 'Fragment.HullColor',
  pointColorFS: 'Fragment.PointColor',
  pointShadedFS: 'Fragment.PointShaded',
  surfaceFS: 'Fragment.Surface',
  surfaceUnlitFS: 'Fragment.SurfaceUnlit',
  scalarOverrideFS: 'Fragment.ScalarOverride',
  pointSizeBiasVS: 'PointDisk.Vertex.PointSizeBias',
  noPointSizeBiasVS: 'PointDisk.Vertex.None',
  diskSampleMaskFS: 'PointDisk.Fragment.SampleMask',
  noDiskSampleMaskFS: 'PointDisk.Fragment.None',
})

/** basisCurvesShaderKey.cpp:141-153 */
function _BasisToShaderKey(basis: string): TfToken {
  if (basis === HdTokens.bezier)
    return _tokens.curvesBezier
  else if (basis === HdTokens.catmullRom)
    return _tokens.curvesCatmullRom
  else if (basis === HdTokens.bspline)
    return _tokens.curvesBspline
  else if (basis === HdTokens.centripetalCatmullRom)
    return _tokens.curvesCentripetalCatmullRom
  TF_WARN('Unknown basis')
  return _tokens.curvesFallback
}

/** basisCurvesShaderKey.h:47-52 */
export enum HdSt_BasisCurvesShaderKeyDrawStyle {
  POINTS,       // Draws only the control vertices.
  WIRE,         // Draws as lines or isolines, tessellated along length
  RIBBON,       // Draws as patch, tessellated along length only
  HALFTUBE,     // Draws as patch, displaced into a half tube shape
}

/** basisCurvesShaderKey.h:54-58 */
export enum HdSt_BasisCurvesShaderKeyNormalStyle {
  ORIENTED,     // Orient to user supplied normals
  HAIR,         // Generated camera oriented normal
  ROUND,        // Generated camera oriented normal as a tube
}

function _Tokens(n: number): TfToken[] {
  return Array.from({ length: n }, () => TfToken())
}

/** basisCurvesShaderKey.h:45-95 */
export class HdSt_BasisCurvesShaderKey extends HdSt_ShaderKey {
  static readonly DrawStyle = HdSt_BasisCurvesShaderKeyDrawStyle
  static readonly NormalStyle = HdSt_BasisCurvesShaderKeyNormalStyle

  primType: HdSt_GeometricShaderPrimitiveType
  useMetalTessellation = false
  glslfx: TfToken
  VS: TfToken[] = _Tokens(8)
  TCS: TfToken[] = _Tokens(8)
  TES: TfToken[] = _Tokens(12)
  PTCS: TfToken[] = _Tokens(10)
  PTVS: TfToken[] = _Tokens(14)
  FS: TfToken[] = _Tokens(9)

  /** basisCurvesShaderKey.cpp:155-562 */
  constructor(
    type: string, basis: string,
    drawStyle: HdSt_BasisCurvesShaderKeyDrawStyle,
    normalStyle: HdSt_BasisCurvesShaderKeyNormalStyle,
    basisWidthInterpolation: boolean,
    basisNormalInterpolation: boolean,
    shadingTerminal: string,
    hasAuthoredTopologicalVisibility: boolean,
    pointsShadingEnabled: boolean,
    hasMetalTessellation: boolean,
    nativeRoundPoints: boolean,
  ) {
    super()
    this.glslfx = _tokens.baseGLSLFX
    const DS = HdSt_BasisCurvesShaderKeyDrawStyle
    const NS = HdSt_BasisCurvesShaderKeyNormalStyle
    const PT = HdSt_GeometricShaderPrimitiveType
    const VS = this.VS, TCS = this.TCS, TES = this.TES, PTCS = this.PTCS
    const PTVS = this.PTVS, FS = this.FS
    this.primType = PT.PRIM_POINTS
    const drawThick = (drawStyle === DS.HALFTUBE) ||
                     (drawStyle === DS.RIBBON)
    const cubic  = (type === HdTokens.cubic)
    const linear = (type === HdTokens.linear)
    TF_VERIFY(cubic || linear)

    // The order of the clauses below matters!
    if (drawStyle === DS.POINTS) {
        this.primType = PT.PRIM_POINTS
    } else if (cubic) {
        // cubic curves get drawn via isolines in a tessellation shader
        // even in wire mode.
        this.primType =
        PT.PRIM_BASIS_CURVES_CUBIC_PATCHES
    } else if (drawThick) {
        this.primType =
        PT.PRIM_BASIS_CURVES_LINEAR_PATCHES
    } else {
        this.primType = PT.PRIM_BASIS_CURVES_LINES
    }

    const isPrimTypePoints = HdSt_GeometricShader.isPrimTypePoints(this.primType)

    const oriented = normalStyle === NS.ORIENTED

    // Skip Metal tessellation for points (of any basis) and for linear wire
    // curves.
    const skipTess =
            (drawStyle === DS.POINTS) ||
            (linear && drawStyle === DS.WIRE)

    this.useMetalTessellation = hasMetalTessellation && !(skipTess)

    let vsIndex = 0

    VS[vsIndex++]  = _tokens.instancing
    VS[vsIndex++]  = _tokens.skinning
    VS[vsIndex++]  = drawThick ? _tokens.curvesVertexPatch
                       : _tokens.curvesVertexWire
    VS[vsIndex++]  = oriented ? _tokens.curvesVertexNormalOriented
                      : _tokens.curvesVertexNormalImplicit
    if (isPrimTypePoints) {
        // Add mixins that allow for picking and sel highlighting of points.
        // Even though these are more "render pass-ish", we do this here to
        // reduce the shader code generated when the points repr isn't used.
        VS[vsIndex++] = _tokens.pointIdVS
        VS[vsIndex++] = _tokens.pointIdSelDecodeUtilsVS
        VS[vsIndex++] = _tokens.pointIdSelPointSelVS
        VS[vsIndex++] = nativeRoundPoints ? _tokens.noPointSizeBiasVS :
            _tokens.pointSizeBiasVS
    } else {
        VS[vsIndex++] = _tokens.pointIdNoneVS
        VS[vsIndex++] =  _tokens.noPointSizeBiasVS
    }
    VS[vsIndex]  = TfToken()

    // Setup Tessellation
    let tcsIndex = 0
    let tesIndex = 0
    let ptcsIndex = 0
    let ptvsIndex = 0

    const ribbonToken =
        oriented
            ? _tokens.curvesCommonEvalRibbonOriented
            : _tokens.curvesCommonEvalRibbonImplicit

    const basisWidthsInterpolationToken =
        basisWidthInterpolation
            ? _tokens.curveCubicWidthsBasis
            : _tokens.curveCubicWidthsLinear

    const basisNormalInterpolationToken =
        basisNormalInterpolation
            ? _tokens.curveCubicNormalsBasis
            : _tokens.curveCubicNormalsLinear

    const postTessNormal =
        oriented
            ? _tokens.curvesPostTessNormalOriented
            : _tokens.curvesPostTessNormalImplicit

    TCS[tcsIndex++] = _tokens.curvesCommonData

    TES[tesIndex++] = _tokens.curvesCommonData

    PTCS[ptcsIndex++] = _tokens.curvesCommonData
    PTCS[ptcsIndex++] = _tokens.curvesPostTessCurveData
    PTCS[ptcsIndex++] = _tokens.curvesTessFactorsMSL
    PTCS[ptcsIndex++] = postTessNormal

    PTVS[ptvsIndex++] = _tokens.curvesCommonData
    PTVS[ptvsIndex++] = _tokens.curvesPostTessCurveData
    PTVS[ptvsIndex++] = postTessNormal
    PTVS[ptvsIndex++] = _tokens.pointIdNoneVS

    if (linear) {
        switch (drawStyle) {
        case DS.POINTS:
        case DS.WIRE:
        {
            TCS[0] = TfToken()
            TES[0] = TfToken()

            PTCS[0] = TfToken()
            PTVS[0] = TfToken()
            break
        }
        case DS.RIBBON:
        {
            TCS[tcsIndex++] = _tokens.curvesTessFactorsGLSL
            TCS[tcsIndex++] = _tokens.curvesCommonControl
            TCS[tcsIndex++] = _tokens.curvesTessCurveDataPatch
            TCS[tcsIndex++] = _tokens.curvesTessControlLinearPatch
            TCS[tcsIndex++] = _tokens.curvesCommonControlLinearRibbon
            TCS[tcsIndex++] = TfToken()

            TES[tesIndex++] = _tokens.instancing
            TES[tesIndex++] = _tokens.curvesTessCurveDataPatch
            TES[tesIndex++] = _tokens.curvesTessEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalPatch
            TES[tesIndex++] = _tokens.curvesFallback
            TES[tesIndex++] = _tokens.curvesCommonEvalLinearPatch
            TES[tesIndex++] = ribbonToken
            TES[tesIndex++] = _tokens.curvesLinearVaryingInterp
            TES[tesIndex++] = TfToken()

            PTCS[ptcsIndex++] = _tokens.instancing
            PTCS[ptcsIndex++] = _tokens.curvesCommonControl
            PTCS[ptcsIndex++] = _tokens.curvesPostTessControlLinearPatch
            PTCS[ptcsIndex++] = _tokens.curvesCommonControlLinearRibbon
            PTCS[ptcsIndex++] = TfToken()

            PTVS[ptvsIndex++] = _tokens.instancing
            PTVS[ptvsIndex++] = _tokens.curvesPostTessVertexPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalPatch
            PTVS[ptvsIndex++] = _tokens.curvesFallback
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalLinearPatch
            PTVS[ptvsIndex++] = ribbonToken
            PTVS[ptvsIndex++] = _tokens.curvesLinearVaryingInterp
            PTVS[ptvsIndex++] = TfToken()
            break
        }
        case DS.HALFTUBE:
        {
            TCS[tcsIndex++] = _tokens.curvesTessFactorsGLSL
            TCS[tcsIndex++] = _tokens.curvesCommonControl
            TCS[tcsIndex++] = _tokens.curvesTessCurveDataPatch
            TCS[tcsIndex++] = _tokens.curvesTessControlLinearPatch
            TCS[tcsIndex++] = _tokens.curvesCommonControlLinearHalfTube
            TCS[tcsIndex++] = TfToken()

            TES[tesIndex++] = _tokens.instancing
            TES[tesIndex++] = _tokens.curvesTessCurveDataPatch
            TES[tesIndex++] = _tokens.curvesTessEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalPatch
            TES[tesIndex++] = _tokens.curvesFallback
            TES[tesIndex++] = _tokens.curvesCommonEvalLinearPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalHalfTube
            TES[tesIndex++] = _tokens.curvesLinearVaryingInterp
            TES[tesIndex++] = TfToken()

            PTCS[ptcsIndex++] = _tokens.instancing
            PTCS[ptcsIndex++] = _tokens.curvesCommonControl
            PTCS[ptcsIndex++] = _tokens.curvesPostTessControlLinearPatch
            PTCS[ptcsIndex++] = _tokens.curvesCommonControlLinearHalfTube
            PTCS[ptcsIndex++] = TfToken()

            PTVS[ptvsIndex++] = _tokens.instancing
            PTVS[ptvsIndex++] = _tokens.curvesPostTessVertexPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalPatch
            PTVS[ptvsIndex++] = _tokens.curvesFallback
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalLinearPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalHalfTube
            PTVS[ptvsIndex++] = _tokens.curvesLinearVaryingInterp
            PTVS[ptvsIndex++] = TfToken()
            break
        }
        default:
            TF_CODING_ERROR('Unhandled drawstyle for basis curves')
        }
    } else { // cubic
        switch (drawStyle) {
        case DS.POINTS:
        {
            TCS[0] = TfToken()
            TES[0] = TfToken()

            PTCS[0] = TfToken()
            PTVS[0] = TfToken()
            break
        }
        case DS.WIRE:
        {
            TCS[tcsIndex++] = _tokens.curvesTessFactorsGLSL
            TCS[tcsIndex++] = _tokens.curvesCommonControl
            TCS[tcsIndex++] = _tokens.curvesTessCurveDataWire
            TCS[tcsIndex++] = _tokens.curvesTessControlCubicWire
            TCS[tcsIndex++] = TfToken()

            TES[tesIndex++] = _tokens.instancing
            TES[tesIndex++] = _tokens.curvesTessCurveDataWire
            TES[tesIndex++] = _tokens.curvesTessEvalCubicWire
            TES[tesIndex++] = _BasisToShaderKey(basis)
            TES[tesIndex++] = _tokens.curvesCubicVaryingInterp
            TES[tesIndex++] = TfToken()

            PTCS[ptcsIndex++] = _tokens.instancing
            PTCS[ptcsIndex++] = _tokens.curvesCommonControl
            PTCS[ptcsIndex++] = _tokens.curvesPostTessControlCubicWire
            PTCS[ptcsIndex++] = TfToken()

            PTVS[ptvsIndex++] = _tokens.instancing
            PTVS[ptvsIndex++] = _tokens.curvesPostTessVertexCubicWire
            PTVS[ptvsIndex++] = _BasisToShaderKey(basis)
            PTVS[ptvsIndex++] = _tokens.curvesCubicVaryingInterp
            PTVS[ptvsIndex++] = TfToken()
            break
        }
        case DS.RIBBON:
        {
            TCS[tcsIndex++] = _tokens.curvesTessFactorsGLSL
            TCS[tcsIndex++] = _tokens.curvesCommonControl
            TCS[tcsIndex++] = _tokens.curvesTessCurveDataPatch
            TCS[tcsIndex++] = _tokens.curvesTessControlCubicPatch
            TCS[tcsIndex++] = _tokens.curvesCommonControlCubicRibbon
            TCS[tcsIndex++] = TfToken()

            TES[tesIndex++] = _tokens.instancing
            TES[tesIndex++] = _tokens.curvesTessCurveDataPatch
            TES[tesIndex++] = _tokens.curvesTessEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalCubicPatch
            TES[tesIndex++] = _BasisToShaderKey(basis)
            TES[tesIndex++] = ribbonToken
            TES[tesIndex++] = basisWidthsInterpolationToken
            TES[tesIndex++] = basisNormalInterpolationToken
            TES[tesIndex++] = _tokens.curvesCubicVaryingInterp
            TES[tesIndex++] = TfToken()

            PTCS[ptcsIndex++] = _tokens.instancing
            PTCS[ptcsIndex++] = _tokens.curvesCommonControl
            PTCS[ptcsIndex++] = _tokens.curvesPostTessControlCubicPatch
            PTCS[ptcsIndex++] = _tokens.curvesCommonControlCubicRibbon
            PTCS[ptcsIndex++] = TfToken()

            PTVS[ptvsIndex++] = _tokens.instancing
            PTVS[ptvsIndex++] = _tokens.curvesPostTessVertexPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalCubicPatch
            PTVS[ptvsIndex++] = _BasisToShaderKey(basis)
            PTVS[ptvsIndex++] = ribbonToken
            PTVS[ptvsIndex++] = basisWidthsInterpolationToken
            PTVS[ptvsIndex++] = basisNormalInterpolationToken
            PTVS[ptvsIndex++] = _tokens.curvesCubicVaryingInterp
            PTVS[ptvsIndex++] = TfToken()
            break
        }
        case DS.HALFTUBE:
        {
            TCS[tcsIndex++] = _tokens.curvesTessFactorsGLSL
            TCS[tcsIndex++] = _tokens.curvesCommonControl
            TCS[tcsIndex++] = _BasisToShaderKey(basis)
            TCS[tcsIndex++] = _tokens.curvesTessCurveDataPatch
            TCS[tcsIndex++] = _tokens.curvesTessControlCubicPatch
            TCS[tcsIndex++] = _tokens.curvesCommonControlCubicHalfTube
            TCS[tcsIndex++] = TfToken()

            TES[tesIndex++] = _tokens.instancing
            TES[tesIndex++] = _tokens.curvesTessCurveDataPatch
            TES[tesIndex++] = _tokens.curvesTessEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalPatch
            TES[tesIndex++] = _tokens.curvesCommonEvalCubicPatch
            TES[tesIndex++] = _BasisToShaderKey(basis)
            TES[tesIndex++] = _tokens.curvesCommonEvalHalfTube
            TES[tesIndex++] = basisWidthsInterpolationToken
            TES[tesIndex++] = basisNormalInterpolationToken
            TES[tesIndex++] = _tokens.curvesCubicVaryingInterp
            TES[tesIndex++] = TfToken()

            PTCS[ptcsIndex++] = _tokens.instancing
            PTCS[ptcsIndex++] = _tokens.curvesCommonControl
            PTCS[ptcsIndex++] = _BasisToShaderKey(basis)
            PTCS[ptcsIndex++] = _tokens.curvesPostTessControlCubicPatch
            PTCS[ptcsIndex++] = _tokens.curvesCommonControlCubicHalfTube
            PTCS[ptcsIndex++] = TfToken()

            PTVS[ptvsIndex++] = _tokens.instancing
            PTVS[ptvsIndex++] = _tokens.curvesPostTessVertexPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalPatch
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalCubicPatch
            PTVS[ptvsIndex++] = _BasisToShaderKey(basis)
            PTVS[ptvsIndex++] = _tokens.curvesCommonEvalHalfTube
            PTVS[ptvsIndex++] = basisWidthsInterpolationToken
            PTVS[ptvsIndex++] = basisNormalInterpolationToken
            PTVS[ptvsIndex++] = _tokens.curvesCubicVaryingInterp
            PTVS[ptvsIndex++] = TfToken()
            break
        }
        default:
            TF_CODING_ERROR('Unhandled drawstyle for basis curves')
        }
    }

    // Disable VS/TCS/TES if we're using Metal tessellation and vice versa.
    if (this.useMetalTessellation) {
        VS[0]  = TfToken()
        TCS[0] = TfToken()
        TES[0] = TfToken()
    } else {
        PTCS[0] = TfToken()
        PTVS[0] = TfToken()
    }

    // setup fragment shaders
    // Common must be first as it defines terminal interfaces
    let fsIndex = 0
    FS[fsIndex++] = _tokens.commonFS
    if (shadingTerminal === HdBasisCurvesReprDescTokens.hullColor) {
        FS[fsIndex++] = _tokens.hullColorFS
    } else if (shadingTerminal === HdBasisCurvesReprDescTokens.pointColor) {
        if (pointsShadingEnabled) {
            // Let points for these curves be affected by the associated
            // material so as to appear coherent with the other shaded surfaces
            // that may be part of this rprim.
            FS[fsIndex++] = _tokens.pointShadedFS
        } else {
            FS[fsIndex++] = _tokens.pointColorFS
        }
    } else if (shadingTerminal ===
               HdBasisCurvesReprDescTokens.surfaceShaderUnlit) {
        FS[fsIndex++] = _tokens.surfaceUnlitFS
    } else {
        FS[fsIndex++] = _tokens.surfaceFS
    }
    FS[fsIndex++] = _tokens.scalarOverrideFS

    if (isPrimTypePoints) {
        FS[fsIndex++] = _tokens.pointIdFS
        FS[fsIndex++] = nativeRoundPoints ? _tokens.noDiskSampleMaskFS :
            _tokens.diskSampleMaskFS
    } else {
        FS[fsIndex++] = _tokens.pointIdFallbackFS
        FS[fsIndex++] = _tokens.noDiskSampleMaskFS
    }

    FS[fsIndex++] = hasAuthoredTopologicalVisibility? _tokens.topVisFS :
                        _tokens.topVisFallbackFS


    if (drawStyle === DS.WIRE ||
        drawStyle === DS.POINTS) {
        FS[fsIndex++] = _tokens.curvesFragmentWire
        FS[fsIndex++] = TfToken()
    }
    else if (drawStyle === DS.RIBBON &&
             normalStyle === NS.ORIENTED){
        FS[fsIndex++] = _tokens.curvesFragmentPatch
        FS[fsIndex++] = _tokens.curvesFragmentRibbonOriented
        FS[fsIndex++] = TfToken()
    }
    else if (drawStyle === DS.RIBBON &&
             normalStyle === NS.ROUND){
        FS[fsIndex++] = _tokens.curvesFragmentPatch
        FS[fsIndex++] = _tokens.curvesFragmentRibbonRound
        FS[fsIndex++] = TfToken()
    }
    else if (drawStyle === DS.RIBBON &&
             normalStyle === NS.HAIR){
        FS[fsIndex++] = _tokens.curvesFragmentPatch
        FS[fsIndex++] = _tokens.curvesFragmentHair
        FS[fsIndex++] = TfToken()
    }
    else if (drawStyle === DS.HALFTUBE &&
             normalStyle === NS.ROUND){
        FS[fsIndex++] = _tokens.curvesFragmentPatch
        FS[fsIndex++] = _tokens.curvesFragmentHalfTube
        FS[fsIndex++] = TfToken()
    }
    else if (drawStyle === DS.HALFTUBE &&
             normalStyle === NS.HAIR){
        FS[fsIndex++] = _tokens.curvesFragmentPatch
        FS[fsIndex++] = _tokens.curvesFragmentHair
        FS[fsIndex++] = TfToken()
    }
    else {
        TF_WARN('Cannot setup fragment shaders for invalid combination of ' +
                 'basis curves shader key settings.')
        FS[fsIndex++] = _tokens.curvesFragmentHair
        FS[fsIndex++] = TfToken()
    }
  }

  /** basisCurvesShaderKey.h:72-82 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  override getTCS(): readonly TfToken[] { return this.TCS }
  override getTES(): readonly TfToken[] { return this.TES }
  override getPTCS(): readonly TfToken[] { return this.PTCS }
  override getPTVS(): readonly TfToken[] { return this.PTVS }
  override getFS(): readonly TfToken[] { return this.FS }

  /** basisCurvesShaderKey.h:84-86 */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return this.primType
  }

  /** basisCurvesShaderKey.h:88-90 */
  override UseMetalTessellation(): boolean {
    return this.useMetalTessellation
  }
}
