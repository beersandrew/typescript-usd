// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/drawModeStandin.cpp,
//  pxr/usdImaging/usdImaging/drawModeStandin.h, pxr/usd/usdGeom/tokens.h
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/drawModeStandin.{h,cpp}
// (OpenUSD 26.11.1): UsdImaging_DrawModeStandin, the stand-in geometry
// (bounds, origin, cards) UsdImagingDrawModeSceneIndex uses in place of a prim
// with non-default draw mode.
//
// Divergences:
// - SdfPath is a string; MakeRelativePath/AppendPath/GetPathElementCount for
//   the relative paths a stand-in uses ("." and "name" or "name/child") are
//   the small _Sdf* helpers below.
// - UsdGeomTokens has no TS spelling in typescript-usd/usdGeom; the tokens
//   used here are the local _UsdGeomTokens (usdGeom/tokens.h values).
// - HD_DECLARE_DATASOURCE's New is a static New on each class.
// - _CardsDataCache::_GetCardsData uses std::atomic_load/store for thread
//   safety; JavaScript is single-threaded, so it is a plain member.
// - GetWorldToScreenFromImageMetadata opens each texture synchronously with
//   HioImage.OpenForReading, as upstream does; that open reads the asset Ar
//   read ahead (hio/src/hioImage.ts header). The stage reads every card
//   texture ahead while it opens and on flushChanges (cardTexturePrefetch.ts,
//   imported below). A texture nothing read ahead is reported by
//   HioImage.OpenForReading, and the card has no face, as for a texture that
//   cannot be opened.
// - OpenEXR's floatvector metadata has no defined native value (see
//   hio/src/openexrHioImage.ts); HioImage.GetMetadata throws for it, and
//   GetWorldToScreenFromImageMetadata reports the type the native value
//   holds ('int'), as upstream does.

