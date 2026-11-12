// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/meshShaderKey.cpp,
//  pxr/imaging/hdSt/meshShaderKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/meshShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The fixed-size mixin arrays (VS[8], TCS[4], ...) are arrays of the same
//   length filled with empty tokens, as C++ default-constructs them.
// - The nested NormalSource enum is HdSt_MeshShaderKeyNormalSource, also
//   reachable as HdSt_MeshShaderKey.NormalSource.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  CullStyle as HdCullStyle,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDescTokens as HdMeshReprDescTokens,
  PolygonMode as HdPolygonMode,
} from 'typescript-usd/hd'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderPrimitiveType,
  type HdSt_GeometricShaderFvarPatchType,
} from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** meshShaderKey.cpp:16-144 */
const _tokens = TfMakeTokens({

  baseGLSLFX: 'mesh.glslfx',

  // normal mixins
  normalsScene: 'MeshNormal.Scene',
  normalsScenePatches: 'MeshNormal.Scene.Patches',
  normalsSmooth: 'MeshNormal.Smooth',
  normalsFlat: 'MeshNormal.Flat',
  normalsPass: 'MeshNormal.Pass',
  normalsScreenSpaceFS: 'MeshNormal.Fragment.ScreenSpace',

  normalsGeometryFlat: 'MeshNormal.Geometry.Flat',
  normalsGeometryNoFlat: 'MeshNormal.Geometry.NoFlat',

  normalsDoubleSidedFS: 'MeshNormal.Fragment.DoubleSided',
  normalsSingleSidedFS: 'MeshNormal.Fragment.SingleSided',

  faceCullNoneFS: 'MeshFaceCull.Fragment.None',
  faceCullFrontFacingFS: 'MeshFaceCull.Fragment.FrontFacing',
  faceCullBackFacingFS: 'MeshFaceCull.Fragment.BackFacing',

  // wireframe mixins
  edgeNoneFS: 'MeshWire.Fragment.NoEdge',

  edgeOpacityNoForceFS: 'MeshWire.Fragment.FinalEdgeOpacityNoForce',
  edgeOpacityForceFS: 'MeshWire.Fragment.FinalEdgeOpacityForce',

  edgeMaskTriangleFS: 'MeshWire.Fragment.EdgeMaskTriangle',
  edgeMaskQuadFS: 'MeshWire.Fragment.EdgeMaskQuad',
  edgeMaskRefinedQuadFS: 'MeshWire.Fragment.EdgeMaskRefinedQuad',
  edgeMaskTriQuadFS: 'MeshWire.Fragment.EdgeMaskTriQuad',
  edgeMaskNoneFS: 'MeshWire.Fragment.EdgeMaskNone',

  edgeCommonFS: 'MeshWire.Fragment.EdgeCommon',
  edgeTriQuadPTVSFS: 'MeshWire.Fragment.EdgeTriQuadPTVS',
  edgeParamFS: 'MeshWire.Fragment.EdgeParam',

  edgeOnlyBlendFS: 'MeshWire.Fragment.EdgeOnlyBlendColor',
  edgeOnlyNoBlendFS: 'MeshWire.Fragment.EdgeOnlyNoBlend',

  edgeCoordBarycentricCoordFS: 'MeshWire.Fragment.EdgeCoord.Barycentric',
  edgeCoordTessCoordFS: 'MeshWire.Fragment.EdgeCoord.Tess',
  edgeCoordTessCoordTriangleFS: 'MeshWire.Fragment.EdgeCoord.TessTriangle',

  edgeOnSurfFS: 'MeshWire.Fragment.EdgeOnSurface',
  patchEdgeTriangleFS: 'MeshPatchWire.Fragment.PatchEdgeTriangle',
  patchEdgeQuadFS: 'MeshPatchWire.Fragment.PatchEdgeQuad',
  patchEdgeOnlyFS: 'MeshPatchWire.Fragment.EdgeOnly',
  patchEdgeOnSurfFS: 'MeshPatchWire.Fragment.EdgeOnSurface',

  // selection decoding
  selDecodeUtils: 'Selection.DecodeUtils',
  selPointSelVS: 'Selection.Vertex.PointSel',

  // edge id mixins (for edge picking & selection)
  edgeIdNoneFS: 'EdgeId.Fragment.None',
  edgeIdCommonFS: 'EdgeId.Fragment.Common',
  edgeIdTriangleSurfFS: 'EdgeId.Fragment.TriangleSurface',
  edgeIdTriangleLineFS: 'EdgeId.Fragment.TriangleLines',
  edgeIdTriangleParamFS: 'EdgeId.Fragment.TriangleParam',
  edgeIdQuadSurfFS: 'EdgeId.Fragment.QuadSurface',
  edgeIdQuadLineFS: 'EdgeId.Fragment.QuadLines',
  edgeIdQuadParamFS: 'EdgeId.Fragment.QuadParam',

  // point id mixins (for point picking & selection)
  pointIdNoneVS: 'PointId.Vertex.None',
  pointIdVS: 'PointId.Vertex.PointParam',
  pointIdFallbackFS: 'PointId.Fragment.Fallback',
  pointIdFS: 'PointId.Fragment.PointParam',

  // visibility mixin (for face and point visibility)
  topVisFallbackFS: 'Visibility.Fragment.Fallback',
  topVisFS: 'Visibility.Fragment.Topology',

  // main for all the shader stages
  mainVS: 'Mesh.Vertex',
  mainPatchCommonTCS: 'Mesh.TessControl.PatchCommon',
  mainBSplineQuadTCS: 'Mesh.TessControl.BSplineQuad',
  mainBezierQuadTES: 'Mesh.TessEval.BezierQuad',
  mainBoxSplineTriangleTCS: 'Mesh.TessControl.BoxSplineTriangle',
  mainBezierTriangleTES: 'Mesh.TessEval.BezierTriangle',
  mainVaryingInterpTES: 'Mesh.TessEval.VaryingInterpolation',
  mainTrianglePTVS: 'Mesh.PostTessVertex.Triangle',
  mainQuadPTVS: 'Mesh.PostTessVertex.Quad',
  mainTriQuadPTVS: 'Mesh.PostTessVertex.TriQuad',
  mainPatchCommonPTCS: 'Mesh.PostTessControl.PatchCommon',
  mainBSplineQuadPTCS: 'Mesh.PostTessControl.BSplineQuad',
  mainBSplineQuadPTVS: 'Mesh.PostTessVertex.BSplineQuad',
  mainBoxSplineTrianglePTCS: 'Mesh.PostTessControl.BoxSplineTriangle',
  mainBoxSplineTrianglePTVS: 'Mesh.PostTessVertex.BoxSplineTriangle',
  mainTriangleTessGS: 'Mesh.Geometry.TriangleTess',
  mainTriangleGS: 'Mesh.Geometry.Triangle',
  mainTriQuadGS: 'Mesh.Geometry.TriQuad',
  mainQuadGS: 'Mesh.Geometry.Quad',
  mainPatchCoordFS: 'Mesh.Fragment.PatchCoord',
  mainPatchCoordNoGSFS: 'Mesh.Fragment.PatchCoord.NoGS',
  mainPatchCoordTessFS: 'Mesh.Fragment.PatchCoord.Tess',
  mainPatchCoordTriangleFS: 'Mesh.Fragment.PatchCoord.Triangle',
  mainPatchCoordQuadFS: 'Mesh.Fragment.PatchCoord.Quad',
  mainPatchCoordTriQuadFS: 'Mesh.Fragment.PatchCoord.TriQuad',
  mainPatchCoordTrianglePTVSFS: 'Mesh.Fragment.PatchCoord.TrianglePTVS',
  mainPatchCoordQuadPTVSFS: 'Mesh.Fragment.PatchCoord.QuadPTVS',
  mainPatchCoordTriQuadPTVSFS: 'Mesh.Fragment.PatchCoord.TriQuadPTVS',
  mainFS: 'Mesh.Fragment',

  // instancing related mixins
  instancing: 'Instancing.Transform',

  // skinning
  skinning: 'Vertex.SkinPoints',

  // terminals
  customDisplacementGS: 'Geometry.CustomDisplacement',
  noCustomDisplacementGS: 'Geometry.NoCustomDisplacement',
  commonFS: 'Fragment.CommonTerminals',
  surfaceFS: 'Fragment.Surface',
  surfaceUnlitFS: 'Fragment.SurfaceUnlit',
  surfaceSheerFS: 'Fragment.SurfaceSheer',
  surfaceOutlineFS: 'Fragment.SurfaceOutline',
  constantColorFS: 'Fragment.ConstantColor',
  hullColorFS: 'Fragment.HullColor',
  pointColorFS: 'Fragment.PointColor',
  pointShadedFS: 'Fragment.PointShaded',
  scalarOverrideFS: 'Fragment.ScalarOverride',
  noScalarOverrideFS: 'Fragment.NoScalarOverride',

  // rounded points
  pointSizeBiasVS: 'PointDisk.Vertex.PointSizeBias',
  noPointSizeBiasVS: 'PointDisk.Vertex.None',
  diskSampleMaskFS: 'PointDisk.Fragment.SampleMask',
  noDiskSampleMaskFS: 'PointDisk.Fragment.None',})

