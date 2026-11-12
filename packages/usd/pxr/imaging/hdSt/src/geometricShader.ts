// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/geometricShader.cpp,
//  pxr/imaging/hdSt/geometricShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/geometricShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The nested enums PrimitiveType and FvarPatchType are module enums
//   (HdSt_GeometricShaderPrimitiveType, HdSt_GeometricShaderFvarPatchType),
//   also reachable as HdSt_GeometricShader.PrimitiveType / .FvarPatchType.
// - The static IsPrimType*(primType) queries and the member IsPrimType*()
//   queries share names, as upstream's overloads do (static vs instance).
// - HDST_DUMP_GLSLFX_CONFIG prints through TfDebug's output instead of
//   std::cout.

import { Token as TfToken, HashCombine as TfHashCombine, Debug as TfDebug } from 'typescript-usd/tf'
import { CullStyle as HdCullStyle, PolygonMode as HdPolygonMode } from 'typescript-usd/hd'
import { HgiCullMode, HgiPrimitiveType } from 'typescript-usd/hgi'
import { HioGlslfx, HioGlslfxInputStream } from 'typescript-usd/hio'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { HdStBindingRequest } from './binding.ts'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStShaderCode, type HdStShaderCodeID } from './shaderCode.ts'
import type { HdSt_ShaderKey } from './shaderKey.ts'

/** HdSt_GeometricShader::PrimitiveType (geometricShader.h:42-57). Used in
 *  HdSt_CodeGen to generate the appropriate shader source. */
export enum HdSt_GeometricShaderPrimitiveType {
  PRIM_POINTS,
  PRIM_BASIS_CURVES_LINES,     // when linear (or) non-refined cubic
  PRIM_BASIS_CURVES_LINEAR_PATCHES,  // refined linear curves
  PRIM_BASIS_CURVES_CUBIC_PATCHES,   // refined cubic curves
  PRIM_MESH_COARSE_TRIANGLES,
  PRIM_MESH_REFINED_TRIANGLES, // e.g: loop subdiv
  PRIM_MESH_COARSE_QUADS,      // e.g: quadrangulation for ptex
  PRIM_MESH_REFINED_QUADS,     // e.g: catmark/bilinear subdiv
  PRIM_MESH_COARSE_TRIQUADS,   // e.g: triangulated quadrangulation
  PRIM_MESH_REFINED_TRIQUADS,  // e.g: triangulated catmark/bilinear
  PRIM_MESH_BSPLINE,           // e.g. catmark limit surface patches
  PRIM_MESH_BOXSPLINETRIANGLE, // e.g. loop limit surface patches
  PRIM_VOLUME,                 // Triangles of bounding box of a volume.
  PRIM_COMPUTE,                // A compute shader, e.g frustum culling
}

/** HdSt_GeometricShader::FvarPatchType (geometricShader.h:126-134).
 *  Face-varying patch type. */
export enum HdSt_GeometricShaderFvarPatchType {
  PATCH_COARSE_TRIANGLES,
  PATCH_REFINED_TRIANGLES,
  PATCH_COARSE_QUADS,
  PATCH_REFINED_QUADS,
  PATCH_BSPLINE,
  PATCH_BOXSPLINETRIANGLE,
  PATCH_NONE,
}

const PT = HdSt_GeometricShaderPrimitiveType

/** HdInstance<HdSt_GeometricShaderSharedPtr> as returned by
 *  HdStResourceRegistry::RegisterGeometricShader (hd/instanceRegistry.h). */

/** geometricShader.h:30-292. Storm breaks down the concept of a shader
 *  program into distinct conceptual pieces that are then stitched together
 *  during code generation. The pieces are: geometric shader, material
 *  shader, lighting shader, render pass shader. */
export class HdSt_GeometricShader extends HdStShaderCode {
  static readonly PrimitiveType = HdSt_GeometricShaderPrimitiveType
  static readonly FvarPatchType = HdSt_GeometricShaderFvarPatchType

  private _primType: HdSt_GeometricShaderPrimitiveType
  private _cullStyle: HdCullStyle
  private _useHardwareFaceCulling: boolean
  private _hasMirroredTransform: boolean
  private _doubleSided: boolean
  private _useMetalTessellation: boolean
  private _polygonMode: HdPolygonMode
  private _lineWidth: number
  private _vertexCountFallback: number
  private readonly _depthQualifier: TfToken
  private _useHardwareClipPlanes: boolean

  private _glslfx: HioGlslfx
  private _frustumCullingPass: boolean
  private _fvarPatchType: HdSt_GeometricShaderFvarPatchType
  private _hash: HdStShaderCodeID