import {
  BasisCurvesSchema as HdBasisCurvesSchema,
  BasisCurvesSchemaTokens as HdBasisCurvesSchemaTokens,
  BasisCurvesTopologySchema as HdBasisCurvesTopologySchema,
  BuiltinMaterialSchema as HdBuiltinMaterialSchema,
  ContainerDataSource as HdContainerDataSource,
  CullStyleTokens as HdCullStyleTokens,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ExtentSchema as HdExtentSchema,
  ExtentSchemaTokens as HdExtentSchemaTokens,
  GeomSubsetSchema as HdGeomSubsetSchema,
  GeomSubsetSchemaTokens as HdGeomSubsetSchemaTokens,
  GetContributingSampleTimesForInterval as HdGetContributingSampleTimesForInterval,
  InstancedBySchemaTokens as HdInstancedBySchemaTokens,
  LegacyDisplayStyleSchema as HdLegacyDisplayStyleSchema,
  LegacyDisplayStyleSchemaTokens as HdLegacyDisplayStyleSchemaTokens,
  MaterialBindingSchema as HdMaterialBindingSchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  MaterialConnectionSchema as HdMaterialConnectionSchema,
  MaterialNetworkSchema as HdMaterialNetworkSchema,
  MaterialNetworkSchemaTokens as HdMaterialNetworkSchemaTokens,
  MaterialNodeParameterSchema as HdMaterialNodeParameterSchema,
  MaterialNodeSchema as HdMaterialNodeSchema,
  MaterialNodeSchemaTokens as HdMaterialNodeSchemaTokens,
  MaterialSchema as HdMaterialSchema,
  MaterialSchemaTokens as HdMaterialSchemaTokens,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  MeshSchema as HdMeshSchema,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  PrimOriginSchemaTokens as HdPrimOriginSchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  PurposeSchemaTokens as HdPurposeSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VisibilitySchema as HdVisibilitySchema,
  VisibilitySchemaTokens as HdVisibilitySchemaTokens,
  XformSchemaTokens as HdXformSchemaTokens,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry as HdSceneIndexObserverAddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry as HdSceneIndexObserverDirtiedPrimEntry,
  RemovedPrimEntry as HdSceneIndexObserverRemovedPrimEntry,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import {
  Matrix4d as GfMatrix4d,
  Range3d as GfRange3d,
  Vec2f as GfVec2f,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import type { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { HioImage } from 'typescript-usd/hio'
import { Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, ValueTypes as VtValueTypes, type Value as VtValue } from 'typescript-usd/vt'
import './cardTexturePrefetch.ts'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from './geomModelSchema.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import { UsdImagingTokens } from './tokens.ts'
import { UsdImagingUsdUpAxisSchema, UsdImagingUsdUpAxisSchemaTokens } from './usdUpAxisSchema.ts'

type _AssetPathDataSource = HdTypedSampledDataSource<SdfAssetPath>
type _Vec3fDataSource = HdTypedSampledDataSource<GfVec3f>

/** pxr/usd/usdGeom/tokens.h: the UsdGeomTokens used here. */
const _UsdGeomTokens = {
  bounds: 'bounds',
  origin: 'origin',
  cards: 'cards',
  box: 'box',
  cross: 'cross',
  fromTexture: 'fromTexture',
  simple: 'simple',
  x: 'X',
  y: 'Y',
  z: 'Z',
} as const

// ---------------------------------------------------------------------------
// SdfPath helpers for the relative paths of a stand-in.

/** SdfPath::ReflexiveRelativePath() */
const _reflexiveRelativePath = '.'
// VtIntArray (HdRetainedTypedSampledDataSource<VtIntArray>,
// drawModeStandin.cpp:1329-1334).
const _VtIntArrayType = TfType.declare('int[]')

/** SdfPath::MakeRelativePath(anchor) for path == anchor or a descendant. */
function _SdfMakeRelativePath(path: string, anchor: string): string {
  if (path === anchor) return _reflexiveRelativePath
  if (anchor === '/') return path.slice(1)
  if (path.startsWith(anchor + '/')) return path.slice(anchor.length + 1)
  // Not a descendant: upstream returns a path with '..' elements, which no
  // stand-in relative path matches.
  return '..'
}

/** SdfPath::AppendPath(relPath) */
function _SdfAppendPath(path: string, relPath: string): string {
  if (relPath === _reflexiveRelativePath) return path
  return path === '/' ? '/' + relPath : path + '/' + relPath
}

/** SdfPath::AppendChild(name) */
function _SdfAppendChild(path: string, name: string): string {
  return path === '/' ? '/' + name : path + '/' + name
}

/** SdfPath::GetPathElementCount() for a relative path. */
function _SdfRelativePathElementCount(relPath: string): number {
  if (relPath === _reflexiveRelativePath) return 0
  return relPath.split('/').length
}

/** SdfPath::GetNameToken() for a relative path. */
function _SdfRelativeNameToken(relPath: string): string {
  const i = relPath.lastIndexOf('/')
  return i < 0 ? relPath : relPath.slice(i + 1)
}

/** SdfPath::GetParentPath().GetNameToken() for a relative path. */
function _SdfRelativeParentNameToken(relPath: string): string {
  const i = relPath.lastIndexOf('/')
  return i < 0 ? '' : _SdfRelativeNameToken(relPath.slice(0, i))
}

/** Gf vector component; vector data sources may hold Gf objects or plain
 *  tuples (see dataSourceTypeDefs.ts). */
function _Comp(v: unknown, i: number): number {
  const gf = v as { get?: (i: number) => number }
  if (typeof gf.get === 'function') return gf.get(i)
  return (v as ArrayLike<number>)[i] ?? 0
}

/** dataSource.cpp:76-119 HdGetMergedContributingSampleTimesForInterval */
function _HdGetMergedContributingSampleTimesForInterval(
  inputDataSources: readonly (HdSampledDataSource | undefined)[],
  startTime: number, endTime: number, outSampleTimes: number[] | undefined,
): boolean {
  let result = false
  let sampleTimes: number[] = []
  for (const ds of inputDataSources) {
    if (!ds) continue
    const times: number[] = []
    if (!ds.GetContributingSampleTimesForInterval(startTime, endTime, times)) continue
    result = true
    if (!outSampleTimes) continue
    if (sampleTimes.length === 0) {
      sampleTimes = times
    } else {
      // dataSource.cpp:57-74 _Union
      sampleTimes = [...new Set([...sampleTimes, ...times])].sort((a, b) => a - b)
    }
  }
  if (!result) return false
  const r = HdGetContributingSampleTimesForInterval(
    sampleTimes.length, sampleTimes, startTime, endTime)
  if (outSampleTimes) outSampleTimes.splice(0, outSampleTimes.length, ...r.sampleTimes)
  return r.changing
}

////////////////////////////////////////////////////////////////////////////////
///
/// UsdImaging_DrawModeStandin implementation
///
////////////////////////////////////////////////////////////////////////////////

/** drawModeStandin.h:22-80: provides stand-in geometry for a prim with
 *  non-default draw mode. */
export abstract class UsdImaging_DrawModeStandin {
  /** drawModeStandin.h:66-72 */
  protected constructor(
    /** Path of original prim and prim replacing it. */
    protected readonly _path: string,
    protected readonly _primSource: HdContainerDataSource | undefined,
  ) {}

  abstract getDrawMode(): string

  /** drawModeStandin.cpp:67-72: get prims replacing the original prim. */
  getPrim(path: string): HdSceneIndexPrim {
    const relPath = _SdfMakeRelativePath(path, this._path)
    return { primType: this._getPrimType(relPath), dataSource: this._getPrimSource(relPath) }
  }

  /** drawModeStandin.cpp:74-84: get paths for all prims replacing the
   *  original prim (including the original prim path). */
  getPrimPaths(): string[] {
    const relPaths = this._getRelativePrimPaths()
    const result: string[] = []
    for (const relPath of relPaths) {
      result.push(_SdfAppendPath(this._path, relPath))
    }
    return result
  }

  /** drawModeStandin.cpp:86-95: compute added entries for the stand-in
   *  geometry. */
  computePrimAddedEntries(entries: HdSceneIndexObserverAddedPrimEntry[]): void {
    for (const relPath of this._getRelativePrimPaths()) {
      entries.push({
        primPath: _SdfAppendPath(this._path, relPath),
        primType: this._getPrimType(relPath) })
    }
  }

  /** drawModeStandin.cpp:97-102: compute removed entries for the stand-in
   *  geometry. */
  computePrimRemovedEntries(entries: HdSceneIndexObserverRemovedPrimEntry[]): void {
    entries.push({ primPath: this._path })
  }

  /** drawModeStandin.h:48-53: given dirty data source locators for the
   *  original prim, invalidate cached data and emit dirty entries for the
   *  stand-in geometry. `needsRefresh.value` is the bool out-parameter. */
  abstract processDirtyLocators(
    dirtyLocators: HdDataSourceLocatorSet,
    entries: HdSceneIndexObserverDirtiedPrimEntry[],
    needsRefresh: { value: boolean }): void

  /** Returns paths relative to the path of the prim the stand-in is
   *  replacing. Includes the path ".". */
  protected abstract _getRelativePrimPaths(): string[]
  /** Accepts path relative to the path of the prim the stand-in is
   *  replacing. */
  protected abstract _getPrimType(relPath: string): string
  /** Accepts path relative to the path of the prim the stand-in is
   *  replacing. */
  protected abstract _getPrimSource(relPath: string): HdContainerDataSource | undefined
}

////////////////////////////////////////////////////////////////////////////////
///
/// Helpers and data sources serving as building blocks or base classes.
///
////////////////////////////////////////////////////////////////////////////////

/** drawModeStandin.cpp:115-126 */
const _UsdUVTextureTokens = {
  fallback: 'fallback',
  file: 'file',
  st: 'st',
  wrapS: 'wrapS',
  wrapT: 'wrapT',
  rgb: 'rgb',
  a: 'a',
  clamp: 'clamp',
} as const

/** drawModeStandin.cpp:128-134 */
const _UsdPrimvarReaderTokens = {
  fallback: 'fallback',
  varname: 'varname',
  result: 'result',
} as const

/** drawModeStandin.cpp:136-142 */
const _UsdPreviewSurfaceTokens = {
  diffuseColor: 'diffuseColor',
  opacity: 'opacity',
  opacityThreshold: 'opacityThreshold',
} as const

/** drawModeStandin.cpp:144-152 */
function _Concat(a: readonly string[], b: readonly string[]): string[] {
  return [...a, ...b]
}

/** HdRetainedTypedSampledDataSource<TfToken>::New */
function _Token(token: string): HdRetainedTypedSampledDataSource<string> {
  return new HdRetainedTypedSampledDataSource(token, VtValueTypes.token)
}

/** HdRetainedTypedSampledDataSource<bool>::New */
function _Bool(value: boolean): HdRetainedTypedSampledDataSource<boolean> {
  return new HdRetainedTypedSampledDataSource(value, VtValueTypes.bool)
}

/** HdRetainedTypedSampledDataSource<float>::New */
function _Float(value: number): HdRetainedTypedSampledDataSource<number> {
  return new HdRetainedTypedSampledDataSource(value, VtValueTypes.float)
}

/** drawModeStandin.cpp:154-200: a vec3f color source constructed from a
 *  model schema and returning the schema's draw mode color.
 *
 *  Note that it is querying the drawModeColor from the schema each time,
 *  so we can use the same pointer to _DisplayColorVec3fDataSource even if
 *  model:drawModeColor was dirtied. */
class _DisplayColorVec3fDataSource extends HdTypedSampledDataSource<GfVec3f> {
  static new(schema: UsdImagingGeomModelSchema): _DisplayColorVec3fDataSource {
    return new _DisplayColorVec3fDataSource(schema)
  }

  private constructor(private readonly _schema: UsdImagingGeomModelSchema) { super() }

  getTypedValue(shutterOffset: number): GfVec3f {
    const src = this._schema.getDrawModeColor() as _Vec3fDataSource | undefined
    if (src) {
      const v = src.getTypedValue(shutterOffset)
      return v instanceof GfVec3f ? v : new GfVec3f(_Comp(v, 0), _Comp(v, 1), _Comp(v, 2))
    }
    return new GfVec3f(0.18, 0.18, 0.18)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    const src = this._schema.getDrawModeColor() as _Vec3fDataSource | undefined
    if (src) {
      return src.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
    }
    return false
  }
}

/** drawModeStandin.cpp:202-240: a vec4f wrapper around a HdVec3fDataSource,
 *  for use when a vec4f is needed, e.g., for the UsdUVTexture's
 *  input:fallback parameter. */
class _Vec4fFromVec3fDataSource extends HdTypedSampledDataSource<GfVec4f> {
  static new(source: _Vec3fDataSource, alpha: number): _Vec4fFromVec3fDataSource {
    return new _Vec4fFromVec3fDataSource(source, alpha)
  }

  private constructor(
    private readonly _vec3fSource: _Vec3fDataSource,
    private readonly _alpha: number,
  ) { super() }

  getTypedValue(shutterOffset: number): GfVec4f {
    const src = this._vec3fSource.getTypedValue(shutterOffset)
    return new GfVec4f(_Comp(src, 0), _Comp(src, 1), _Comp(src, 2), this._alpha)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return this._vec3fSource.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** drawModeStandin.cpp:242-292: a convenience data source implementing the
 *  primvar schema from a triple of primvar value, interpolation and role. */
class _PrimvarDataSource extends HdContainerDataSource {
  static new(
    primvarValueSrc: HdDataSourceBase | undefined, interpolation: string, role: string,
  ): _PrimvarDataSource {
    return new _PrimvarDataSource(primvarValueSrc, interpolation, role)
  }

  private constructor(
    private readonly _primvarValueSrc: HdDataSourceBase | undefined,
    private readonly _interpolation: string,
    private readonly _role: string,
  ) { super() }

  getNames(): string[] {
    return [HdPrimvarSchemaTokens.primvarValue,
      HdPrimvarSchemaTokens.interpolation,
      HdPrimvarSchemaTokens.role]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarSchemaTokens.primvarValue) {
      return this._primvarValueSrc
    }
    if (name === HdPrimvarSchemaTokens.interpolation) {
      return HdPrimvarSchema.buildInterpolationDataSource(this._interpolation)
    }
    if (name === HdPrimvarSchemaTokens.role) {
      return HdPrimvarSchema.buildRoleDataSource(this._role)
    }
    return undefined
  }
}

let _constantWidthsSrc: HdDataSourceBase | undefined
let _constantOpacitySrc: HdDataSourceBase | undefined

/** drawModeStandin.cpp:294-363: base class for container data sources
 *  providing primvars.
 *
 *  Provides primvars common to stand-in geometry:
 *  - width (constant)
 *  - displayOpacity (constant)
 *  - displayColor (computed by querying model:drawModeColor from the prim
 *    data source). */
class _PrimvarsDataSource extends HdContainerDataSource {
  protected constructor(protected readonly _primSource: HdContainerDataSource | undefined) { super() }

  getNames(): string[] {
    return [HdPrimvarsSchemaTokens.widths,
      HdTokens.displayColor,
      HdTokens.displayOpacity]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarsSchemaTokens.widths) {
      return _constantWidthsSrc ??= _PrimvarDataSource.new(
        HdRetainedTypedSampledDataSource.new<number[]>([1.0]),
        HdPrimvarSchemaTokens.constant,
        '')
    }
    if (name === HdTokens.displayColor) {
      // If the model:drawModeColor is dirtied on the input scene
      // index, we need to query the model again for the drawModeColor.
      //
      // If we stored a reference to the data source at
      // model:drawModeColor with the _PrimvarDataSource, we would need
      // to update that reference when model:drawModeColor is dirtied.
      //
      // Instead, we store the _DisplayColorVec3fDataSource with the
      // _PrimvarDataSource which pulls the drawModeColor from model
      // every time it is needed.
      return _PrimvarDataSource.new(
        _DisplayColorVec3fDataSource.new(
          UsdImagingGeomModelSchema.getFromParent(this._primSource)),
        HdPrimvarSchemaTokens.constant,
        HdPrimvarSchemaTokens.color)
    }
    if (name === HdTokens.displayOpacity) {
      return _constantOpacitySrc ??= _PrimvarDataSource.new(
        HdRetainedTypedSampledDataSource.new<number[]>([1.0]),
        HdPrimvarSchemaTokens.constant,
        '')
    }
    return undefined
  }
}

let _primDisplayStyleSrc: HdDataSourceBase | undefined

/** drawModeStandin.cpp:365-406: base class for prim data sources.
 *
 *  Provides:
 *  - xform (from the given prim data source)
 *  - purpose (from the given prim data source)
 *  - visibility (from the given prim data source)
 *  - displayStyle (constant)
 *  - primOrigin (HdPrimOriginSchema to map picking back to the USD prim) */
class _PrimDataSource extends HdContainerDataSource {
  protected constructor(protected readonly _primSource: HdContainerDataSource | undefined) { super() }

  getNames(): string[] {
    return [
      HdXformSchemaTokens.xform,
      HdPurposeSchemaTokens.purpose,
      HdVisibilitySchemaTokens.visibility,
      HdInstancedBySchemaTokens.instancedBy,
      HdLegacyDisplayStyleSchemaTokens.displayStyle,
      HdPrimOriginSchemaTokens.primOrigin]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdXformSchemaTokens.xform ||
        name === HdPurposeSchemaTokens.purpose ||
        name === HdVisibilitySchemaTokens.visibility ||
        name === HdInstancedBySchemaTokens.instancedBy ||
        name === HdPrimOriginSchemaTokens.primOrigin) {
      if (this._primSource) {
        return this._primSource.Get(name)
      }
      return undefined
    }
    if (name === HdLegacyDisplayStyleSchemaTokens.displayStyle) {
      return _primDisplayStyleSrc ??= new HdLegacyDisplayStyleSchema.Builder()
        .setCullStyle(_Token(HdCullStyleTokens.back))
        .setMaterialIsFinal(_Bool(true))
        .build()
    }
    return undefined
  }
}

/** HdBasisCurvesTopologySchema::Builder for a single linear segmented curve
 *  (drawModeStandin.cpp:527-556 and 735-758 share this shape). */
function _BuildCurvesTopology(curveIndices: number[]): HdContainerDataSource {
  const curveVertexCounts = [curveIndices.length]
  return new HdBasisCurvesTopologySchema.Builder()
    .setCurveVertexCounts(HdRetainedTypedSampledDataSource.new(curveVertexCounts))
    .setCurveIndices(HdRetainedTypedSampledDataSource.new(curveIndices))
    .setBasis(_Token(HdTokens.bezier))
    .setType(_Token(HdTokens.linear))
    .setWrap(_Token(HdTokens.segmented))
    .build()
}

namespace _BoundsDrawMode {

  ////////////////////////////////////////////////////////////////////////////////
  ///
  /// Implements stand-in for bounds draw mode.
  ///
  /// It is drawing the edges of a box (using basis curves) determined by the
  /// extents.
  ///
  ////////////////////////////////////////////////////////////////////////////////

  /** drawModeStandin.cpp:421-426 */
  const _primNameTokens = {
    boundsCurves: 'boundsCurves',
  } as const

  /** drawModeStandin.cpp:428-489: data source for
   *  primvars:points:primvarValue.
   *
   *  Computes 8 vertices of a box determined by extent of a given prim
   *  data source. */
  class _BoundsPointsPrimvarValueDataSource extends HdTypedSampledDataSource<VtArray<GfVec3f>> {
    static new(primSource: HdContainerDataSource | undefined): _BoundsPointsPrimvarValueDataSource {
      return new _BoundsPointsPrimvarValueDataSource(primSource)
    }

    private constructor(private readonly _primSource: HdContainerDataSource | undefined) { super() }

    getTypedValue(shutterOffset: number): VtArray<GfVec3f> {
      // Get extent from given prim source.
      const extentSchema = HdExtentSchema.getFromParent(this._primSource)

      const exts: GfVec3f[] = [new GfVec3f(0.0), new GfVec3f(0.0)]
      const minSrc = extentSchema.getMin()
      if (minSrc) {
        const v = minSrc.getTypedValue(shutterOffset)
        exts[0] = new GfVec3f(_Comp(v, 0), _Comp(v, 1), _Comp(v, 2))
      }
      const maxSrc = extentSchema.getMax()
      if (maxSrc) {
        const v = maxSrc.getTypedValue(shutterOffset)
        exts[1] = new GfVec3f(_Comp(v, 0), _Comp(v, 1), _Comp(v, 2))
      }

      // Compute 8 points on box.
      const pts: GfVec3f[] = []
      for (let j0 = 0; j0 < 2; j0++) {
        for (let j1 = 0; j1 < 2; j1++) {
          for (let j2 = 0; j2 < 2; j2++) {
            pts.push(new GfVec3f(exts[j0]!.get(0), exts[j1]!.get(1), exts[j2]!.get(2)))
          }
        }
      }

      return new VtArray<GfVec3f>(pts, VtValueTypes.GfVec3f)
    }

    GetContributingSampleTimesForInterval(
      startTime: number, endTime: number, outSampleTimes: number[],
    ): boolean {
      const extentSchema = HdExtentSchema.getFromParent(this._primSource)
      const srcs = [extentSchema.getMin(), extentSchema.getMax()] as (HdSampledDataSource | undefined)[]
      return _HdGetMergedContributingSampleTimesForInterval(
        srcs, startTime, endTime, outSampleTimes)
    }
  }

  /** drawModeStandin.cpp:491-525: data source for primvars.
   *
   *  Provides (on top of the base class):
   *  - points (using the above data source) */
  class _BoundsPrimvarsDataSource extends _PrimvarsDataSource {
    static new(primSource: HdContainerDataSource | undefined): _BoundsPrimvarsDataSource {
      return new _BoundsPrimvarsDataSource(primSource)
    }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _BoundsPrimvarsDataSource._names ??= _Concat(
        super.getNames(),
        [HdPrimvarsSchemaTokens.points])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdPrimvarsSchemaTokens.points) {
        return _PrimvarDataSource.new(
          _BoundsPointsPrimvarValueDataSource.new(this._primSource),
          HdPrimvarSchemaTokens.vertex,
          HdPrimvarSchemaTokens.point)
      }
      return super.Get(name)
    }
  }

  /** drawModeStandin.cpp:527-556 */
  function _ComputeBoundsTopology(): HdContainerDataSource {
    // Segments: CCW bottom face starting at (-x, -y, -z)
    //           CCW top face starting at (-x, -y, z)
    //           CCW vertical edges, starting at (-x, -y)
    const curveIndices = [
      /* bottom face */ 0, 4, 4, 6, 6, 2, 2, 0,
      /* top face */    1, 5, 5, 7, 7, 3, 3, 1,
      /* edge pairs */  0, 1, 4, 5, 6, 7, 2, 3]
    return _BuildCurvesTopology(curveIndices)
  }

  let _basisCurvesSrc: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:558-605: prim data source.
   *
   *  Provides (on top of the base class):
   *  - basisCurves (constant using above topology)
   *  - primvars (using above data source)
   *  - extent (from the original prim source) */
  class _BoundsPrimDataSource extends _PrimDataSource {
    static new(primSource: HdContainerDataSource | undefined): _BoundsPrimDataSource {
      return new _BoundsPrimDataSource(primSource)
    }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _BoundsPrimDataSource._names ??= _Concat(
        super.getNames(),
        [HdBasisCurvesSchemaTokens.basisCurves,
          HdPrimvarsSchemaTokens.primvars,
          HdExtentSchemaTokens.extent])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdBasisCurvesSchemaTokens.basisCurves) {
        return _basisCurvesSrc ??= new HdBasisCurvesSchema.Builder()
          .setTopology(_ComputeBoundsTopology())
          .build()
      }
      if (name === HdPrimvarsSchemaTokens.primvars) {
        return _BoundsPrimvarsDataSource.new(this._primSource)
      }
      if (name === HdExtentSchemaTokens.extent) {
        if (this._primSource) {
          return this._primSource.Get(name)
        }
        return undefined
      }
      return super.Get(name)
    }
  }

  let _colorLocator: HdDataSourceLocator | undefined
  let _pointsValue: HdDataSourceLocator | undefined
  let _displayColor: HdDataSourceLocator | undefined
  let _relativePrimPaths: string[] | undefined

  /** drawModeStandin.cpp:607-698: stand-in consisting of a basis curves prim
   *  called boundsCurves showing the edges of the box defined by extent. */
  export class _BoundsStandin extends UsdImaging_DrawModeStandin {
    constructor(path: string, primSource: HdContainerDataSource | undefined) {
      super(path, primSource)
    }

    processDirtyLocators(
      dirtyLocators: HdDataSourceLocatorSet,
      entries: HdSceneIndexObserverDirtiedPrimEntry[],
      _needsRefresh: { value: boolean },
    ): void {
      // Note that we do not remove the model locator from the dirty locators
      // we send to the scene index observer.

      // Check whether extent are dirty on input scene index
      const dirtyExtent = dirtyLocators.intersects(HdExtentSchema.getDefaultLocator())

      // Check whether model:drawModeColor is dirty.
      const colorLocator = _colorLocator ??=
        UsdImagingGeomModelSchema.getDefaultLocator().append(
          UsdImagingGeomModelSchemaTokens.drawModeColor)
      const dirtyColor = dirtyLocators.intersects(colorLocator)

      if (dirtyExtent || dirtyColor) {
        const primDirtyLocators = new HdDataSourceLocatorSet(dirtyLocators)
        if (dirtyExtent) {
          // Points depends on extent, so dirty it as well.
          primDirtyLocators.insert(_pointsValue ??=
            HdPrimvarsSchema.getPointsLocator().append(HdPrimvarSchemaTokens.primvarValue))
        }
        if (dirtyColor) {
          // Display color is given by model:drawModeColor, so
          // dirty it as well.
          primDirtyLocators.insert(_displayColor ??=
            HdPrimvarsSchema.getDefaultLocator().append(HdTokens.displayColor))
        }
        for (const path of this.getPrimPaths()) {
          entries.push({ primPath: path, dirtyLocators: primDirtyLocators })
        }
      } else {
        // Can just forward the dirty locators to the basis curves prim.
        for (const path of this.getPrimPaths()) {
          entries.push({ primPath: path, dirtyLocators })
        }
      }
    }

    getDrawMode(): string {
      return _UsdGeomTokens.bounds
    }

    protected _getRelativePrimPaths(): string[] {
      return _relativePrimPaths ??= [
        _reflexiveRelativePath,
        this._getRelativeDescendantPath()]
    }

    protected _getPrimType(relPath: string): string {
      if (relPath === this._getRelativeDescendantPath()) {
        return HdPrimTypeTokens.basisCurves
      }
      return ''
    }

    protected _getPrimSource(relPath: string): HdContainerDataSource | undefined {
      if (relPath === this._getRelativeDescendantPath()) {
        return _BoundsPrimDataSource.new(this._primSource)
      }
      return undefined
    }

    private _getRelativeDescendantPath(): string {
      return _primNameTokens.boundsCurves
    }
  }
}