/** HdSt_MeshShaderKey::NormalSource (meshShaderKey.h:23-31) */
export enum HdSt_MeshShaderKeyNormalSource {
  NormalSourceScene,
  NormalSourceSmooth,
  NormalSourceLimit,
  NormalSourceFlat,
  NormalSourceFlatGeometric,
  NormalSourceFlatScreenSpace,
}

function _Tokens(n: number): TfToken[] {
  return Array.from({ length: n }, () => TfToken())
}

/** meshShaderKey.h:21-116 */
export class HdSt_MeshShaderKey extends HdSt_ShaderKey {
  static readonly NormalSource = HdSt_MeshShaderKeyNormalSource
  static readonly NormalSourceScene = HdSt_MeshShaderKeyNormalSource.NormalSourceScene
  static readonly NormalSourceSmooth = HdSt_MeshShaderKeyNormalSource.NormalSourceSmooth
  static readonly NormalSourceLimit = HdSt_MeshShaderKeyNormalSource.NormalSourceLimit
  static readonly NormalSourceFlat = HdSt_MeshShaderKeyNormalSource.NormalSourceFlat
  static readonly NormalSourceFlatGeometric = HdSt_MeshShaderKeyNormalSource.NormalSourceFlatGeometric
  static readonly NormalSourceFlatScreenSpace = HdSt_MeshShaderKeyNormalSource.NormalSourceFlatScreenSpace