  // static query functions for PrimitiveType (geometricShader.h:60-124)

  /** geometricShader.h:60-62 */
  static isPrimTypePoints(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return primType === PT.PRIM_POINTS
  }

  /** geometricShader.h:64-68 */
  static isPrimTypeBasisCurves(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_BASIS_CURVES_LINES ||
      primType === PT.PRIM_BASIS_CURVES_CUBIC_PATCHES ||
      primType === PT.PRIM_BASIS_CURVES_LINEAR_PATCHES)
  }

  /** geometricShader.h:70-79 */
  static isPrimTypeMesh(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_MESH_COARSE_TRIANGLES ||
      primType === PT.PRIM_MESH_REFINED_TRIANGLES ||
      primType === PT.PRIM_MESH_COARSE_QUADS ||
      primType === PT.PRIM_MESH_REFINED_QUADS ||
      primType === PT.PRIM_MESH_COARSE_TRIQUADS ||
      primType === PT.PRIM_MESH_REFINED_TRIQUADS ||
      primType === PT.PRIM_MESH_BSPLINE ||
      primType === PT.PRIM_MESH_BOXSPLINETRIANGLE)
  }

  /** geometricShader.h:81-85 */
  static isPrimTypeTriangles(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_MESH_COARSE_TRIANGLES ||
      primType === PT.PRIM_MESH_REFINED_TRIANGLES ||
      primType === PT.PRIM_VOLUME)
  }

  /** geometricShader.h:87-90 */
  static isPrimTypeQuads(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_MESH_COARSE_QUADS ||
      primType === PT.PRIM_MESH_REFINED_QUADS)
  }

  /** geometricShader.h:92-95 */
  static isPrimTypeTriQuads(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_MESH_COARSE_TRIQUADS ||
      primType === PT.PRIM_MESH_REFINED_TRIQUADS)
  }

  /** geometricShader.h:97-103 */
  static isPrimTypeRefinedMesh(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return (primType === PT.PRIM_MESH_REFINED_TRIANGLES ||
      primType === PT.PRIM_MESH_REFINED_QUADS ||
      primType === PT.PRIM_MESH_REFINED_TRIQUADS ||
      primType === PT.PRIM_MESH_BSPLINE ||
      primType === PT.PRIM_MESH_BOXSPLINETRIANGLE)
  }

  /** geometricShader.h:105-110 */
  static isPrimTypePatches(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return primType === PT.PRIM_MESH_BSPLINE ||
      primType === PT.PRIM_MESH_BOXSPLINETRIANGLE ||
      primType === PT.PRIM_BASIS_CURVES_CUBIC_PATCHES ||
      primType === PT.PRIM_BASIS_CURVES_LINEAR_PATCHES
  }

  /** geometricShader.h:112-114 */
  static isPrimTypeCompute(primType: HdSt_GeometricShaderPrimitiveType): boolean {
    return primType === PT.PRIM_COMPUTE
  }

  /** geometricShader.cpp:24-79 */
  constructor(
    glslfxString: string,
    primType: HdSt_GeometricShaderPrimitiveType,
    cullStyle: HdCullStyle,
    useHardwareFaceCulling: boolean,
    hasMirroredTransform: boolean,
    doubleSided: boolean,
    useMetalTessellation: boolean,
    polygonMode: HdPolygonMode,
    cullingPass: boolean,
    fvarPatchType: HdSt_GeometricShaderFvarPatchType,
    debugId: SdfPath | null = null,
    lineWidth = 0,
    vertexCountFallback = 0,
    depthQualifier: TfToken = TfToken(),
    useHardwareClipPlanes = true,
  ) {
    super()
    this._primType = primType
    this._cullStyle = cullStyle
    this._useHardwareFaceCulling = useHardwareFaceCulling
    this._hasMirroredTransform = hasMirroredTransform
    this._doubleSided = doubleSided
    this._useMetalTessellation = useMetalTessellation
    this._polygonMode = polygonMode
    this._lineWidth = lineWidth
    this._vertexCountFallback = vertexCountFallback
    this._depthQualifier = depthQualifier
    this._useHardwareClipPlanes = useHardwareClipPlanes
    this._frustumCullingPass = cullingPass
    this._fvarPatchType = fvarPatchType
    this._hash = 0n

    // XXX
    // we will likely move this (the constructor or the entire class) into
    // the base class (HdStShaderCode) at the end of refactoring, to be able to
    // use same machinery other than geometric shaders.

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_DUMP_GLSLFX_CONFIG)) {
      TfDebug.msg(HdStDebugCodes.HDST_DUMP_GLSLFX_CONFIG,
        `${debugId ? debugId.pathString : ''}\n${glslfxString}\n`)
    }

    // std::stringstream ss(glslfxString); new HioGlslfx(ss)
    this._glslfx = _HioGlslfxFromString(glslfxString)
    this._hash = TfHashCombine(
      this._hash,
      this._glslfx.getHash(),
      cullingPass,
      primType,
      cullStyle,
      useMetalTessellation,
      fvarPatchType,
    )
    //
    // note: Don't include polygonMode into the hash.
    //       It is independent from the GLSL program.
    //
  }

  /** geometricShader.cpp:83-88 */
  protected override _getGlslfx(): HioGlslfx | null {
    return this._glslfx
  }

  /** geometricShader.cpp:90-149. Resolve the cull mode from the cull style
   *  in the render state.
   *  Note: The geometric shader may override the state if necessary,
   *  including disabling h/w culling altogether.  This is required to handle
   *  instancing since instanceScale / instanceTransform can flip the xform
   *  handedness. */
  resolveCullMode(renderStateCullStyle: HdCullStyle): HgiCullMode {
    if (!this._useHardwareFaceCulling) {
      // Use fragment shader culling via discard.
      return HgiCullMode.HgiCullModeNone
    }

    // If the Rprim has an opinion, that wins, else use the render state style.
    const resolvedCullStyle =
      this._cullStyle === HdCullStyle.HdCullStyleDontCare
        ? renderStateCullStyle : this._cullStyle

    let resolvedCullMode = HgiCullMode.HgiCullModeNone

    switch (resolvedCullStyle) {
      case HdCullStyle.HdCullStyleFront:
        if (this._hasMirroredTransform) {
          resolvedCullMode = HgiCullMode.HgiCullModeBack
        } else {
          resolvedCullMode = HgiCullMode.HgiCullModeFront
        }
        break
      case HdCullStyle.HdCullStyleFrontUnlessDoubleSided:
        if (!this._doubleSided) {
          if (this._hasMirroredTransform) {
            resolvedCullMode = HgiCullMode.HgiCullModeBack
          } else {
            resolvedCullMode = HgiCullMode.HgiCullModeFront
          }
        }
        break
      case HdCullStyle.HdCullStyleBack:
        if (this._hasMirroredTransform) {
          resolvedCullMode = HgiCullMode.HgiCullModeFront
        } else {
          resolvedCullMode = HgiCullMode.HgiCullModeBack
        }
        break
      case HdCullStyle.HdCullStyleBackUnlessDoubleSided:
        if (!this._doubleSided) {
          if (this._hasMirroredTransform) {
            resolvedCullMode = HgiCullMode.HgiCullModeFront
          } else {
            resolvedCullMode = HgiCullMode.HgiCullModeBack
          }
        }
        break
      case HdCullStyle.HdCullStyleNothing:
      default:
        resolvedCullMode = HgiCullMode.HgiCullModeNone
        break
    }

    return resolvedCullMode
  }

  /** geometricShader.cpp:151-156 */
  override computeHash(): HdStShaderCodeID {
    return this._hash
  }

  /** geometricShader.cpp:158-163 */
  override getSource(shaderStageKey: TfToken): string {
    return this._glslfx.getSource(shaderStageKey)
  }

  /** geometricShader.cpp:165-170 */
  override bindResources(_program: number, _binder: HdSt_ResourceBinder): void {
    // no-op
  }

  /** geometricShader.cpp:172-177 */
  override unbindResources(_program: number, _binder: HdSt_ResourceBinder): void {
    // no-op
  }

  /** geometricShader.cpp:179-184 */
  override addBindings(_customBindings: HdStBindingRequest[]): void {
    // no-op
  }

  /** geometricShader.h:158-161. Returns true if this geometric shader is
   *  used for GPU frustum culling. */
  isFrustumCullingPass(): boolean {
    return this._frustumCullingPass
  }

  /** geometricShader.h:163-165 */
  getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return this._primType
  }

  /** geometricShader.h:167-169 */
  getUseMetalTessellation(): boolean {
    return this._useMetalTessellation
  }

  /** geometricShader.h:171-173 */
  getLineWidth(): number {
    return this._lineWidth
  }

  /** geometricShader.h:175-177 */
  getPolygonMode(): HdPolygonMode {
    return this._polygonMode
  }

  /** geometricShader.h:179-181 */
  getVertexCountFallback(): number {
    return this._vertexCountFallback
  }

  /** geometricShader.h:183-185 */
  getDepthQualifier(): TfToken {
    return this._depthQualifier
  }

  /** geometricShader.h:187-189 */
  getUseHardwareClipPlanes(): boolean {
    return this._useHardwareClipPlanes
  }

  // member query functions for PrimitiveType (geometricShader.h:191-230)

  isPrimTypePoints(): boolean {
    return HdSt_GeometricShader.isPrimTypePoints(this._primType)
  }

  isPrimTypeBasisCurves(): boolean {
    return HdSt_GeometricShader.isPrimTypeBasisCurves(this._primType)
  }

  isPrimTypeMesh(): boolean {
    return HdSt_GeometricShader.isPrimTypeMesh(this._primType)
  }

  isPrimTypeTriangles(): boolean {
    return HdSt_GeometricShader.isPrimTypeTriangles(this._primType)
  }

  isPrimTypeQuads(): boolean {
    return HdSt_GeometricShader.isPrimTypeQuads(this._primType)
  }

  isPrimTypeTriQuads(): boolean {
    return HdSt_GeometricShader.isPrimTypeTriQuads(this._primType)
  }

  isPrimTypeRefinedMesh(): boolean {
    return HdSt_GeometricShader.isPrimTypeRefinedMesh(this._primType)
  }

  isPrimTypePatches(): boolean {
    return HdSt_GeometricShader.isPrimTypePatches(this._primType)
  }

  isPrimTypeCompute(): boolean {
    return HdSt_GeometricShader.isPrimTypeCompute(this._primType)
  }

  /** geometricShader.h:232-234 */
  getFvarPatchType(): HdSt_GeometricShaderFvarPatchType {
    return this._fvarPatchType
  }

  /** geometricShader.cpp:186-229. Returns the primitive index size based on
   *  the primitive type: 3 for triangles, 4 for quads, 16 for regular
   *  b-spline patches etc. */
  getPrimitiveIndexSize(): number {
    let primIndexSize = 1

    switch (this._primType) {
      case PT.PRIM_POINTS:
        primIndexSize = 1
        break
      case PT.PRIM_BASIS_CURVES_LINES:
      case PT.PRIM_BASIS_CURVES_LINEAR_PATCHES:
        primIndexSize = 2
        break
      case PT.PRIM_MESH_COARSE_TRIANGLES:
      case PT.PRIM_MESH_REFINED_TRIANGLES:
      case PT.PRIM_VOLUME:
        primIndexSize = 3
        break
      case PT.PRIM_BASIS_CURVES_CUBIC_PATCHES:
      case PT.PRIM_MESH_COARSE_QUADS:
      case PT.PRIM_MESH_REFINED_QUADS:
        primIndexSize = 4
        break
      case PT.PRIM_MESH_COARSE_TRIQUADS:
      case PT.PRIM_MESH_REFINED_TRIQUADS:
        primIndexSize = 6
        break
      case PT.PRIM_MESH_BSPLINE:
        primIndexSize = 16
        break
      case PT.PRIM_MESH_BOXSPLINETRIANGLE:
        primIndexSize = 12
        break
      case PT.PRIM_COMPUTE:
        primIndexSize = 0
        break
    }

    return primIndexSize
  }

  /** geometricShader.cpp:231-256. Returns the number of vertices output for
   *  patch evaluation, i.e. the number of tessellation control shader
   *  invocations. */
  getNumPatchEvalVerts(): number {
    let numPatchEvalVerts = 0

    switch (this._primType) {
      case PT.PRIM_BASIS_CURVES_LINEAR_PATCHES:
        numPatchEvalVerts = 2
        break
      case PT.PRIM_BASIS_CURVES_CUBIC_PATCHES:
        numPatchEvalVerts = 4
        break
      case PT.PRIM_MESH_BSPLINE:
        numPatchEvalVerts = 16
        break
      case PT.PRIM_MESH_BOXSPLINETRIANGLE:
        numPatchEvalVerts = 15
        break
      default:
        numPatchEvalVerts = 0
        break
    }

    return numPatchEvalVerts
  }

  /** geometricShader.cpp:258-292. Returns the primitive index size for the
   *  geometry shader shade: 1 for points, 2 for lines, 3 for triangles, 4
   *  for lines_adjacency. */
  getNumPrimitiveVertsForGeometryShader(): number {
    let numPrimVerts = 1

    switch (this._primType) {
      case PT.PRIM_POINTS:
        numPrimVerts = 1
        break
      case PT.PRIM_BASIS_CURVES_LINES:
        numPrimVerts = 2
        break
      case PT.PRIM_MESH_COARSE_TRIANGLES:
      case PT.PRIM_MESH_REFINED_TRIANGLES:
      case PT.PRIM_MESH_COARSE_TRIQUADS:
      case PT.PRIM_MESH_REFINED_TRIQUADS:
      case PT.PRIM_BASIS_CURVES_LINEAR_PATCHES:
      case PT.PRIM_BASIS_CURVES_CUBIC_PATCHES:
      case PT.PRIM_MESH_BSPLINE:
      case PT.PRIM_MESH_BOXSPLINETRIANGLE:
      // for patches with tesselation, input to GS is still a series of tris
      case PT.PRIM_VOLUME:
        numPrimVerts = 3
        break
      case PT.PRIM_MESH_COARSE_QUADS:
      case PT.PRIM_MESH_REFINED_QUADS:
        numPrimVerts = 4
        break
      case PT.PRIM_COMPUTE:
        numPrimVerts = 0
        break
    }

    return numPrimVerts
  }

  /** geometricShader.cpp:294-340. Returns the HgiPrimitiveType for the
   *  primitive type. */
  getHgiPrimitiveType(): HgiPrimitiveType {
    let primitiveType = HgiPrimitiveType.HgiPrimitiveTypePointList

    switch (this.getPrimitiveType()) {
      case PT.PRIM_POINTS:
        primitiveType = HgiPrimitiveType.HgiPrimitiveTypePointList
        break
      case PT.PRIM_BASIS_CURVES_LINES:
        primitiveType = HgiPrimitiveType.HgiPrimitiveTypeLineList
        break
      case PT.PRIM_MESH_COARSE_TRIANGLES:
      case PT.PRIM_MESH_REFINED_TRIANGLES:
      case PT.PRIM_MESH_COARSE_TRIQUADS:
      case PT.PRIM_MESH_REFINED_TRIQUADS:
        if (this.getUseMetalTessellation()) {
          primitiveType = HgiPrimitiveType.HgiPrimitiveTypePatchList
        } else {
          primitiveType = HgiPrimitiveType.HgiPrimitiveTypeTriangleList
        }
        break
      case PT.PRIM_VOLUME:
        primitiveType = HgiPrimitiveType.HgiPrimitiveTypeTriangleList
        break
      case PT.PRIM_MESH_COARSE_QUADS:
      case PT.PRIM_MESH_REFINED_QUADS:
        if (this.getUseMetalTessellation()) {
          primitiveType = HgiPrimitiveType.HgiPrimitiveTypePatchList
        } else {
          primitiveType = HgiPrimitiveType.HgiPrimitiveTypeLineListWithAdjacency
        }
        break
      case PT.PRIM_BASIS_CURVES_CUBIC_PATCHES:
      case PT.PRIM_BASIS_CURVES_LINEAR_PATCHES:
      case PT.PRIM_MESH_BSPLINE:
      case PT.PRIM_MESH_BOXSPLINETRIANGLE:
        primitiveType = HgiPrimitiveType.HgiPrimitiveTypePatchList
        break
      case PT.PRIM_COMPUTE:
        primitiveType = HgiPrimitiveType.HgiPrimitiveTypePointList
        break
    }

    return primitiveType
  }

  /** geometricShader.cpp:342-374. Factory for convenience. */
  static create(
    shaderKey: HdSt_ShaderKey,
    resourceRegistry: HdStResourceRegistry,
  ): HdSt_GeometricShader {
    // Use the shaderKey hash to deduplicate geometric shaders.
    const geometricShaderInstance =
      resourceRegistry.registerGeometricShader(shaderKey.computeHash())

    if (geometricShaderInstance.isFirstInstance()) {
      geometricShaderInstance.setValue(
        new HdSt_GeometricShader(
          shaderKey.getGlslfxString(),
          shaderKey.getPrimitiveType(),
          shaderKey.getCullStyle(),
          shaderKey.UseHardwareFaceCulling(),
          shaderKey.HasMirroredTransform(),
          shaderKey.isDoubleSided(),
          shaderKey.UseMetalTessellation(),
          shaderKey.getPolygonMode(),
          shaderKey.isFrustumCullingPass(),
          shaderKey.getFvarPatchType(),
          /*debugId=*/null,
          shaderKey.getLineWidth(),
          shaderKey.getVertexCountFallback(),
          shaderKey.getDepthQualifier(),
          shaderKey.useHardwareClipPlanes()))
    }
    return geometricShaderInstance.GetValue()!
  }
}
export type HdSt_GeometricShaderSharedPtr = HdSt_GeometricShader

/** HioGlslfx(std::istream &is) (hio/glslfx.h:118-121) on a string stream. */
function _HioGlslfxFromString(glslfxString: string): HioGlslfx {
  return new HioGlslfx(new HioGlslfxInputStream(glslfxString))
}