namespace _OriginDrawMode {

  ////////////////////////////////////////////////////////////////////////////////
  ///
  /// Implements stand-in for origin draw mode.
  ///
  /// It is drawing three perpendicular line segments starting at the orgin with
  /// unit length.
  ///
  ////////////////////////////////////////////////////////////////////////////////

  /** drawModeStandin.cpp:713-718 */
  const _primNameTokens = {
    originCurves: 'originCurves',
  } as const

  let _pointsSrc: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:720-760: data source for primvars.
   *
   *  Provides (on top of the base class):
   *  - points (constant) */
  class _OriginPrimvarsDataSource extends _PrimvarsDataSource {
    static new(primSource: HdContainerDataSource | undefined): _OriginPrimvarsDataSource {
      return new _OriginPrimvarsDataSource(primSource)
    }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _OriginPrimvarsDataSource._names ??= _Concat(
        super.getNames(),
        [HdPrimvarsSchemaTokens.points])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdPrimvarsSchemaTokens.points) {
        return _pointsSrc ??= _PrimvarDataSource.new(
          HdRetainedTypedSampledDataSource.new(new VtArray<GfVec3f>([
            new GfVec3f(0, 0, 0),
            new GfVec3f(1, 0, 0),
            new GfVec3f(0, 1, 0),
            new GfVec3f(0, 0, 1)], VtValueTypes.GfVec3f)),
          HdPrimvarSchemaTokens.vertex,
          HdPrimvarSchemaTokens.point)
      }
      return super.Get(name)
    }
  }

  /** drawModeStandin.cpp:762-787 */
  function _ComputeOriginTopology(): HdContainerDataSource {
    // Origin: vertices are (0,0,0); (1,0,0); (0,1,0); (0,0,1)
    const curveIndices = [0, 1, 0, 2, 0, 3]
    return _BuildCurvesTopology(curveIndices)
  }

  let _basisCurvesSrc: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:789-836: prim data source.
   *
   *  Provides (on top of the base class):
   *  - basis curves (constant using above topology)
   *  - primvars (using above data source)
   *  - extent (from the original prim source) */
  class _OriginPrimDataSource extends _PrimDataSource {
    static new(primSource: HdContainerDataSource | undefined): _OriginPrimDataSource {
      return new _OriginPrimDataSource(primSource)
    }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _OriginPrimDataSource._names ??= _Concat(
        super.getNames(),
        [HdBasisCurvesSchemaTokens.basisCurves,
          HdPrimvarsSchemaTokens.primvars,
          HdExtentSchemaTokens.extent])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdBasisCurvesSchemaTokens.basisCurves) {
        return _basisCurvesSrc ??= new HdBasisCurvesSchema.Builder()
          .setTopology(_ComputeOriginTopology())
          .build()
      }
      if (name === HdPrimvarsSchemaTokens.primvars) {
        return _OriginPrimvarsDataSource.new(this._primSource)
      }
      if (name === HdExtentSchemaTokens.extent) {
        if (this._primSource) {
          return this._primSource.Get(name)
        }
        return undefined
      }
      return super.Get(name)
    }
  }

  let _colorLocator: HdDataSourceLocator | undefined
  let _displayColorValue: HdDataSourceLocator | undefined
  let _relativePrimPaths: string[] | undefined

  /** drawModeStandin.cpp:838-915: stand-in consisting of a basis curves prim
   *  called originCurves showing three perpendicular lines of unit length
   *  starting from the origin of the prim. */
  export class _OriginStandin extends UsdImaging_DrawModeStandin {
    constructor(path: string, primSource: HdContainerDataSource | undefined) {
      super(path, primSource)
    }

    processDirtyLocators(
      dirtyLocators: HdDataSourceLocatorSet,
      entries: HdSceneIndexObserverDirtiedPrimEntry[],
      _needsRefresh: { value: boolean },
    ): void {
      // Note that we do not remove the model locator from the dirty locators
      // we send to the observer.

      // Check whether model:drawModeColor is dirty.
      const colorLocator = _colorLocator ??=
        UsdImagingGeomModelSchema.getDefaultLocator().append(
          UsdImagingGeomModelSchemaTokens.drawModeColor)
      const dirtyColor = dirtyLocators.intersects(colorLocator)

      if (dirtyColor) {
        // Display color is given by model:drawModeColor, so
        // dirty it as well.
        const primDirtyLocators = new HdDataSourceLocatorSet(dirtyLocators)
        primDirtyLocators.insert(_displayColorValue ??=
          HdPrimvarsSchema.getDefaultLocator().append(HdTokens.displayColor))
        for (const path of this.getPrimPaths()) {
          entries.push({ primPath: path, dirtyLocators: primDirtyLocators })
        }
      } else {
        for (const path of this.getPrimPaths()) {
          entries.push({ primPath: path, dirtyLocators })
        }
      }
    }

    getDrawMode(): string {
      return _UsdGeomTokens.origin
    }

    protected _getRelativePrimPaths(): string[] {
      return _relativePrimPaths ??= [
        _reflexiveRelativePath,
        this._getRelativeDescendantPath()]
    }

    protected _getPrimType(relPath: string): string {
      if (relPath === this._getRelativeDescendantPath()) {
        return HdPrimTypeTokens.basisCurves
      }
      return ''
    }

    protected _getPrimSource(relPath: string): HdContainerDataSource | undefined {
      if (relPath === this._getRelativeDescendantPath()) {
        return _OriginPrimDataSource.new(this._primSource)
      }
      return undefined
    }

    private _getRelativeDescendantPath(): string {
      return _primNameTokens.originCurves
    }
  }
}