  primType: HdSt_GeometricShaderPrimitiveType
  cullStyle: HdCullStyle
  useHardwareFaceCulling: boolean
  hasMirroredTransform: boolean
  doubleSided: boolean
  useMetalTessellation: boolean
  polygonMode: HdPolygonMode
  lineWidth: number
  fvarPatchType: HdSt_GeometricShaderFvarPatchType

  glslfx: TfToken
  VS: TfToken[] = _Tokens(8)
  TCS: TfToken[] = _Tokens(4)
  TES: TfToken[] = _Tokens(4)
  PTCS: TfToken[] = _Tokens(4)
  PTVS: TfToken[] = _Tokens(13)
  GS: TfToken[] = _Tokens(10)
  FS: TfToken[] = _Tokens(23)

  /** meshShaderKey.cpp:146-643 */
  constructor(
    primitiveType: HdSt_GeometricShaderPrimitiveType,
    shadingTerminal: TfToken,
    normalsSource: HdSt_MeshShaderKeyNormalSource,
    normalsInterpolation: HdInterpolation,
    cullStyle: HdCullStyle,
    geomStyle: HdMeshGeomStyle,
    fvarPatchType: HdSt_GeometricShaderFvarPatchType,
    lineWidth: number,
    doubleSided: boolean,
    hasBuiltinBarycentrics: boolean,
    hasMetalTessellation: boolean,
    hasCustomDisplacement: boolean,
    hasPerFaceInterpolation: boolean,
    hasTopologicalVisibility: boolean,
    blendWireframeColor: boolean,
    hasMirroredTransform: boolean,
    hasInstancer: boolean,
    enableScalarOverride: boolean,
    pointsShadingEnabled: boolean,
    forceOpaqueEdges: boolean,
    surfaceEdgeIds: boolean,
    nativeRoundPoints: boolean,
  ) {
    super()
    const NS = HdSt_MeshShaderKeyNormalSource
    const VS = this.VS, TCS = this.TCS, TES = this.TES, PTCS = this.PTCS
    const PTVS = this.PTVS, GS = this.GS, FS = this.FS

    this.primType = primitiveType
    this.cullStyle = cullStyle
    this.hasMirroredTransform = hasMirroredTransform
    this.doubleSided = doubleSided
    this.useMetalTessellation = false
    this.polygonMode = HdPolygonMode.HdPolygonModeFill
    this.lineWidth = lineWidth
    this.fvarPatchType = fvarPatchType
    this.glslfx = _tokens.baseGLSLFX
    const primType = this.primType

    if (geomStyle === HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly ||
      geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnly) {
      this.polygonMode = HdPolygonMode.HdPolygonModeLine
    }

    // XXX: Unfortunately instanced meshes can't use h/w culling. This is due to
    // the possibility that they have instanceTransform/instanceScale primvars.
    this.useHardwareFaceCulling = !hasInstancer
    const useHardwareFaceCulling = this.useHardwareFaceCulling

    const isPrimTypePoints = HdSt_GeometricShader.isPrimTypePoints(primType)
    const isPrimTypeTris = HdSt_GeometricShader.isPrimTypeTriangles(primType)
    const isPrimTypeQuads = HdSt_GeometricShader.isPrimTypeQuads(primType)
    const isPrimTypeTriQuads =
      HdSt_GeometricShader.isPrimTypeTriQuads(primType)
    const isPrimTypeRefinedMesh =
      HdSt_GeometricShader.isPrimTypeRefinedMesh(primType)
    const isPrimTypePatches =
      HdSt_GeometricShader.isPrimTypePatches(primType)
    const isPrimTypePatchesBSpline =
      primType ===
        HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BSPLINE
    const isPrimTypePatchesBoxSplineTriangle =
      primType ===
        HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE

    const renderWireframe = geomStyle === HdMeshGeomStyle.HdMeshGeomStyleEdgeOnly ||
      geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnly

    const renderEdges = geomStyle === HdMeshGeomStyle.HdMeshGeomStyleEdgeOnSurf ||
      geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnSurf

    // Selected edges can be highlighted even if not otherwise displayed
    const renderSurfaceEdgeIds = surfaceEdgeIds &&
      (geomStyle === HdMeshGeomStyle.HdMeshGeomStyleSurf ||
        geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHull)

    /* Normals configurations:
     * Smooth normals:
     *   [VS] .Smooth, [PTVS] .Smooth, ([GS] .NoFlat, .Pass), [FS] .Pass
     *   (geometry shader, ptvs optional)
     * Scene normals:
     *   [VS] .Scene, [PTVS] .Scene, ([GS] .NoFlat, .Pass), [FS] .Pass
     *   --or-- [VS] .Pass, [PTVS] .Scene, [GS] .NoFlat, .Scene, [FS] .Pass
     *   --or-- [VS] .Pass, [PTVS] .Pass, [FS] .Scene
     *   (depending on interpolation)
     *   (ptvs optional)
     * Limit normals:
     *   [VS] .Pass, [PTVS] .Pass, [GS] .NoFlat, .Pass, [FS] .Pass
     *   (ptvs optional)
     * Flat normals:
     *   [VS] .Pass, [PTVS] .Flat, [GS] .Flat, .Pass, [FS] .Pass
     *   (ptvs optional)
     * Screen Space Flat normals:
     *   [VS] .Pass, [PTVS] .Pass, [GS] .Pass, [FS] .ScreenSpace
     *   (geometry shader, ptvs optional)
     * Geometric Flat normals:
     *   [VS] .Pass, [PTVS] .Pass, [GS] .Flat, .Pass, [FS] .Pass
     *   (ptvs optional)
     */
    const vsSceneNormals =
      (normalsSource === NS.NormalSourceScene &&
        normalsInterpolation !== HdInterpolation.HdInterpolationUniform &&
        normalsInterpolation !== HdInterpolation.HdInterpolationFaceVarying)
    const gsSceneNormals =
      (normalsSource === NS.NormalSourceScene && !vsSceneNormals)
    const ptvsSceneNormals =
      (normalsSource === NS.NormalSourceScene && !vsSceneNormals)
    const ptvsGeometricNormals =
      (normalsSource === NS.NormalSourceFlatGeometric)

    // vertex shader
    let vsIndex = 0
    VS[vsIndex++] = _tokens.instancing
    VS[vsIndex++] = _tokens.skinning

    VS[vsIndex++] = (normalsSource === NS.NormalSourceSmooth)
      ? _tokens.normalsSmooth
      : (vsSceneNormals ? _tokens.normalsScene : _tokens.normalsPass)

    if (isPrimTypePoints) {
      // Add mixins that allow for picking and sel highlighting of points.
      // Even though these are more "render pass-ish", we do this here to
      // reduce the shader code generated when the points repr isn't used.
      VS[vsIndex++] = _tokens.pointIdVS
      VS[vsIndex++] = _tokens.selDecodeUtils
      VS[vsIndex++] = _tokens.selPointSelVS
      VS[vsIndex++] = nativeRoundPoints ? _tokens.noPointSizeBiasVS
        : _tokens.pointSizeBiasVS
    } else {
      VS[vsIndex++] = _tokens.pointIdNoneVS
      VS[vsIndex++] = _tokens.noPointSizeBiasVS
    }
    VS[vsIndex++] = _tokens.mainVS
    VS[vsIndex] = TfToken()

    // Determine if PTVS should be used for Metal.
    const usePTVSTechniques =
      isPrimTypePatches ||
      hasCustomDisplacement ||
      ptvsSceneNormals ||
      ptvsGeometricNormals ||
      !hasBuiltinBarycentrics

    // Determine if using actually using Metal PTVS.
    this.useMetalTessellation =
      hasMetalTessellation && !isPrimTypePoints && usePTVSTechniques

    // PTVS shaders can provide barycentric coords w/o GS.
    const hasFragmentShaderBarycentrics =
      hasBuiltinBarycentrics || this.useMetalTessellation

    // post tess vertex shader vertex steps
    let ptvsIndex = 0
    let ptcsIndex = 0
    if (this.useMetalTessellation) {
      PTVS[ptvsIndex++] = _tokens.instancing

      // PTVS handles both usual "vs" normals and then later it may also
      // handle a separate fallback calculation.
      // Here we handle the fallback possibility.
      if (ptvsGeometricNormals) {
        PTVS[ptvsIndex++] = _tokens.normalsGeometryFlat
      } else {
        PTVS[ptvsIndex++] = _tokens.normalsGeometryNoFlat
      }

      // Now handle the vs style normals
      if (normalsSource === NS.NormalSourceFlat) {
        PTVS[ptvsIndex++] = _tokens.normalsFlat
      } else if (normalsSource === NS.NormalSourceSmooth) {
        PTVS[ptvsIndex++] = _tokens.normalsSmooth
      } else if (vsSceneNormals) {
        PTVS[ptvsIndex++] = _tokens.normalsScene
      } else if (gsSceneNormals && isPrimTypePatches) {
        PTVS[ptvsIndex++] = _tokens.normalsScenePatches
      } else {
        PTVS[ptvsIndex++] = _tokens.normalsPass
      }

      if (isPrimTypePoints) {
        // Add mixins that allow for picking and sel highlighting of points.
        // Even though these are more "render pass-ish", we do this here to
        // reduce the shader code generated when the points repr isn't used.
        PTVS[ptvsIndex++] = _tokens.pointIdVS
        PTVS[ptvsIndex++] = _tokens.selDecodeUtils
        PTVS[ptvsIndex++] = _tokens.selPointSelVS
        PTVS[ptvsIndex++] = nativeRoundPoints ? _tokens.noPointSizeBiasVS
          : _tokens.pointSizeBiasVS
      } else {
        PTVS[ptvsIndex++] = _tokens.pointIdNoneVS
        PTVS[ptvsIndex++] = _tokens.noPointSizeBiasVS
      }

      if (hasCustomDisplacement) {
        PTVS[ptvsIndex++] = _tokens.customDisplacementGS
      } else {
        PTVS[ptvsIndex++] = _tokens.noCustomDisplacementGS
      }

      if (isPrimTypeTris) {
        PTVS[ptvsIndex++] = _tokens.mainTrianglePTVS
      } else if (isPrimTypeQuads) {
        PTVS[ptvsIndex++] = _tokens.mainQuadPTVS
      } else if (isPrimTypeTriQuads) {
        PTVS[ptvsIndex++] = _tokens.mainTriQuadPTVS
      } else if (isPrimTypePatchesBSpline) {
        PTCS[ptcsIndex++] = _tokens.instancing
        PTCS[ptcsIndex++] = _tokens.mainPatchCommonPTCS
        PTCS[ptcsIndex++] = _tokens.mainBSplineQuadPTCS
        PTVS[ptvsIndex++] = _tokens.mainBSplineQuadPTVS
      } else if (isPrimTypePatchesBoxSplineTriangle) {
        PTCS[ptcsIndex++] = _tokens.instancing
        PTCS[ptcsIndex++] = _tokens.mainPatchCommonPTCS
        PTCS[ptcsIndex++] = _tokens.mainBoxSplineTrianglePTCS
        PTVS[ptvsIndex++] = _tokens.mainBoxSplineTrianglePTVS
      }

      PTVS[ptvsIndex] = TfToken()
      PTCS[ptcsIndex] = TfToken()
    }

    const ptvsStageEnabled = PTVS[0]!.length !== 0

    // tessellation control shader
    if (isPrimTypePatches && !ptvsStageEnabled) {
      TCS[0] = _tokens.instancing
      TCS[1] = _tokens.mainPatchCommonTCS
      TCS[2] = isPrimTypePatchesBSpline
        ? _tokens.mainBSplineQuadTCS
        : _tokens.mainBoxSplineTriangleTCS
      TCS[3] = TfToken()

      // tessellation evaluation shader
      TES[0] = _tokens.instancing
      TES[1] = isPrimTypePatchesBSpline
        ? _tokens.mainBezierQuadTES
        : _tokens.mainBezierTriangleTES
      TES[2] = _tokens.mainVaryingInterpTES
      TES[3] = TfToken()
    } else {
      TCS[0] = TfToken()
      TES[0] = TfToken()
    }

    // geometry shader
    let gsIndex = 0
    GS[gsIndex++] = _tokens.instancing

    GS[gsIndex++] = (normalsSource === NS.NormalSourceFlat)
      ? _tokens.normalsFlat
      : (gsSceneNormals ? (isPrimTypePatches ? _tokens.normalsScenePatches
        : _tokens.normalsScene)
        : _tokens.normalsPass)

    GS[gsIndex++] = (normalsSource === NS.NormalSourceFlatGeometric)
      ? _tokens.normalsGeometryFlat : _tokens.normalsGeometryNoFlat

    // Displacement shading can be disabled explicitly, or if the entrypoint
    // doesn't exist (resolved in HdStMesh).
    GS[gsIndex++] = (!hasCustomDisplacement)
      ? _tokens.noCustomDisplacementGS
      : _tokens.customDisplacementGS

    GS[gsIndex++] = isPrimTypeQuads
      ? _tokens.mainQuadGS
      : isPrimTypeTriQuads
        ? _tokens.mainTriQuadGS
        : isPrimTypePatches
          ? _tokens.mainTriangleTessGS
          : _tokens.mainTriangleGS
    GS[gsIndex] = TfToken()

    // Optimization : See if we can skip the geometry shader.
    const canSkipGS =
      ptvsStageEnabled ||
      // Whether we can skip executing the displacement shading terminal
      (!hasCustomDisplacement &&
        (normalsSource !== NS.NormalSourceLimit) &&
        (normalsSource !== NS.NormalSourceFlatGeometric) &&
        // whether we can skip splitting quads to triangles
        (isPrimTypeTris ||
          isPrimTypeTriQuads) &&
        // whether we can skip generating coords for edges
        ((!renderWireframe && !renderEdges && !renderSurfaceEdgeIds) ||
          hasFragmentShaderBarycentrics) &&
        // whether we can skip generating coords for per-face interpolation
        (!hasPerFaceInterpolation ||
          hasFragmentShaderBarycentrics))

    if (canSkipGS) {
      GS[0] = TfToken()
    }

    // Optimization : Points don't need any sort of geometry shader so
    //                we ignore it here.
    if (isPrimTypePoints) {
      GS[0] = TfToken()
    }

    const gsStageEnabled = GS[0]!.length !== 0

    // fragment shader
    let fsIndex = 0
    FS[fsIndex++] = _tokens.instancing

    FS[fsIndex++] =
      (normalsSource === NS.NormalSourceFlatScreenSpace)
        ? _tokens.normalsScreenSpaceFS
        : (!gsStageEnabled && normalsSource === NS.NormalSourceFlat)
          ? _tokens.normalsFlat
          : ((!gsStageEnabled && gsSceneNormals)
            ? _tokens.normalsScene
            : _tokens.normalsPass)

    FS[fsIndex++] = doubleSided
      ? _tokens.normalsDoubleSidedFS : _tokens.normalsSingleSidedFS

    const faceCullFrontFacing =
      !useHardwareFaceCulling &&
      (cullStyle === HdCullStyle.HdCullStyleFront ||
        (cullStyle === HdCullStyle.HdCullStyleFrontUnlessDoubleSided && !doubleSided))
    const faceCullBackFacing =
      !useHardwareFaceCulling &&
      (cullStyle === HdCullStyle.HdCullStyleBack ||
        (cullStyle === HdCullStyle.HdCullStyleBackUnlessDoubleSided && !doubleSided))
    FS[fsIndex++] =
      faceCullFrontFacing
        ? _tokens.faceCullFrontFacingFS
        : faceCullBackFacing
          ? _tokens.faceCullBackFacingFS
          : _tokens.faceCullNoneFS // DontCare, Nothing, HW

    // Wire (edge) related mixins
    if (renderWireframe || renderEdges) {
      if (isPrimTypeTris && ptvsStageEnabled) {
        FS[fsIndex++] = _tokens.edgeCoordTessCoordTriangleFS
      } else if ((isPrimTypeQuads || isPrimTypeTriQuads) && ptvsStageEnabled) {
        FS[fsIndex++] = _tokens.edgeCoordTessCoordFS
      } else {
        FS[fsIndex++] = _tokens.edgeCoordBarycentricCoordFS
      }

      if (isPrimTypeRefinedMesh) {
        if (isPrimTypeQuads || isPrimTypeTriQuads) {
          FS[fsIndex++] = _tokens.edgeMaskRefinedQuadFS
        } else {
          FS[fsIndex++] = _tokens.edgeMaskNoneFS
        }
      } else if (isPrimTypeTris) {
        FS[fsIndex++] = _tokens.edgeMaskTriangleFS
      } else if (isPrimTypeTriQuads) {
        FS[fsIndex++] = _tokens.edgeMaskTriQuadFS
      } else {
        FS[fsIndex++] = _tokens.edgeMaskQuadFS
      }

      if (isPrimTypeTriQuads && ptvsStageEnabled) {
        FS[fsIndex++] = _tokens.edgeTriQuadPTVSFS
      } else {
        FS[fsIndex++] = _tokens.edgeCommonFS
      }
      FS[fsIndex++] = _tokens.edgeParamFS

      if (forceOpaqueEdges) {
        FS[fsIndex++] = _tokens.edgeOpacityForceFS
      } else {
        FS[fsIndex++] = _tokens.edgeOpacityNoForceFS
      }

      if (renderWireframe) {
        if (isPrimTypePatches) {
          FS[fsIndex++] = _tokens.patchEdgeOnlyFS
        } else {
          FS[fsIndex++] = blendWireframeColor
            ? _tokens.edgeOnlyBlendFS
            : _tokens.edgeOnlyNoBlendFS
        }
      } else {
        if (isPrimTypeTris || isPrimTypePatchesBoxSplineTriangle) {
          FS[fsIndex++] = _tokens.patchEdgeTriangleFS
        } else {
          FS[fsIndex++] = _tokens.patchEdgeQuadFS
        }
        if (isPrimTypeRefinedMesh) {
          FS[fsIndex++] = _tokens.patchEdgeOnSurfFS
        } else {
          FS[fsIndex++] = _tokens.edgeOnSurfFS
        }
      }
    } else {
      FS[fsIndex++] = _tokens.edgeNoneFS
      FS[fsIndex++] = _tokens.edgeParamFS
    }

    // Shading terminal mixin
    let terminalFS: TfToken
    if (shadingTerminal === HdMeshReprDescTokens.surfaceShader) {
      terminalFS = _tokens.surfaceFS
    } else if (shadingTerminal === HdMeshReprDescTokens.surfaceShaderUnlit) {
      terminalFS = _tokens.surfaceUnlitFS
    } else if (shadingTerminal === HdMeshReprDescTokens.surfaceShaderSheer) {
      terminalFS = _tokens.surfaceSheerFS
    } else if (shadingTerminal === HdMeshReprDescTokens.surfaceShaderOutline) {
      terminalFS = _tokens.surfaceOutlineFS
    } else if (shadingTerminal === HdMeshReprDescTokens.constantColor) {
      terminalFS = _tokens.constantColorFS
    } else if (shadingTerminal === HdMeshReprDescTokens.hullColor) {
      terminalFS = _tokens.hullColorFS
    } else if (shadingTerminal === HdMeshReprDescTokens.pointColor) {
      if (pointsShadingEnabled) {
        // Let points be affected by the associated material so as to appear
        // coherent with the other shaded surfaces that may be part of this
        // mesh.
        terminalFS = _tokens.pointShadedFS
      } else {
        terminalFS = _tokens.pointColorFS
      }
    } else if (shadingTerminal.length !== 0) {
      terminalFS = shadingTerminal
    } else {
      terminalFS = _tokens.surfaceFS
    }

    // Common must be first as it defines terminal interfaces
    FS[fsIndex++] = _tokens.commonFS
    FS[fsIndex++] = terminalFS

    FS[fsIndex++] = enableScalarOverride ? _tokens.scalarOverrideFS
      : _tokens.noScalarOverrideFS

    // EdgeId mixin(s) for edge picking and selection
    // Note: When rendering a mesh as points, we handle this in code gen.
    if (renderWireframe || renderEdges || renderSurfaceEdgeIds) {
      FS[fsIndex++] = _tokens.edgeIdCommonFS
      if (isPrimTypeTris || isPrimTypePatchesBoxSplineTriangle) {
        if (this.polygonMode === HdPolygonMode.HdPolygonModeLine) {
          FS[fsIndex++] = _tokens.edgeIdTriangleLineFS
        } else {
          FS[fsIndex++] = _tokens.edgeIdTriangleSurfFS
        }
        FS[fsIndex++] = _tokens.edgeIdTriangleParamFS
      } else {
        if (this.polygonMode === HdPolygonMode.HdPolygonModeLine) {
          FS[fsIndex++] = _tokens.edgeIdQuadLineFS
        } else {
          FS[fsIndex++] = _tokens.edgeIdQuadSurfFS
        }
        FS[fsIndex++] = _tokens.edgeIdQuadParamFS
      }
    } else if (!isPrimTypePoints) {
      FS[fsIndex++] = _tokens.edgeIdNoneFS
    }

    // PointId mixin for point picking and selection
    if (isPrimTypePoints) {
      FS[fsIndex++] = _tokens.pointIdFS
      FS[fsIndex++] = nativeRoundPoints ? _tokens.noDiskSampleMaskFS
        : _tokens.diskSampleMaskFS
    } else {
      FS[fsIndex++] = _tokens.pointIdFallbackFS
      FS[fsIndex++] = _tokens.noDiskSampleMaskFS
    }

    FS[fsIndex++] = hasTopologicalVisibility ? _tokens.topVisFS
      : _tokens.topVisFallbackFS

    // Triangles
    if (isPrimTypeTris && ptvsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordTrianglePTVSFS
    } else if (isPrimTypeTris && !gsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordTriangleFS

    // Quads
    } else if (isPrimTypeQuads && ptvsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordQuadPTVSFS
    } else if (isPrimTypeQuads && !gsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordQuadFS

    // TriQuads
    } else if (isPrimTypeTriQuads && ptvsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordTriQuadPTVSFS
    } else if (isPrimTypeTriQuads) {
      FS[fsIndex++] = _tokens.mainPatchCoordTriQuadFS

    // Patches
    } else if (isPrimTypePatches && ptvsStageEnabled) {
      FS[fsIndex++] = _tokens.mainPatchCoordTessFS
    // Points/No GS
    } else if (isPrimTypePoints || canSkipGS) {
      FS[fsIndex++] = _tokens.mainPatchCoordNoGSFS
    } else {
      FS[fsIndex++] = _tokens.mainPatchCoordFS
    }

    FS[fsIndex++] = _tokens.mainFS
    FS[fsIndex] = TfToken()
  }

  /** meshShaderKey.h:62 */
  override getCullStyle(): HdCullStyle { return this.cullStyle }
  /** meshShaderKey.h:63-65 */
  override UseHardwareFaceCulling(): boolean {
    return this.useHardwareFaceCulling
  }
  /** meshShaderKey.h:66-68 */
  override HasMirroredTransform(): boolean {
    return this.hasMirroredTransform
  }
  /** meshShaderKey.h:69-71 */
  override isDoubleSided(): boolean {
    return this.doubleSided
  }
  /** meshShaderKey.h:72-74 */
  override UseMetalTessellation(): boolean {
    return this.useMetalTessellation
  }
  /** meshShaderKey.h:75 */
  override getPolygonMode(): HdPolygonMode { return this.polygonMode }
  /** meshShaderKey.h:76 */
  override getLineWidth(): number { return this.lineWidth }
  /** meshShaderKey.h:77-79 */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return this.primType
  }
  /** meshShaderKey.h:80-82 */
  override getFvarPatchType(): HdSt_GeometricShaderFvarPatchType {
    return this.fvarPatchType
  }

  /** meshShaderKey.h:94-101 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  override getTCS(): readonly TfToken[] { return this.TCS }
  override getTES(): readonly TfToken[] { return this.TES }
  override getPTCS(): readonly TfToken[] { return this.PTCS }
  override getPTVS(): readonly TfToken[] { return this.PTVS }
  override getGS(): readonly TfToken[] { return this.GS }
  override getFS(): readonly TfToken[] { return this.FS }
}