namespace _CardsDrawMode {

  /** drawModeStandin.cpp:921-925 */
  const _primNameTokens = {
    cardsMesh: 'cardsMesh',
  } as const

  /** drawModeStandin.cpp:927-932 */
  const _primvarNameTokens = {
    cardsUv: 'cardsUv',
    displayRoughness: 'displayRoughness',
  } as const

  /** drawModeStandin.cpp:934-939 */
  const _materialNodeNameTokens = {
    cardSurface: 'cardSurface',
    cardTexture: 'cardTexture',
    cardUvCoords: 'cardUvCoords',
  } as const

  /** drawModeStandin.cpp:941-946 */
  const _imageMetadataTokens = {
    worldtoscreen: 'worldtoscreen',
    worldToNDC: 'worldToNDC',
  } as const

  /** drawModeStandin.cpp:948-958: helper to produce, e.g., FooXPosBar. */
  function _AddAxesToNames(prefix: string, postfix: string): string[] {
    return [
      prefix + 'XPos' + postfix,
      prefix + 'YPos' + postfix,
      prefix + 'ZPos' + postfix,
      prefix + 'XNeg' + postfix,
      prefix + 'YNeg' + postfix,
      prefix + 'ZNeg' + postfix]
  }

  /** std::unordered_map<TfToken, HdContainerDataSourceHandle> */
  type _NameToContainer = Map<string, HdContainerDataSource>

  /** std::bitset<6> */
  class _Bitset6 {
    private readonly _bits: boolean[] = [false, false, false, false, false, false]
    get(i: number): boolean { return this._bits[i]! }
    set(i: number, value: boolean): void { this._bits[i] = value }
    setAll(): void { this._bits.fill(true) }
    count(): number { return this._bits.filter(b => b).length }
    none(): boolean { return this.count() === 0 }
  }

  /** drawModeStandin.cpp:1017-1053: a helper extracting values from
   *  UsdImagingGeomModelSchema.
   *
   *  Note that the order of the six given textures is assumed to be:
   *  XPos, YPos, ZPos, XNeg, YNeg, ZNeg.
   *
   *  Note that we store the values for cardGeometry, ... only for
   *  the sample at shutter offset 0.
   *
   *  So we do not support motion-blur for these attributes. */
  class _SchemaValues {
    /** Card geometry, that is box, cross, or fromTexture. */
    cardGeometry = ''
    /** For card geometry fromTexture, the worldToScreen matrix
     *  stored in the texture's metadata. */
    readonly worldToScreen: GfMatrix4d[] = [0, 1, 2, 3, 4, 5].map(() => new GfMatrix4d(1))
    /** Was a non-empty asset path authored for the texture. */
    readonly hasTexture = new _Bitset6()
    /** Do we draw the face of the box. */
    readonly hasFace = new _Bitset6()
    /** The texture asset paths. */
    readonly texturePaths: (_AssetPathDataSource | undefined)[] = []
    /** Data source providing the current drawModeColor.
     *
     *  Note that this is a pointer to _DisplayColorVec3fDataSource
     *  rather than the data source returned by model:drawModeColor.
     *  That way, we do not need to update the pointer stored here
     *  when model:drawModeColor gets dirtied. */
    readonly drawModeColor: _Vec3fDataSource

    /** drawModeStandin.cpp:1232-1310 */
    constructor(schema: UsdImagingGeomModelSchema, upAxis: string) {
      const cardGeometrySrc = schema.getCardGeometry()
      if (cardGeometrySrc) {
        this.cardGeometry = cardGeometrySrc.getTypedValue(0.0)
      }

      // texturePaths, hasTexture, and hasFace are all in this order:
      // [ XPos, YPos, ZPos, XNeg, YNeg, ZNeg ]

      const texturePaths = this.texturePaths
      texturePaths[0] = schema.getCardTextureXPos() as _AssetPathDataSource | undefined
      texturePaths[1] = schema.getCardTextureYPos() as _AssetPathDataSource | undefined
      texturePaths[2] = schema.getCardTextureZPos() as _AssetPathDataSource | undefined
      texturePaths[3] = schema.getCardTextureXNeg() as _AssetPathDataSource | undefined
      texturePaths[4] = schema.getCardTextureYNeg() as _AssetPathDataSource | undefined
      texturePaths[5] = schema.getCardTextureZNeg() as _AssetPathDataSource | undefined

      const hasTexture = this.hasTexture
      const hasFace = this.hasFace

      if (this.cardGeometry === _UsdGeomTokens.fromTexture) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            const k = i + 3 * j
            if (GetWorldToScreenFromImageMetadata(
              texturePaths[k], this.worldToScreen, k)) {
              hasTexture.set(k, true)
              hasFace.set(k, true)
            }
          }
        }
      } else {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            // k and l are indices of opposite faces of the box.
            const k = i + 3 * j
            const l = i + 3 * (1 - j)
            const src = texturePaths[k]
            if (src) {
              if (src.getTypedValue(0.0).getAssetPath() !== '') {
                hasTexture.set(k, true)
                // If we have a texture for one face, we also draw
                // the opposite face (using the same texture if only
                // one texture for a pair of opposite faces was
                // specified).
                hasFace.set(k, true)
                hasFace.set(l, true)
              }
            }
          }
        }
        // If no texture was given, force all faces drawing the box in the
        // draw mode color.
        if (hasFace.none()) {
          hasFace.setAll()
        }
      }

      const cardVisibilitySrc = schema.getCardVisibility()
      if (cardVisibilitySrc) {
        const cardVisibility = cardVisibilitySrc.getTypedValue(0.0)
        if (cardVisibility === _UsdGeomTokens.simple) {
          const upAxes = [_UsdGeomTokens.x, _UsdGeomTokens.y, _UsdGeomTokens.z]
          // upAxis == x is not valid, so loop starts from y
          for (let i = 1; i < 3; i++) {
            if (upAxis === upAxes[i]) {
              for (let j = 0; j < 2; j++) {
                const k = i + 3 * j
                hasTexture.set(k, false)
                hasFace.set(k, false)
              }
            }
          }
        }
      }

      this.drawModeColor = _DisplayColorVec3fDataSource.new(schema)
    }
  }

  /** drawModeStandin.cpp:1131-1146 */
  function _ConvertToMatrix(mvec: readonly number[], mat: GfMatrix4d): boolean {
    if (mvec.length === 16) {
      mat.Set(...mvec)
      return true
    }
    TF_WARN(`worldtoscreen metadata expected 16 values, got ${mvec.length}`)
    return false
  }

  /** The TfTypes GetWorldToScreenFromImageMetadata accepts
   *  (drawModeStandin.cpp:1214-1226). */
  const _matrixTypes = {
    floatVector: TfType.declare('vector<float>'),
    doubleVector: TfType.declare('vector<double>'),
    GfMatrix4f: TfType.declare('GfMatrix4f'),
    GfMatrix4d: VtValueTypes.GfMatrix4d,
  } as const

  /** HioImage::GetMetadata(key, &value) (image.h:155-158); the value
   *  OpenEXR's floatvector metadata stands for when its native value is
   *  undefined (see the header). */
  function _GetMetadata(img: HioImage, key: string): VtValue | { typeName: string } | null {
    try {
      return img.getMetadata(key)
    } catch (error) {
      const typeName = (error as { nativeTypeName?: unknown }).nativeTypeName
      if (typeof typeName === 'string') {
        return { typeName }
      }
      throw error
    }
  }

  /** drawModeStandin.cpp:1148-1230: open image to extract worldtoscreen
   *  matrix. `mats[index]` is the out-parameter. */
  function GetWorldToScreenFromImageMetadata(
    src: _AssetPathDataSource | undefined, mats: GfMatrix4d[], index: number,
  ): boolean {
    if (!src) {
      return false
    }

    const asset = src.getTypedValue(0.0)

    // If the literal path is empty, ignore this attribute.
    if (asset.getAssetPath() === '') {
      return false
    }

    let file = asset.getResolvedPath()
    // Fallback to the literal path if it couldn't be resolved.
    if (file === '') {
      file = asset.getAssetPath()
    }

    const img = HioImage.openForReading(file)
    if (!img) {
      return false
    }

    // Read the "worldtoscreen" metadata. This metadata specifies a 4x4
    // matrix but may be given as any the following data types, since
    // some image formats may support certain metadata types but not others.
    //
    // - std::vector<float> or std::vector<double> with 16 elements
    //   in row major order.
    // - GfMatrix4f or GfMatrix4d
    //
    // XXX: OpenImageIO >= 2.2 no longer flips 'worldtoscreen' with
    // 'worldToNDC' on read and write, so assets where 'worldtoscreen' was
    // written with > 2.2 have 'worldToNDC' actually in the metadata, and OIIO
    // < 2.2 would read and return 'worldToNDC' from the file in response to a
    // request for 'worldtoscreen'. OIIO >= 2.2 no longer does either, so
    // 'worldtoscreen' gets written as 'worldtoscreen' and returned when asked
    // for 'worldtoscreen'. Issues only arise when trying to read
    // 'worldtoscreen' from an asset written with OIIO < 2.2, when the
    // authoring program told OIIO to write it as 'worldtoscreen'. Old OIIO
    // flipped it to 'worldToNDC'. So new OIIO needs to read 'worldToNDC' to
    // retrieve it.
    //
    // See https://github.com/OpenImageIO/oiio/pull/2609
    //
    // OIIO's change is correct -- the two metadata matrices have different
    // semantic meanings, and should not be conflated. Unfortunately, users
    // will have to continue to conflate them for a while as assets
    // transition into vfx2022 (which uses OIIO 2.3). So we will need to check
    // for both.
    let worldtoscreen = _GetMetadata(img, _imageMetadataTokens.worldtoscreen)
    if (!worldtoscreen) {
      worldtoscreen = _GetMetadata(img, _imageMetadataTokens.worldToNDC)
      if (worldtoscreen) {
        TF_WARN(`The texture asset '${file}' may have been authored by an ` +
          'earlier version of the VFX toolset. To silence this warning, ' +
          'please regenerate the asset with the current toolset.')
      } else {
        TF_WARN(`The texture asset '${file}' lacks a worldtoscreen matrix in ` +
          'metadata. Cards draw mode may not appear as expected.')
        return false
      }
    }

    if (!('typeName' in worldtoscreen)) {
      const mat = mats[index]!
      if (worldtoscreen.IsHolding(_matrixTypes.floatVector) ||
          worldtoscreen.IsHolding(_matrixTypes.doubleVector)) {
        return _ConvertToMatrix(worldtoscreen.UncheckedGet<number[]>(), mat)
      } else if (worldtoscreen.IsHolding(_matrixTypes.GfMatrix4f) ||
                 worldtoscreen.IsHolding(_matrixTypes.GfMatrix4d)) {
        // GfMatrix4d(GfMatrix4f) and GfMatrix4d hold the same row-major
        // values.
        mat.Set(...worldtoscreen.UncheckedGet<{ GetArray(): ArrayLike<number> }>().GetArray() as
          Parameters<GfMatrix4d['Set']>)
        return true
      }
    }
    TF_WARN(`worldtoscreen metadata holding unexpected type '${
      'typeName' in worldtoscreen ? worldtoscreen.typeName : worldtoscreen.getTypeName()}'`)
    return false
  }

  /** drawModeStandin.cpp:1312-1320 */
  function _Range(n: number): number[] {
    const result: number[] = []
    for (let i = 0; i < n; i++) {
      result.push(i)
    }
    return result
  }

  /** drawModeStandin.cpp:1322-1340: creates topology consisting of a quad
   *  spanned by vertices 0, 1, 2, 3 and 4, 5, 6, 7 ... and 4*(n-1),
   *  4*(n-1)+1, 4*(n-1)+2, 4*(n-1)+3. */
  function _DisjointQuadTopology(n: number): HdContainerDataSource {
    return new HdMeshTopologySchema.Builder()
      .setFaceVertexCounts(
        new HdRetainedTypedSampledDataSource(new Array<number>(n).fill(4), _VtIntArrayType))
      .setFaceVertexIndices(
        new HdRetainedTypedSampledDataSource(_Range(4 * n), _VtIntArrayType))
      .setOrientation(_Token(HdMeshTopologySchemaTokens.rightHanded))
      .build()
  }

  /** drawModeStandin.cpp:1356-1371 */
  function _Transform(v: GfVec3f, i: number): GfVec3f {
    switch (i) {
      default: // Make compiler happy
      case 0:
        // For x-axis, quad is already in correct configuration.
        return v
      case 1:
        // For y-axis, we rotate by 90 degrees about z-axis.
        return new GfVec3f(1.0 - v.get(1), v.get(0), v.get(2))
      case 2:
        // For z-axis, we rotate by 120 degrees about space diagonal.
        return new GfVec3f(v.get(1), v.get(2), v.get(0))
    }
  }

  /** GfVec3f a + s * GfVec3f::Axis(i) */
  function _AddAxis(a: GfVec3f, s: number, i: number): GfVec3f {
    return new GfVec3f(
      a.get(0) + (i === 0 ? s : 0),
      a.get(1) + (i === 1 ? s : 0),
      a.get(2) + (i === 2 ? s : 0))
  }

  /** drawModeStandin.cpp:1373-1458 */
  function _ComputePoints(values: _SchemaValues): GfVec3f[] {
    const points: GfVec3f[] = []

    // Points are pushed for faces (that exist) in this order:
    // [ XPos, XNeg, YPos, YNeg, ZPos, ZNeg ]

    if (values.cardGeometry === _UsdGeomTokens.fromTexture) {
      // This card geometry computes the points using the
      // metadata from the images.

      const pts = [
        new GfVec3f(1, -1, 0),
        new GfVec3f(-1, -1, 0),
        new GfVec3f(-1, 1, 0),
        new GfVec3f(1, 1, 0)]

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const k = i + 3 * j
          if (values.hasFace.get(k)) {
            const transform = values.worldToScreen[k]!.getInverse()
            for (let l = 0; l < 4; l++) {
              const p = pts[l]!
              const t = transform.Transform(new GfVec3d(p.get(0), p.get(1), p.get(2)))
              points.push(new GfVec3f(t.get(0), t.get(1), t.get(2)))
            }
          }
        }
      }
    } else {
      // Compute the points for the unit cube [0,1]x[0,1]x[0,1] here - the
      // _CardsPointsPrimvarValueDataSource will apply the extent.
      //
      // cardGeometry = box: draw the faces of that unit cube (here).
      // cardGeometry = cross: draw the orthogonal quads that divides the
      //                       unit cube in 8 equal cubes half-the size.
      //
      // For cardGeometry = cross, we draw two quads with the same vertices
      // but different orientations. We cull the back so that we do not see
      // z-fighting.

      // Start with the face of the cube parallel to the y-z-plane and with
      // outward-facing normal being the positive x-axis - or the quad parallel
      // to that face dividing the cube in two equal boxes.
      //
      const x = values.cardGeometry === _UsdGeomTokens.box ? 1.0 : 0.5

      // We need a small gap between the + and - cards when using cross
      // geometry to prevent coplanarity, which can cause floppiness in Prman.

      const eps =
        values.cardGeometry === _UsdGeomTokens.cross
          ? 2 ** -23 // 1.0 * 2^-23, approx 1.19e-7
          : 0.0
      const pts = [
        new GfVec3f(x, 1, 1),
        new GfVec3f(x, 0, 1),
        new GfVec3f(x, 0, 0),
        new GfVec3f(x, 1, 0)]

      // For each pair of opposite faces.
      for (let i = 0; i < 3; i++) {
        if (values.hasFace.get(i)) {
          // Process one face.
          for (let k = 0; k < 4; k++) {
            // Apply transform so that face is suitable for
            // required axis.
            points.push(_Transform(_AddAxis(pts[k]!, eps, i), i))
          }
        }
        if (values.hasFace.get(i + 3)) {
          // Process the opposite face.
          for (let k = 0; k < 4; k++) {
            // To obtain the opposite face, we apply the point
            // symmetry about the center of the box.
            // We also reverse the order of the points.
            const t = _Transform(_AddAxis(pts[3 - k]!, eps, i), i)
            points.push(new GfVec3f(1.0 - t.get(0), 1.0 - t.get(1), 1.0 - t.get(2)))
          }
        }
      }
    }

    return points
  }

  const _subsetNameTokens = _AddAxesToNames('subset', '')
  const _materialNameTokens = _AddAxesToNames('subsetMaterial', '')
  let _materialIsFinalDs: HdDataSourceBase | undefined
  let _subsetTypeSource: HdSampledDataSource | undefined
  let _trueSource: HdSampledDataSource | undefined

  /** drawModeStandin.cpp:1460-1563 */
  function _ComputeGeomSubsets(values: _SchemaValues, primPath: string): _NameToContainer {
    const subsets: _NameToContainer = new Map()

    const materialIsFinalDs = _materialIsFinalDs ??= new HdLegacyDisplayStyleSchema.Builder()
      .setMaterialIsFinal(_Bool(true))
      .build()

    // Do not generate subsets if there are no textures for any face.
    // The entire standin prim will use the renderer's fallback material, which
    // should pick up displayColor and displayOpacity.
    if (values.hasTexture.count()) {

      // The face index we need to build the geomSubset depends on the order
      // in which we created the faces when building the points and on which
      // faces actually got created. So we need to iterate through the faces
      // in the same order we used before, rather than the order of faces in
      // the values hasFace and hasTexture arrays. The index variable i in
      // this loop shall be the former, and vi will be the recovered index
      // into the values arrays.

      // Face insertion order: [x+,x-,y+,y-,z+,z-] (some may be skipped)
      // Face order in values: [x+,y+,z+,x-,y-,z-] (all are present)

      // Token order in materialNameTokens and subsetNameTokens
      // is the same as in values, so use vi to access those too.

      for (let i = 0; i < 6; i++) {
        const vi = (i % 2 === 0 ? 0 : 3) + Math.floor(i / 2)
        if (!values.hasFace.get(vi)) {
          continue
        }
        const typeSource = _subsetTypeSource ??=
          HdGeomSubsetSchema.buildTypeDataSource(HdGeomSubsetSchemaTokens.typeFaceSet)
        const trueSource = _trueSource ??= _Bool(true)
        const subsetIndex = subsets.size
        // use the opposite face's material if no texture for this face
        const mi = values.hasTexture.get(vi) ? vi : (vi + 3) % 6
        const materialBindingNames = [HdMaterialBindingsSchemaTokens.allPurpose]
        // geomSubset's materialBinding path must be absolute
        const materialPath = _SdfAppendChild(primPath, _materialNameTokens[mi]!)

        // Note that we use the hydra material bindings schema here (and
        // below) rather than UsdImagingDirectMaterialBinding(s)Schema.
        // We want these bindings to be unaffected by any USD material
        // bindings up-namespace.
        //
        const materialBindingSources = [
          new HdMaterialBindingSchema.Builder()
            .setPath(HdRetainedTypedSampledDataSource.new(materialPath))
            .build()]

        subsets.set(_subsetNameTokens[vi]!, HdRetainedContainerDataSource.new(
          [HdGeomSubsetSchema.getSchemaToken(),
            HdVisibilitySchema.getSchemaToken(),
            HdMaterialBindingsSchema.getSchemaToken(),
            HdLegacyDisplayStyleSchema.getSchemaToken()],
          [new HdGeomSubsetSchema.Builder()
            .setType(typeSource as never)
            .setIndices(HdRetainedTypedSampledDataSource.new([subsetIndex]))
            .build(),
          new HdVisibilitySchema.Builder()
            .setVisibility(trueSource as never)
            .build(),
          HdMaterialBindingsSchema.buildRetained(
            materialBindingNames,
            materialBindingSources),
          materialIsFinalDs]))
      }
    }

    return subsets
  }

  /** drawModeStandin.cpp:1565-1590 */
  function _ComputeExtent(cardGeometry: string, points: readonly GfVec3f[]): HdContainerDataSource | undefined {
    if (cardGeometry !== _UsdGeomTokens.fromTexture) {
      // box and cross get extent from original prim.
      return undefined
    }

    // Compute extent from points.
    const extent = new GfRange3d()
    for (const pt of points) {
      extent.unionWith(new GfVec3d(pt.get(0), pt.get(1), pt.get(2)))
    }

    return new HdExtentSchema.Builder()
      .setMin(new HdRetainedTypedSampledDataSource(extent.getMin(), VtValueTypes.GfVec3d) as never)
      .setMax(new HdRetainedTypedSampledDataSource(extent.getMax(), VtValueTypes.GfVec3d) as never)
      .build()
  }

  /** drawModeStandin.cpp:1592-1597 */
  function _GetUV(u: number, v: number, flipU: boolean, flipV: boolean): GfVec2f {
    return new GfVec2f(flipU ? 1.0 - u : u, flipV ? 1.0 - v : v)
  }

  /** drawModeStandin.cpp:1599-1607 */
  function _FillUVs(flipU: boolean, flipV: boolean, uvs: GfVec2f[]): void {
    uvs.push(_GetUV(1.0, 1.0, flipU, flipV))
    uvs.push(_GetUV(0.0, 1.0, flipU, flipV))
    uvs.push(_GetUV(0.0, 0.0, flipU, flipV))
    uvs.push(_GetUV(1.0, 0.0, flipU, flipV))
  }

  /** drawModeStandin.cpp:1609-1647 */
  function _ComputeUVs(values: _SchemaValues): GfVec2f[] {
    const uvs: GfVec2f[] = []

    if (values.cardGeometry === _UsdGeomTokens.fromTexture) {
      // fromTexture always uses same UVs.
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const k = i + 3 * j
          if (values.hasFace.get(k)) {
            _FillUVs(false, false, uvs)
          }
        }
      }
    } else {
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const k = i + 3 * j
          if (values.hasFace.get(k)) {
            // If we do not have a texture for this face of the
            // cube (or cross) and use the texture specified for
            // the opposite face, flip coordinates.
            _FillUVs(!values.hasTexture.get(k), false, uvs)
          }
        }
      }

      // z-Axis is treated with a similar idea, but a bit special.
      if (values.hasFace.get(2)) {
        _FillUVs(false, !values.hasTexture.get(2), uvs)
      }
      if (values.hasFace.get(5)) {
        _FillUVs(true, values.hasTexture.get(5), uvs)
      }
    }

    return uvs
  }

  /** drawModeStandin.cpp:1649-1662: compute a material connection to given
   *  output of given node. */
  function _ComputeConnection(nodeName: string, outputName: string): HdDataSourceBase {
    const srcs = [
      new HdMaterialConnectionSchema.Builder()
        .setUpstreamNodePath(_Token(nodeName))
        .setUpstreamNodeOutputName(_Token(outputName))
        .build()]
    return HdRetainedSmallVectorDataSource.new(srcs)
  }

  /** HdSampledDataSource::Cast */
  function _CastSampled(ds: HdDataSourceBase | undefined): HdSampledDataSource | undefined {
    return ds instanceof HdSampledDataSource ? ds : undefined
  }

  /** drawModeStandin.cpp:1664-1722: create texture reader node using cardsUv
   *  primvar for coordinates and the given data sources for the file path
   *  and fallback value (fallback value will be data source returning
   *  model:drawModeColor). */
  function _CardsTextureNode(
    file: _AssetPathDataSource | undefined, fallback: HdDataSourceBase,
  ): HdDataSourceBase {
    const inputConnectionNames = [_UsdUVTextureTokens.st]
    const inputConnections = [
      _ComputeConnection(
        _materialNodeNameTokens.cardUvCoords,
        _UsdPrimvarReaderTokens.result)]

    const paramsNames = [
      _UsdUVTextureTokens.wrapS,
      _UsdUVTextureTokens.wrapT,
      _UsdUVTextureTokens.fallback,
      _UsdUVTextureTokens.file,
      _UsdUVTextureTokens.st,
    ]
    const paramsValues = [
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(_Token(_UsdUVTextureTokens.clamp))
        .build(),
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(_Token(_UsdUVTextureTokens.clamp))
        .build(),
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(_CastSampled(fallback))
        .build(),
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(file)
        .build(),
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(_Token(_primvarNameTokens.cardsUv))
        .build(),
    ]

    return new HdMaterialNodeSchema.Builder()
      .setNodeIdentifier(_Token(UsdImagingTokens.UsdUVTexture))
      .setParameters(HdRetainedContainerDataSource.new(paramsNames, paramsValues))
      .setInputConnections(
        HdRetainedContainerDataSource.new(inputConnectionNames, inputConnections))
      .build()
  }

  let _surfaceNodeIdentifier: HdSampledDataSource | undefined
  let _one: HdDataSourceBase | undefined
  let _pointOne: HdDataSourceBase | undefined
  let _fallbackParam: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:1724-1781 */
  function _CardsSurfaceNode(hasTexture: boolean, fallback: HdDataSourceBase): HdDataSourceBase {
    const nodeIdentifier = _surfaceNodeIdentifier ??= _Token(UsdImagingTokens.UsdPreviewSurface)
    const one = _one ??= new HdMaterialNodeParameterSchema.Builder()
      .setValue(_Float(1.0))
      .build()
    const pointOne = _pointOne ??= new HdMaterialNodeParameterSchema.Builder()
      .setValue(_Float(0.1))
      .build()
    // Upstream caches this in a function-local static, so the first call's
    // fallback (that prim's drawModeColor data source) is used by every
    // later call; kept as is.
    const fallbackParam = _fallbackParam ??= new HdMaterialNodeParameterSchema.Builder()
      .setValue(_CastSampled(fallback))
      .build()

    const parameterNames: string[] = []
    const parameters: HdDataSourceBase[] = []
    const inputConnectionNames: string[] = []
    const inputConnections: HdDataSourceBase[] = []

    if (hasTexture) {
      inputConnectionNames.push(_UsdPreviewSurfaceTokens.diffuseColor)
      inputConnections.push(_ComputeConnection(
        _materialNodeNameTokens.cardTexture,
        _UsdUVTextureTokens.rgb))
      inputConnectionNames.push(_UsdPreviewSurfaceTokens.opacity)
      inputConnections.push(_ComputeConnection(
        _materialNodeNameTokens.cardTexture,
        _UsdUVTextureTokens.a))

      // opacityThreshold must be > 0 to achieve desired performance for
      // cutouts in storm, but will produce artifacts around the edges of
      // cutouts in both storm and prman. Per the preview surface spec,
      // cutouts are not combinable with translucency/partial presence.
      parameterNames.push(_UsdPreviewSurfaceTokens.opacityThreshold)
      parameters.push(pointOne)
    } else {
      parameterNames.push(_UsdPreviewSurfaceTokens.diffuseColor)
      parameters.push(fallbackParam)
      parameterNames.push(_UsdPreviewSurfaceTokens.opacity)
      parameters.push(one)
    }

    return new HdMaterialNodeSchema.Builder()
      .setNodeIdentifier(nodeIdentifier as never)
      .setParameters(HdRetainedContainerDataSource.new(parameterNames, parameters))
      .setInputConnections(
        HdRetainedContainerDataSource.new(inputConnectionNames, inputConnections))
      .build()
  }

  /** drawModeStandin.cpp:1783-1801 */
  function _CardsUVNode(): HdDataSourceBase {
    const paramsNames = [_UsdPrimvarReaderTokens.varname]
    const paramsValues = [
      new HdMaterialNodeParameterSchema.Builder()
        .setValue(_Token(_primvarNameTokens.cardsUv))
        .build(),
    ]
    return new HdMaterialNodeSchema.Builder()
      .setNodeIdentifier(_Token(UsdImagingTokens.UsdPrimvarReader_float2))
      .setParameters(HdRetainedContainerDataSource.new(paramsNames, paramsValues))
      .build()
  }

  let _builtinMaterialDs: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:1803-1879 */
  function _ComputeMaterials(values: _SchemaValues): _NameToContainer {
    const vec4Fallback = _Vec4fFromVec3fDataSource.new(values.drawModeColor, 1.0)

    const materials: _NameToContainer = new Map()

    const builtinMaterialDs = _builtinMaterialDs ??= new HdBuiltinMaterialSchema.Builder()
      .setBuiltinMaterial(_Bool(true))
      .build()

    // do not generate any materials if there are no textures for any face
    if (values.hasTexture.count()) {
      for (let i = 0; i < 6; ++i) {
        // only generate materials for faces that have textures.
        // textureless faces that are opposite textured faces will
        // use the same material as the textured face.
        if (values.hasTexture.get(i)) {

          const nodeNames: string[] = []
          const nodes: HdDataSourceBase[] = []
          const networkNames: string[] = []
          const networks: HdDataSourceBase[] = []

          // Card Surface
          nodeNames.push(_materialNodeNameTokens.cardSurface)
          nodes.push(_CardsSurfaceNode(values.hasTexture.get(i), values.drawModeColor))
          // Card Texture
          nodeNames.push(_materialNodeNameTokens.cardTexture)
          nodes.push(_CardsTextureNode(values.texturePaths[i], vec4Fallback))
          // Card UvCords
          nodeNames.push(_materialNodeNameTokens.cardUvCoords)
          nodes.push(_CardsUVNode())

          // Connect surface terminal to the UsdPreviewSurface node.
          const terminals = HdRetainedContainerDataSource.new(
            [HdMaterialTerminalTokens.surface],
            [new HdMaterialConnectionSchema.Builder()
              .setUpstreamNodePath(_Token(_materialNodeNameTokens.cardSurface))
              .setUpstreamNodeOutputName(_Token(HdMaterialTerminalTokens.surface))
              .build()])

          networkNames.push(HdMaterialSchemaTokens.universalRenderContext)
          networks.push(new HdMaterialNetworkSchema.Builder()
            .setNodes(HdRetainedContainerDataSource.new(nodeNames, nodes))
            .setTerminals(terminals)
            .build())
          materials.set(
            _materialNameTokens[i]!,
            HdRetainedContainerDataSource.new(
              [HdMaterialSchemaTokens.material,
                HdBuiltinMaterialSchema.getSchemaToken()],
              [HdMaterialSchema.buildRetained(networkNames, networks),
                builtinMaterialDs]))
        }
      }
    }
    return materials
  }

  /** drawModeStandin.cpp:1061-1090: the cached data. Compute cached data
   *  from schema values (drawModeStandin.cpp:1342-1354). */
  class _CardsData {
    readonly cardGeometry: string
    readonly points: GfVec3f[]
    readonly extent: HdContainerDataSource | undefined
    readonly uvs: HdDataSourceBase
    readonly meshTopology: HdContainerDataSource
    readonly geomSubsets: _NameToContainer
    readonly materials: _NameToContainer

    constructor(values: _SchemaValues, primPath: string) {
      this.cardGeometry = values.cardGeometry
      this.points = _ComputePoints(values)
      this.extent = _ComputeExtent(this.cardGeometry, this.points)
      this.uvs = HdRetainedTypedSampledDataSource.new(
        new VtArray<GfVec2f>(_ComputeUVs(values), VtValueTypes.GfVec2f))
      this.meshTopology = _DisjointQuadTopology(values.hasFace.count())
      this.geomSubsets = _ComputeGeomSubsets(values, primPath)
      this.materials = _ComputeMaterials(values)
    }
  }

  /** drawModeStandin.cpp:960-1129: caches data needed by the stand-in,
   *  created from primSource. */
  class _CardsDataCache {
    private _data: _CardsData | undefined

    constructor(
      private readonly _primPath: string,
      private readonly _primSource: HdContainerDataSource | undefined,
      private readonly _upAxis: string,
    ) {}

    /** Card geometry, that is, box, cross, or fromTexture. */
    getCardGeometry(): string { return this._getCardsData().cardGeometry }

    /** Positions of mesh points not accounting for the extent.
     *  Note that the positions need to be transformed using the
     *  extent if card geometry is box or cross. */
    getPoints(): GfVec3f[] { return this._getCardsData().points }

    /** If card geometry is fromTexture, the extent computed from
     *  the above points. Otherwise, nullptr - since we can just use
     *  the extent from the original prim source. */
    getExtent(): HdContainerDataSource | undefined { return this._getCardsData().extent }

    /** The value for the cardsUV primvar. */
    getUVs(): HdDataSourceBase { return this._getCardsData().uvs }

    /** The topology. */
    getMeshTopology(): HdContainerDataSource { return this._getCardsData().meshTopology }

    getGeomSubsets(): _NameToContainer { return this._getCardsData().geomSubsets }

    /** The materials. */
    getMaterials(): _NameToContainer { return this._getCardsData().materials }

    /** Reset the cache. */
    Reset(): void {
      this._data = undefined
    }

    /** drawModeStandin.cpp:1108-1123 */
    private _getCardsData(): _CardsData {
      if (this._data) {
        return this._data
      }
      const data = new _CardsData(
        new _SchemaValues(
          UsdImagingGeomModelSchema.getFromParent(this._primSource),
          this._upAxis),
        this._primPath)
      this._data = data
      return data
    }
  }

  /** drawModeStandin.cpp:1881-1945: data source for
   *  primvars:points:primvarValue.
   *
   *  Uses _CardsDataCache and applies extent if card geometry is not
   *  fromTexture. */
  class _CardsPointsPrimvarValueDataSource extends HdTypedSampledDataSource<VtArray<GfVec3f>> {
    static new(
      primSource: HdContainerDataSource | undefined, dataCache: _CardsDataCache,
    ): _CardsPointsPrimvarValueDataSource {
      return new _CardsPointsPrimvarValueDataSource(primSource, dataCache)
    }

    private constructor(
      private readonly _primSource: HdContainerDataSource | undefined,
      private readonly _dataCache: _CardsDataCache,
    ) { super() }

    getTypedValue(shutterOffset: number): VtArray<GfVec3f> {
      const pts = this._dataCache.getPoints()
      if (this._dataCache.getCardGeometry() === _UsdGeomTokens.fromTexture) {
        return new VtArray<GfVec3f>(pts, VtValueTypes.GfVec3f)
      }

      const extentSchema = HdExtentSchema.getFromParent(this._primSource)
      let min = new GfVec3f(0.0)
      const minSrc = extentSchema.getMin()
      if (minSrc) {
        const v = minSrc.getTypedValue(shutterOffset)
        min = new GfVec3f(_Comp(v, 0), _Comp(v, 1), _Comp(v, 2))
      }
      let max = new GfVec3f(0.0)
      const maxSrc = extentSchema.getMax()
      if (maxSrc) {
        const v = maxSrc.getTypedValue(shutterOffset)
        max = new GfVec3f(_Comp(v, 0), _Comp(v, 1), _Comp(v, 2))
      }

      const result: GfVec3f[] = []
      for (const pt of pts) {
        result.push(new GfVec3f(
          min.get(0) * (1.0 - pt.get(0)) + max.get(0) * pt.get(0),
          min.get(1) * (1.0 - pt.get(1)) + max.get(1) * pt.get(1),
          min.get(2) * (1.0 - pt.get(2)) + max.get(2) * pt.get(2)))
      }

      return new VtArray<GfVec3f>(result, VtValueTypes.GfVec3f)
    }

    GetContributingSampleTimesForInterval(
      startTime: number, endTime: number, outSampleTimes: number[],
    ): boolean {
      const extentSchema = HdExtentSchema.getFromParent(this._primSource)
      const srcs = [extentSchema.getMin(), extentSchema.getMax()] as (HdSampledDataSource | undefined)[]
      return _HdGetMergedContributingSampleTimesForInterval(
        srcs, startTime, endTime, outSampleTimes)
    }
  }

  let _displayRoughnessSrc: HdDataSourceBase | undefined

  /** drawModeStandin.cpp:1947-2008: data source for primvars.
   *
   *  Provides (on top of the base class):
   *  - points (using above data source and _CardsDataCache)
   *  - cardsUv (from _CardsDataCache)
   *  - displayRoughness (constant) */
  class _CardsPrimvarsDataSource extends _PrimvarsDataSource {
    static new(
      primSource: HdContainerDataSource | undefined, dataCache: _CardsDataCache,
    ): _CardsPrimvarsDataSource {
      return new _CardsPrimvarsDataSource(primSource, dataCache)
    }

    private constructor(
      primSource: HdContainerDataSource | undefined,
      private readonly _dataCache: _CardsDataCache,
    ) { super(primSource) }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _CardsPrimvarsDataSource._names ??= _Concat(
        super.getNames(),
        [HdPrimvarsSchemaTokens.points,
          _primvarNameTokens.cardsUv,
          _primvarNameTokens.displayRoughness])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdPrimvarsSchemaTokens.points) {
        return _PrimvarDataSource.new(
          _CardsPointsPrimvarValueDataSource.new(this._primSource, this._dataCache),
          HdPrimvarSchemaTokens.vertex,
          HdPrimvarSchemaTokens.point)
      }
      if (name === _primvarNameTokens.cardsUv) {
        return _PrimvarDataSource.new(
          this._dataCache.getUVs(),
          HdPrimvarSchemaTokens.vertex,
          '')
      }
      if (name === _primvarNameTokens.displayRoughness) {
        return _displayRoughnessSrc ??= _PrimvarDataSource.new(
          HdRetainedTypedSampledDataSource.new<number[]>([1.0]),
          HdPrimvarSchemaTokens.constant,
          '')
      }

      return super.Get(name)
    }
  }

  /** drawModeStandin.cpp:2010-2059 */
  class _CardsPrimDataSource extends _PrimDataSource {
    static new(
      path: string, primSource: HdContainerDataSource | undefined, dataCache: _CardsDataCache,
    ): _CardsPrimDataSource {
      return new _CardsPrimDataSource(path, primSource, dataCache)
    }

    private constructor(
      private readonly _path: string,
      primSource: HdContainerDataSource | undefined,
      private readonly _dataCache: _CardsDataCache,
    ) { super(primSource) }

    private static _names: string[] | undefined

    getNames(): string[] {
      return _CardsPrimDataSource._names ??= _Concat(
        super.getNames(),
        [HdMeshSchemaTokens.mesh,
          HdPrimvarsSchemaTokens.primvars,
          HdExtentSchemaTokens.extent])
    }

    Get(name: string): HdDataSourceBase | undefined {
      if (name === HdMeshSchemaTokens.mesh) {
        return new HdMeshSchema.Builder()
          .setTopology(this._dataCache.getMeshTopology())
          .setDoubleSided(_Bool(false))
          .build()
      }
      if (name === HdPrimvarsSchemaTokens.primvars) {
        return _CardsPrimvarsDataSource.new(this._primSource, this._dataCache)
      }
      if (name === HdExtentSchemaTokens.extent) {
        const src = this._dataCache.getExtent()
        if (src) {
          return src
        }
        return HdExtentSchema.getFromParent(this._primSource).getContainer()
      }

      return super.Get(name)
    }
  }

  let _materialColorInputLocators: HdDataSourceLocatorSet | undefined

  /** drawModeStandin.cpp:2061-2081 */
  function _ComputeMaterialColorInputLocators(): HdDataSourceLocatorSet {
    const nodes =
      new HdDataSourceLocator(HdMaterialSchemaTokens.universalRenderContext)
        .append(HdMaterialNetworkSchemaTokens.nodes)
    return new HdDataSourceLocatorSet([
      nodes
        .append(_materialNodeNameTokens.cardTexture)
        .append(HdMaterialNodeSchemaTokens.parameters)
        .append(_UsdUVTextureTokens.fallback),
      nodes
        .append(_materialNodeNameTokens.cardSurface)
        .append(HdMaterialNodeSchemaTokens.parameters)
        .append(_UsdPreviewSurfaceTokens.diffuseColor),
      nodes
        .append(_materialNodeNameTokens.cardSurface)
        .append(HdMaterialNodeSchemaTokens.parameters)
        .append(_UsdPreviewSurfaceTokens.opacity),
    ])
  }

  let _cardLocators: HdDataSourceLocatorSet | undefined
  let _colorLocator: HdDataSourceLocator | undefined
  let _displayColorValue: HdDataSourceLocator | undefined

  /** drawModeStandin.cpp:2083-2245 */
  export class _CardsStandin extends UsdImaging_DrawModeStandin {
    private readonly _dataCache: _CardsDataCache

    constructor(path: string, primSource: HdContainerDataSource | undefined) {
      super(path, primSource)
      let upAxis = ''
      const ds = UsdImagingUsdUpAxisSchema.getFromParent(primSource).getUpAxis()
      if (ds) {
        upAxis = ds.getTypedValue(0.0)
      }
      this._dataCache = new _CardsDataCache(path, primSource, upAxis)
    }

    processDirtyLocators(
      dirtyLocators: HdDataSourceLocatorSet,
      entries: HdSceneIndexObserverDirtiedPrimEntry[],
      needsRefresh: { value: boolean },
    ): void {
      // Note that we do not remove the model locator from the dirty locators
      // we send to the observer.

      const geomModel = UsdImagingGeomModelSchema.getDefaultLocator()
      const cardLocators = _cardLocators ??= new HdDataSourceLocatorSet([
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardGeometry),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardVisibility),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureXPos),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureYPos),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureZPos),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureXNeg),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureYNeg),
        geomModel.append(UsdImagingGeomModelSchemaTokens.cardTextureZNeg),
        UsdImagingUsdUpAxisSchema.getDefaultLocator().append(
          UsdImagingUsdUpAxisSchemaTokens.upAxis)])

      // Blast the entire thing.
      if (dirtyLocators.intersects(cardLocators)) {
        needsRefresh.value = true
        for (const path of this.getPrimPaths()) {
          entries.push({
            primPath: path,
            dirtyLocators: new HdDataSourceLocatorSet([HdDataSourceLocator.EmptyLocator]) })
        }
        this._dataCache.Reset()
        return
      }

      const colorLocator = _colorLocator ??=
        UsdImagingGeomModelSchema.getDefaultLocator().append(
          UsdImagingGeomModelSchemaTokens.drawModeColor)
      if (dirtyLocators.intersects(colorLocator)) {
        const primDirtyLocators = new HdDataSourceLocatorSet(dirtyLocators)
        primDirtyLocators.insert(_displayColorValue ??=
          HdPrimvarsSchema.getDefaultLocator()
            .append(HdTokens.displayColor)
            .append(HdPrimvarSchemaTokens.primvarValue))
        entries.push({
          primPath: _SdfAppendChild(this._path, _primNameTokens.cardsMesh),
          dirtyLocators: primDirtyLocators })
        const materialColorInputs = _materialColorInputLocators ??=
          _ComputeMaterialColorInputLocators()
        for (const name of this._dataCache.getMaterials().keys()) {
          entries.push({
            primPath: _SdfAppendChild(this._path, name),
            dirtyLocators: materialColorInputs })
        }
        return
      }

      entries.push({
        primPath: _SdfAppendChild(this._path, _primNameTokens.cardsMesh),
        dirtyLocators })
    }

    getDrawMode(): string {
      return _UsdGeomTokens.cards
    }

    protected _getRelativePrimPaths(): string[] {
      const cardsMeshPath = _primNameTokens.cardsMesh

      const paths = [_reflexiveRelativePath, cardsMeshPath]
      // materials are siblings of 'cardsMesh'
      for (const name of this._dataCache.getMaterials().keys()) {
        paths.push(name)
      }
      // geom subsets are children of 'cardsMesh'
      for (const name of this._dataCache.getGeomSubsets().keys()) {
        paths.push(cardsMeshPath + '/' + name)
      }
      return paths
    }

    protected _getPrimType(relPath: string): string {
      const count = _SdfRelativePathElementCount(relPath)
      if (count === 1) {
        const name = _SdfRelativeNameToken(relPath)
        if (name === _primNameTokens.cardsMesh) {
          return HdPrimTypeTokens.mesh
        }
        if (this._dataCache.getMaterials().has(name)) {
          return HdPrimTypeTokens.material
        }
        return ''
      }
      if (count === 2 &&
          _SdfRelativeParentNameToken(relPath) === _primNameTokens.cardsMesh) {
        const name = _SdfRelativeNameToken(relPath)
        if (this._dataCache.getGeomSubsets().has(name)) {
          return HdPrimTypeTokens.geomSubset
        }
        return ''
      }
      return ''
    }

    protected _getPrimSource(relPath: string): HdContainerDataSource | undefined {
      const count = _SdfRelativePathElementCount(relPath)
      if (count === 1) {
        const name = _SdfRelativeNameToken(relPath)
        if (name === _primNameTokens.cardsMesh) {
          return _CardsPrimDataSource.new(this._path, this._primSource, this._dataCache)
        }
        // We rely on the consumer calling HdSceneIndex::GetPrim()
        // again when we send a prim dirtied for the material prims
        // with an empty data source locators.
        return this._dataCache.getMaterials().get(name)
      }
      if (count === 2 &&
          _SdfRelativeParentNameToken(relPath) === _primNameTokens.cardsMesh) {
        const name = _SdfRelativeNameToken(relPath)
        return this._dataCache.getGeomSubsets().get(name)
      }
      return undefined
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
///
/// Code to instantiate DrawModeStandin.
///
///////////////////////////////////////////////////////////////////////////////

/** drawModeStandin.cpp:2257-2280: given a draw mode and the path and data
 *  source for a prim (from the input scene index to the
 *  UsdImagingDrawModeSceneIndex), return the stand-in geometry or undefined
 *  (if draw mode is default or invalid). */
export function UsdImaging_GetDrawModeStandin(
  drawMode: string, path: string, primSource: HdContainerDataSource | undefined,
): UsdImaging_DrawModeStandin | undefined {
  if (drawMode === '') {
    return undefined
  }
  if (drawMode === _UsdGeomTokens.bounds) {
    return new _BoundsDrawMode._BoundsStandin(path, primSource)
  }
  if (drawMode === _UsdGeomTokens.origin) {
    return new _OriginDrawMode._OriginStandin(path, primSource)
  }
  if (drawMode === _UsdGeomTokens.cards) {
    return new _CardsDrawMode._CardsStandin(path, primSource)
  }
  return undefined
}
