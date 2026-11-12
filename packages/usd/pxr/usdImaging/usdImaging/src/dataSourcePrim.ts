// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourcePrim.cpp,
//  pxr/usdImaging/usdImaging/dataSourcePrim.h, pxr/imaging/hd/purposeSchema.h,
//  pxr/imaging/hd/visibilitySchema.h
// Copyright 2020, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourcePrim.{h,cpp}
// (OpenUSD 26.11.1).
//
// USD schema access: UsdGeomImageable, UsdGeomXformable, UsdGeomBoundable,
// UsdGeomModelAPI and UsdModelAPI are reached through the prim's schema type
// (UsdPrim::IsA) and the attributes / metadata their generated accessors
// read (e.g. UsdGeomImageable::GetVisibilityAttr reads "visibility"); the
// TypeScript usdGeom classes do not expose all of those accessors.
//
// Divergences:
// - The full HdPurposeSchemaTokens / HdVisibilitySchemaTokens are not in the
//   hd barrel (it exports subsets under those names), so the tokens used here
//   are spelled locally from purposeSchema.h / visibilitySchema.h.

import { Interval as GfInterval, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ExtentSchema as HdExtentSchema,
  ExtentSchemaTokens as HdExtentSchemaTokens,
  PrimOriginSchema as HdPrimOriginSchema,
  PrimOriginSchemaTokens as HdPrimOriginSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PurposeSchema as HdPurposeSchema,
  RenderTagTokens as HdRenderTagTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VisibilitySchema as HdVisibilitySchema,
  XformSchema as HdXformSchema,
  XformSchemaTokens as HdXformSchemaTokens,
  type DataSourceBase as HdDataSourceBase,
  type TypedSampledDataSource as HdTypedSampledDataSourceT,
} from 'typescript-usd/hd'
import { findValueTypeName, AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Type as TfType } from 'typescript-usd/tf'
import { AttributeQuery as UsdAttributeQuery, TimeCode as UsdTimeCode, type Prim as UsdPrim } from 'typescript-usd/usd'
import { XformCommonAPI as UsdGeomXformCommonAPI, XformQuery as UsdGeomXformableXformQuery } from 'typescript-usd/usdGeom'
import type { Array as VtArray } from 'typescript-usd/vt'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import {
  _UsdGeomPrimvarsAPICanContainPropertyName,
  _UsdGeomPrimvarsAPIGetAuthoredPrimvars,
  UsdImagingDataSourcePrimvars,
} from './dataSourcePrimvars.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingDataSourceUsdPrimInfo } from './dataSourceUsdPrimInfo.ts'
import { UsdImagingExtentsHintSchema } from './extentsHintSchema.ts'
import { UsdImagingGeomXformVectorsSchema } from './geomXformVectorsSchema.ts'
import { UsdImagingModelSchema, UsdImagingModelSchemaTokens } from './modelSchema.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import { UsdImagingPropertyInvalidationType } from './types.ts'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

const _TfTokenType = TfType.declare('token')
const _SdfPathType = TfType.declare('SdfPath')
const _SdfAssetPathType = TfType.declare('SdfAssetPath')

// purposeSchema.h HdPurposeSchemaTokens (see the header).
const _HdPurposeSchemaTokens = {
  purpose: 'purpose',
  inheritable: 'inheritable',
  fallback: 'fallback',
} as const

// visibilitySchema.h HdVisibilitySchemaTokens (see the header).
const _HdVisibilitySchemaTokens = {
  visibility: 'visibility',
} as const

// UsdGeomTokens used below.
const _UsdGeomTokens = {
  visibility: 'visibility',
  invisible: 'invisible',
  purpose: 'purpose',
  default_: 'default',
  render: 'render',
  proxy: 'proxy',
  guide: 'guide',
  extent: 'extent',
  extentsHint: 'extentsHint',
  xformOpOrder: 'xformOpOrder',
} as const

/** The UsdTimeCode a sample at `shutterOffset` reads from `time`, as a
 *  number for the usdGeom APIs (undefined for the default time). */
function _UsdGeomTime(time: UsdTimeCode): number | undefined {
  return time.isDefault() ? undefined : time.GetValue()
}

/** UsdGeomXformable::GetSchemaAttributeNames(false)
 *  (xformable.cpp:100-115). */
const _UsdGeomXformableLocalSchemaAttributeNames: readonly string[] = [
  _UsdGeomTokens.xformOpOrder,
]

/** UsdGeomXformable::IsTransformationAffectedByAttrNamed
 *  (xformable.cpp:1061-1066) with UsdGeomXformOp::IsXformOp
 *  (xformOp.cpp:195-199). */
function _UsdGeomXformableIsTransformationAffectedByAttrNamed(attrName: string): boolean {
  return attrName === _UsdGeomTokens.xformOpOrder ||
    attrName.startsWith('xformOp:')
}

/** UsdGeomImageable::GetOrderedPurposeTokens (imageable.cpp:168-178). */
const _UsdGeomImageableOrderedPurposeTokens: readonly string[] = [
  _UsdGeomTokens.default_,
  _UsdGeomTokens.render,
  _UsdGeomTokens.proxy,
  _UsdGeomTokens.guide,
]

/** The VtVec3fArray data source HdVec3fArrayDataSource::Cast accepts: the
 *  attribute data source of an attribute whose value type is
 *  VtArray<GfVec3f> (see dataSourceAttribute.ts for why the C++ type is not
 *  carried by the data source class). */
function _CastToVec3fArrayDataSource(
  ds: HdDataSourceBase | undefined, typeName: string,
): HdTypedSampledDataSourceT<VtArray<GfVec3f>> | undefined {
  if (!(ds instanceof HdTypedSampledDataSource)) {
    return undefined
  }
  const valueType = findValueTypeName(typeName)
  if (!valueType?.isArray || valueType.scalarType?.type !== 'GfVec3f') {
    return undefined
  }
  return ds as HdTypedSampledDataSourceT<VtArray<GfVec3f>>
}

/** dataSourcePrim.h:24-58: data source representing prim visibility for a
 *  USD imageable. */
export class UsdImagingDataSourceVisibility extends HdContainerDataSource {
  private static _boolFalseDs: HdDataSourceBase | undefined

  /** dataSourcePrim.cpp:35-46. `visibilityQuery` is the USD attribute query
   *  holding visibility data. `sceneIndexPath` is the path of this object in
   *  the scene index. `stageGlobals` is the context object for the USD
   *  stage. */
  private constructor(
    private readonly _visibilityQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    if (this._visibilityQuery.valueMightBeTimeVarying()) {
      this._stageGlobals.flagAsTimeVarying(
        sceneIndexPath, HdVisibilitySchema.getDefaultLocator())
    }
  }

  static new(
    visibilityQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceVisibility {
    return new UsdImagingDataSourceVisibility(visibilityQuery, sceneIndexPath, stageGlobals)
  }

  /** dataSourcePrim.cpp:48-54: this class only returns 'visibility'. */
  getNames(): string[] {
    return [
      _HdVisibilitySchemaTokens.visibility,
    ]
  }

  /** dataSourcePrim.cpp:56-93: only 'visibility' returns anything for this
   *  class. */
  Get(name: string): HdDataSourceBase | undefined {
    // Note, we need to do a bit of a dance here.
    //
    // Hydra has tri-state visibility (visible, invisible, inherited), which
    // is indicated by presence of the boolean visibility attribute (vis/invis),
    // or absence of the visibility attribute (inherited). For inherited
    // visibility, the flattening scene index will compute a resolved boolean
    // value.
    //
    // USD has bi-state visibility (invisible, inherited). Absence of a value
    // indicates inherited.
    //
    // If the USD attribute isn't authored, the hydra attribute isn't present,
    // and the value is "inherited".  If the USD attribute is "invisible", we
    // can return "invisible" (boolean false) here, and everything's cool.
    // However, if the USD attribute is authored as "inherited" here, we need
    // to map that to hydra not having a value.
    //
    // We do this by mapping "invisible" to constant "false", and
    // "inherited" to nullptr.
    //
    // Note that this mapping doesn't allow for visibility to vary across
    // a shutter window; that would require a hydra schema change, but it's
    // probably not a useful feature.
    if (name === _HdVisibilitySchemaTokens.visibility) {
      const vis = String(this._visibilityQuery.get(this._stageGlobals.getTime()) ?? '')
      if (vis === _UsdGeomTokens.invisible) {
        return UsdImagingDataSourceVisibility._boolFalseDs ??=
          HdRetainedTypedSampledDataSource.new<boolean>(false)
      }
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

const _purposeDataSources = new Map<string, HdDataSourceBase>()

/** dataSourcePrim.cpp:115-142 */
function _PurposeTokenToDataSource(purpose: string): HdDataSourceBase {
  // Provide static const data sources for common values.
  if (purpose === _UsdGeomTokens.default_) {
    // Hydra's default purpose is 'geometry'.
    let ds = _purposeDataSources.get(purpose)
    if (!ds) {
      ds = new HdRetainedTypedSampledDataSource<string>(HdRenderTagTokens.geometry, _TfTokenType)
      _purposeDataSources.set(purpose, ds)
    }
    return ds
  }
  if (purpose === _UsdGeomTokens.render ||
      purpose === _UsdGeomTokens.proxy ||
      purpose === _UsdGeomTokens.guide) {
    let ds = _purposeDataSources.get(purpose)
    if (!ds) {
      ds = new HdRetainedTypedSampledDataSource<string>(purpose, _TfTokenType)
      _purposeDataSources.set(purpose, ds)
    }
    return ds
  }
  return new HdRetainedTypedSampledDataSource<string>(purpose, _TfTokenType)
}

/** dataSourcePrim.h:62-97: data source representing prim purpose for a USD
 *  imageable. */
export class UsdImagingDataSourcePurpose extends HdContainerDataSource {
  private static _inheritableDs: HdDataSourceBase | undefined

  /** dataSourcePrim.cpp:97-103. `purposeQuery` is the USD attribute query
   *  holding purpose data. `stageGlobals` is the context object for the USD
   *  stage. */
  private constructor(
    private readonly _purposeQuery: UsdAttributeQuery,
    // Unused upstream as well (dataSourcePrim.h:95).
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    purposeQuery: UsdAttributeQuery, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePurpose {
    return new UsdImagingDataSourcePurpose(purposeQuery, stageGlobals)
  }

  /** dataSourcePrim.cpp:105-113 */
  getNames(): string[] {
    return [
      _HdPurposeSchemaTokens.purpose,
      _HdPurposeSchemaTokens.inheritable,
      _HdPurposeSchemaTokens.fallback,
    ]
  }

  /** dataSourcePrim.cpp:144-178 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === _HdPurposeSchemaTokens.purpose) {
      if (this._purposeQuery.hasAuthoredValue()) {
        const purpose = this._purposeQuery.get()
        if (typeof purpose === 'string' || purpose instanceof String) {
          return _PurposeTokenToDataSource(String(purpose))
        }
      }
      return undefined
    }

    if (name === _HdPurposeSchemaTokens.fallback) {
      if (!this._purposeQuery.hasAuthoredValue()) {
        const purpose = this._purposeQuery.get()
        if (typeof purpose === 'string' || purpose instanceof String) {
          return _PurposeTokenToDataSource(String(purpose))
        }
      }
      return undefined
    }

    if (name === _HdPurposeSchemaTokens.inheritable) {
      if (this._purposeQuery.hasAuthoredValue()) {
        // An authored purpose value is not a fallback, and
        // is therefore inheritable.
        return UsdImagingDataSourcePurpose._inheritableDs ??=
          HdRetainedTypedSampledDataSource.new<boolean>(true)
      }
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.h:101-143: data source representing either the minimum or
 *  maximum of the local prim extent. */
export class UsdImagingDataSourceExtentCoordinate extends HdTypedSampledDataSource<GfVec3d> {
  /** dataSourcePrim.cpp:182-190. `extentDs` is the float3 array holding all
   *  extent coordinates. `attrPath` is the USD path of the underlying
   *  extents attribute. `index` is the index of the value we want out of
   *  extentDs. */
  private constructor(
    private readonly _extentDs: HdTypedSampledDataSourceT<VtArray<GfVec3f>>,
    private readonly _attrPath: string,
    private readonly _index: number,
  ) { super() }

  static new(
    extentDs: HdTypedSampledDataSourceT<VtArray<GfVec3f>>, attrPath: string, index: number,
  ): UsdImagingDataSourceExtentCoordinate {
    return new UsdImagingDataSourceExtentCoordinate(extentDs, attrPath, index)
  }

  /** dataSourcePrim.cpp:192-197 */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.GfVec3d)
  }

  /** dataSourcePrim.cpp:199-216 */
  getTypedValue(shutterOffset: number): GfVec3d {
    // XXX: Note: this class would make for a nice utility in the core
    // datasource code if it were only doing the indexing.  Here, we're jumping
    // through some extra hoops to cast it up to vec3d rather than vec3f,
    // since that's what hydra expects.
    const raw = this._extentDs.getTypedValue(shutterOffset)
    if (this._index >= (raw?.size ?? 0)) {
      TF_WARN(`<${this._attrPath}> Attribute does not have expected index entry ${this._index}`)
      return new GfVec3d(0)
    }

    const result = new GfVec3d(raw.get(this._index))
    return result
  }

  /** dataSourcePrim.cpp:218-226 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return this._extentDs.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.h:147-187: data source representing local prim extent. */
export class UsdImagingDataSourceExtent extends HdContainerDataSource {
  // Note: the constructor takes sceneIndexPath for change-tracking,
  // but here we're storing the USD attribute path for error reporting!
  private readonly _attrPath: string
  private readonly _extentDs: HdTypedSampledDataSourceT<VtArray<GfVec3f>> | undefined

  /** dataSourcePrim.cpp:230-243. `extentQuery` is the USD attribute query
   *  holding extent data. `sceneIndexPath` is the path of this object in the
   *  scene index. `stageGlobals` is the context object for the USD stage. */
  private constructor(
    extentQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    if (extentQuery.valueMightBeTimeVarying()) {
      stageGlobals.flagAsTimeVarying(
        sceneIndexPath, HdExtentSchema.getDefaultLocator())
    }

    const attr = extentQuery.getAttribute()
    this._attrPath = attr?.getPath() ?? ''
    this._extentDs = _CastToVec3fArrayDataSource(
      UsdImagingDataSourceAttributeNew(extentQuery, stageGlobals), attr?.typeName ?? '')
  }

  static new(
    extentQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceExtent {
    return new UsdImagingDataSourceExtent(extentQuery, sceneIndexPath, stageGlobals)
  }

  /** dataSourcePrim.cpp:245-256: this class only returns 'min' and 'max'. */
  getNames(): string[] {
    if (!this._extentDs) {
      return []
    }

    return [
      HdExtentSchemaTokens.min,
      HdExtentSchemaTokens.max,
    ]
  }

  /** dataSourcePrim.cpp:258-275 */
  Get(name: string): HdDataSourceBase | undefined {
    // If the extents attr hasn't been defined, this prim has no extents.
    if (!this._extentDs) {
      return undefined
    }

    if (name === HdExtentSchemaTokens.min) {
      return UsdImagingDataSourceExtentCoordinate.new(
        this._extentDs, this._attrPath, 0)
    } else if (name === HdExtentSchemaTokens.max) {
      return UsdImagingDataSourceExtentCoordinate.new(
        this._extentDs, this._attrPath, 1)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.cpp:279-297: check if there is an authored or non-default
 *  fallback purpose. */
function _HasNonDefaultPurpose(prim: UsdPrim): boolean {
  // UsdGeomImageable imageable(prim); if (!imageable)
  if (!prim.isValid() || !prim.isA('Imageable')) {
    return false
  }
  // UsdGeomImageable::GetPurposeAttr
  const purposeAttr = prim.getAttr(_UsdGeomTokens.purpose)
  if (!purposeAttr?.isValid()) {
    return false
  }
  if (purposeAttr.hasAuthoredValue()) {
    return true
  }
  const fallbackPurpose = purposeAttr.getFallbackValue()
  return fallbackPurpose !== undefined
    && String(fallbackPurpose) !== ''
    && String(fallbackPurpose) !== _UsdGeomTokens.default_
}

/** dataSourcePrim.cpp:299-311 */
function _UsdToHdPurposes(v: readonly string[]): string[] {
  const result: string[] = []
  for (const usdPurpose of v) {
    if (usdPurpose === _UsdGeomTokens.default_) {
      result.push(HdRenderTagTokens.geometry)
    } else {
      result.push(usdPurpose)
    }
  }
  return result
}

let _orderedPurposes: string[] | undefined

/** dataSourcePrim.cpp:313-319 */
function _OrderedPurposes(): readonly string[] {
  return _orderedPurposes ??= _UsdToHdPurposes(_UsdGeomImageableOrderedPurposeTokens)
}

/** dataSourcePrim.h:191-232: data source representing extents hint of a
 *  geom model API prim. */
export class UsdImagingDataSourceExtentsHint extends HdContainerDataSource {
  // Note: the constructor takes sceneIndexPath for change-tracking,
  // but here we're storing the USD attribute path for error reporting!
  private readonly _attrPath: string
  private readonly _extentDs: HdTypedSampledDataSourceT<VtArray<GfVec3f>> | undefined

  /** dataSourcePrim.cpp:321-335. `extentQuery` is the USD attribute query
   *  holding extent data. `sceneIndexPath` is the path of this object in the
   *  scene index. `stageGlobals` is the context object for the USD stage. */
  private constructor(
    extentQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    if (extentQuery.valueMightBeTimeVarying()) {
      stageGlobals.flagAsTimeVarying(
        sceneIndexPath,
        UsdImagingExtentsHintSchema.getDefaultLocator())
    }

    const attr = extentQuery.getAttribute()
    this._attrPath = attr?.getPath() ?? ''
    this._extentDs = _CastToVec3fArrayDataSource(
      UsdImagingDataSourceAttributeNew(extentQuery, stageGlobals), attr?.typeName ?? '')
  }

  static new(
    extentQuery: UsdAttributeQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceExtentsHint {
    return new UsdImagingDataSourceExtentsHint(extentQuery, sceneIndexPath, stageGlobals)
  }

  /** dataSourcePrim.cpp:337-351: returns names of (hydra) purposes for which
   *  we have extentsHint.
   *
   *  extentsHint in usd is an array. The names are computed using the
   *  length of this array, by truncating
   *  UsdGeomImagable::GetOrderedPurposeTokens() (and translating
   *  UsdGeomTokens->default_ to HdTokens->geometry). */
  getNames(): string[] {
    if (!this._extentDs) {
      return []
    }

    const orderedPurposes = _OrderedPurposes()

    const n0 = Math.floor((this._extentDs.getTypedValue(0.0)?.size ?? 0) / 2)
    const n1 = orderedPurposes.length
    const n = Math.min(n0, n1)

    return orderedPurposes.slice(0, n)
  }

  /** dataSourcePrim.cpp:353-380: takes the hydra name of a purpose and
   *  returns the corresponding values from extentsHint as HdExtentSchema. */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._extentDs) {
      return undefined
    }

    const orderedPurposes = _OrderedPurposes()

    const n0 = Math.floor((this._extentDs.getTypedValue(0.0)?.size ?? 0) / 2)
    const n1 = orderedPurposes.length
    const n = Math.min(n0, n1)

    for (let i = 0; i < n; i++) {
      if (name === orderedPurposes[i]) {
        return new HdExtentSchema.Builder()
          .setMin(
            UsdImagingDataSourceExtentCoordinate.new(
              this._extentDs, this._attrPath, 2 * i))
          .setMax(
            UsdImagingDataSourceExtentCoordinate.new(
              this._extentDs, this._attrPath, 2 * i + 1))
          .build()
      }
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.h:236-280: data source representing the "reset xform
 *  stack" flag for a USD xformable. */
export class UsdImagingDataSourceXformResetXformStack extends HdTypedSampledDataSource<boolean> {
  /** dataSourcePrim.cpp:384-390. `xformQuery` is the USD XformQuery object
   *  that this class can extract a matrix from. `stageGlobals` represents
   *  the context object for the UsdStage with which to evaluate this
   *  attribute data source. */
  private constructor(
    private readonly _xformQuery: UsdGeomXformableXformQuery,
    // Unused upstream as well (dataSourcePrim.h:276).
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    xformQuery: UsdGeomXformableXformQuery, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceXformResetXformStack {
    return new UsdImagingDataSourceXformResetXformStack(xformQuery, stageGlobals)
  }

  /** dataSourcePrim.cpp:392-397 */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.bool)
  }

  /** dataSourcePrim.cpp:399-404 */
  getTypedValue(_shutterOffset: number): boolean {
    return this._xformQuery.getResetXformStack()
  }

  /** dataSourcePrim.h:257-263 */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.h:284-333: data source representing a generic transform
 *  value accessor for a USD Xformable. */
export class UsdImagingDataSourceXformMatrix extends HdTypedSampledDataSource<GfMatrix4d> {
  /** dataSourcePrim.cpp:408-414. `xformQuery` is the USD XformQuery object
   *  that this class can extract a matrix from. `stageGlobals` represents
   *  the context object for the UsdStage with which to evaluate this
   *  attribute data source. */
  private constructor(
    private readonly _xformQuery: UsdGeomXformableXformQuery,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    xformQuery: UsdGeomXformableXformQuery, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceXformMatrix {
    return new UsdImagingDataSourceXformMatrix(xformQuery, stageGlobals)
  }

  /** dataSourcePrim.cpp:416-421: returns VtValue at a given `shutterOffset`
   *  for the value of this xform. */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.GfMatrix4d)
  }

  /** dataSourcePrim.cpp:423-434: returns GfMatrix4d at a given
   *  `shutterOffset` for the value of this xform. */
  getTypedValue(shutterOffset: number): GfMatrix4d {
    let time = this._stageGlobals.getTime()
    if (time.isNumeric()) {
      time = new UsdTimeCode(time.GetValue() + shutterOffset)
    }
    const transform = new GfMatrix4d(...this._xformQuery.getLocalTransformation(_UsdGeomTime(time)))
    return transform
  }

  /** dataSourcePrim.cpp:436-474: fills `outSampleTimes` with the times
   *  between `startTime` and `endTime` that have valid sample data and
   *  returns true. */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    // XXX: Note: this code is very similar to the code in dataSourceAttribute.h
    // and the two should be kept in sync.  They are separate implementations
    // because transform values are composed from attributes, rather than being
    // a single attribute.
    const time = this._stageGlobals.getTime()
    if (!this._xformQuery.transformMightBeTimeVarying() ||
        !time.isNumeric()) {
      return false
    }

    const interval = new GfInterval(
      time.GetValue() + startTime,
      time.GetValue() + endTime)
    const timeSamples = this._xformQuery.getTimeSamplesInInterval(interval)

    // Add boundary timesamples, if necessary.
    if (timeSamples.length === 0 || timeSamples[0]! > interval.getMin()) {
      timeSamples.unshift(interval.getMin())
    }
    if (timeSamples[timeSamples.length - 1]! < interval.getMax()) {
      timeSamples.push(interval.getMax())
    }

    // We need to convert the time array because usd uses double and
    // hydra (and prman) use float :/.
    outSampleTimes.length = timeSamples.length
    for (let i = 0; i < timeSamples.length; ++i) {
      outSampleTimes[i] = timeSamples[i]! - time.GetValue()
    }

    return true
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.h:337-386: data source representing a container that
 *  stores a USD Xformable.
 *
 *  Note that this container only represents a flattened matrix right now,
 *  but could be expanded in the future to include more granular XformOps,
 *  which is why it exists as a separate entity. */
export class UsdImagingDataSourceXform extends HdContainerDataSource {
  /** dataSourcePrim.cpp:478-489. `xformQuery` is the USD XformQuery object
   *  that this class can extract a matrix from. `sceneIndexPath` is the path
   *  of this object in the scene index. `stageGlobals` represents the
   *  context object for the UsdStage with which to evaluate this attribute
   *  data source. */
  private constructor(
    private readonly _xformQuery: UsdGeomXformableXformQuery,
    sceneIndexPath: string,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    if (this._xformQuery.transformMightBeTimeVarying()) {
      this._stageGlobals.flagAsTimeVarying(
        sceneIndexPath, HdXformSchema.getDefaultLocator())
    }
  }

  static new(
    xformQuery: UsdGeomXformableXformQuery,
    sceneIndexPath: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceXform {
    return new UsdImagingDataSourceXform(xformQuery, sceneIndexPath, stageGlobals)
  }

  /** dataSourcePrim.cpp:491-498: this class only returns 'matrix' and
   *  'resetXformStack'. */
  getNames(): string[] {
    return [
      HdXformSchemaTokens.matrix,
      HdXformSchemaTokens.resetXformStack,
    ]
  }

  /** dataSourcePrim.cpp:500-512: only 'matrix' and 'resetXformStack' return
   *  anything in this class. */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdXformSchemaTokens.matrix) {
      return UsdImagingDataSourceXformMatrix.new(
        this._xformQuery, this._stageGlobals)
    } else if (name === HdXformSchemaTokens.resetXformStack) {
      return UsdImagingDataSourceXformResetXformStack.new(
        this._xformQuery, this._stageGlobals)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.cpp:530-558: if prim, say /__Prototype_1/MyXform/MySphere
 *  is inside a Usd Prototype (here /__Prototype_1), return the path relative
 *  to the prototype root (here MyXform/MySphere). If prim is not inside a
 *  Usd Prototype, just return (absolute) prim path.
 *
 *  Assumes that all Usd prototype roots are children of the pseudo root. */
function _ComputePrototypeRelativePath(prim: UsdPrim): string {
  const path = SdfPath.fromString(prim.path)

  const prefixes = path.getPrefixes()
  if (prefixes.length === 0) {
    return path.pathString
  }

  // Get path of potential prototype containing the prim.
  const prototypePath = prefixes[0]!
  const prototype = prim.getStage().getPrim(prototypePath.pathString)
  if (!prototype?.isValid()) {
    return path.pathString
  }
  if (!prototype.isPrototype()) {
    return path.pathString
  }
  return path.makeRelativePath(prototypePath).pathString
}

/** dataSourcePrim.h:390-413: data source to access the underlying UsdPrim. */
export class UsdImagingDataSourcePrimOrigin extends HdContainerDataSource {
  /** dataSourcePrim.cpp:516-520 */
  private constructor(private readonly _usdPrim: UsdPrim) { super() }

  static new(usdPrim: UsdPrim): UsdImagingDataSourcePrimOrigin {
    return new UsdImagingDataSourcePrimOrigin(usdPrim)
  }

  /** dataSourcePrim.cpp:522-528 */
  getNames(): string[] {
    return [
      HdPrimOriginSchemaTokens.scenePath,
    ]
  }

  /** dataSourcePrim.cpp:560-577: Get(scenePath) returns a data source
   *  containing the path of the underlying UsdPrim. */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimOriginSchemaTokens.scenePath) {
      if (!this._usdPrim.isValid()) {
        return undefined
      }

      return HdRetainedTypedSampledDataSource.new<HdPrimOriginSchema.OriginPath>(
        new HdPrimOriginSchema.OriginPath(
          _ComputePrototypeRelativePath(this._usdPrim)))
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** UsdModelAPI::GetAssetInfoByKey reached through UsdPrim::GetAssetInfoByKey
 *  (modelAPI.cpp _GetAssetInfoByKey): the assetInfo dictionary entry, if
 *  authored. */
function _GetAssetInfoByKey(prim: UsdPrim, key: string): unknown {
  const assetInfo = prim.getMetadata('assetInfo')
  if (!assetInfo || typeof assetInfo !== 'object') {
    return undefined
  }
  if (assetInfo instanceof Map) {
    return assetInfo.get(key)
  }
  return (assetInfo as Record<string, unknown>)[key]
}

/** dataSourcePrim.cpp:581-663: data source representing UsdModelAPI. */
class UsdImagingDataSourcePrim_ModelAPI extends HdContainerDataSource {
  /** dataSourcePrim.cpp:602-606 */
  private constructor(private readonly _model: UsdPrim) { super() }

  static new(model: UsdPrim): UsdImagingDataSourcePrim_ModelAPI {
    return new UsdImagingDataSourcePrim_ModelAPI(model)
  }

  /** dataSourcePrim.cpp:608-620: return true if this data source should be
   *  provided for the prim. */
  static hasData(prim: UsdPrim): boolean {
    // UsdImagingModelSchema corresponds to UsdModelAPI, so provide
    // it when the prim has the relevant data -- i.e., assetInfo.
    //
    // Note that this is not the same as querying IsModel():
    // USD model hierarchy rules dictate that an embedded model reference
    // that is not part of the model hierarchy will return IsModel()==false.
    // Nonetheless, we still want to reflect UsdModelAPI to Hydra,
    // since the assetInfo may be required for texture asset resolution.
    // UsdObject::HasAssetInfo (object.cpp).
    return prim.getMetadata('assetInfo') !== undefined
  }

  /** dataSourcePrim.cpp:622-631 */
  getNames(): string[] {
    return [
      UsdImagingModelSchemaTokens.modelPath,
      UsdImagingModelSchemaTokens.assetIdentifier,
      UsdImagingModelSchemaTokens.assetName,
      UsdImagingModelSchemaTokens.assetVersion,
    ]
  }

  /** dataSourcePrim.cpp:633-663 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingModelSchemaTokens.modelPath) {
      return new HdRetainedTypedSampledDataSource<string>(
        this._model.path, _SdfPathType)
    } else if (name === UsdImagingModelSchemaTokens.assetIdentifier) {
      // UsdModelAPI::GetAssetIdentifier (modelAPI.cpp).
      const assetIdentifier = _GetAssetInfoByKey(this._model, 'identifier')
      if (assetIdentifier instanceof SdfAssetPath) {
        return new HdRetainedTypedSampledDataSource<SdfAssetPath>(
          assetIdentifier, _SdfAssetPathType)
      }
      return undefined
    } else if (name === UsdImagingModelSchemaTokens.assetName) {
      // UsdModelAPI::GetAssetName (modelAPI.cpp).
      const assetName = _GetAssetInfoByKey(this._model, 'name')
      if (typeof assetName === 'string') {
        return new HdRetainedTypedSampledDataSource<string>(assetName, VtValueTypes.string)
      }
      return undefined
    } else if (name === UsdImagingModelSchemaTokens.assetVersion) {
      // UsdModelAPI::GetAssetVersion (modelAPI.cpp).
      const assetVersion = _GetAssetInfoByKey(this._model, 'version')
      if (typeof assetVersion === 'string') {
        return new HdRetainedTypedSampledDataSource<string>(assetVersion, VtValueTypes.string)
      }
      return undefined
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrim.cpp:667-680: check if the given USD prim has any authored
 *  UsdGeomXformable attrs. */
function _HasAuthoredXform(usdPrim: UsdPrim): boolean {
  for (const attrName of _UsdGeomXformableLocalSchemaAttributeNames) {
    // UsdPrim::GetProperty(attrName) / UsdProperty::IsAuthored: the
    // property has an authored spec, i.e. is among the prim's authored
    // property names.
    if (usdPrim.getAuthoredPropertyNames(name => name === attrName).length !== 0) {
      return true
    }
  }
  return false
}

/** dataSourcePrim.h:417-489: data source representing a basic USD prim.
 *  This class is meant to check for behaviors we might expect on all nodes
 *  of the scene, including interior nodes; e.g. xform, visibility. It's
 *  expected that concrete imaging types would derive from this and add
 *  imaging prim-related attributes.
 *
 *  Note: while every prim gets at least this datasource defined on it, this
 *  datasource tries to aggressively early out of attribute checks based on
 *  type information (IsA/HasA) or namespace-accelerated attribute checks.
 *
 *  Since a Usd prim can populate multiple imaging prims (e.g. /prim,
 *  /prim.a, /prim.b); and since the default prim path (/prim) is always
 *  populated; we drop inherited attributes on subprims (/prim.a), letting
 *  them inherit from /prim instead.  This way we don't (e.g.) double-apply
 *  transforms. */
export class UsdImagingDataSourcePrim extends HdContainerDataSource {
  private readonly _sceneIndexPath: string
  private readonly _usdPrim: UsdPrim
  private readonly _stageGlobals: UsdImagingDataSourceStageGlobals

  /** dataSourcePrim.cpp:682-690. Use to construct a new
   *  UsdImagingDataSourcePrim.
   *
   *  `sceneIndexPath` is the path of this object in the scene index.
   *  (Note: this can be different than the usd path if one usd prim
   *  inserts multiple imaging prims).
   *
   *  `usdPrim` is the USD prim object that this data source represents.
   *
   *  `stageGlobals` represents the context object for the UsdStage with
   *  which to evaluate this attribute data source.
   *
   *  Note: client code calls this via static New(). */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    this._sceneIndexPath = sceneIndexPath
    this._usdPrim = usdPrim
    this._stageGlobals = stageGlobals
  }

  static new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePrim {
    return new UsdImagingDataSourcePrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  // Accessors, for derived classes...
  /** dataSourcePrim.h:469-471 */
  protected _getSceneIndexPath(): string {
    return this._sceneIndexPath
  }

  /** dataSourcePrim.h:473-475 */
  protected _getUsdPrim(): UsdPrim {
    return this._usdPrim
  }

  /** dataSourcePrim.h:477-479 */
  protected _getStageGlobals(): UsdImagingDataSourceStageGlobals {
    return this._stageGlobals
  }

  /** SdfPath::IsPrimPath of the scene index path (asked by every Get). */
  private _sceneIndexPathIsPrimPath(): boolean {
    return this._isPrimPath ??= SdfPath.fromString(this._sceneIndexPath).isPrimPath()
  }
  private _isPrimPath: boolean | undefined

  /** dataSourcePrim.cpp:692-739: returns the names for which this data
   *  source can return meaningful results. */
  getNames(): string[] {
    if (!this._sceneIndexPathIsPrimPath()) {
      return []
    }

    const usdPrim = this._getUsdPrim()

    const vec: string[] = [
      UsdImagingUsdPrimInfoSchema.getSchemaToken(),
      HdPrimOriginSchema.getSchemaToken(),
    ]

    if (_UsdGeomPrimvarsAPIGetAuthoredPrimvars(usdPrim).length !== 0) {
      vec.push(HdPrimvarsSchema.getSchemaToken())
    }

    if (usdPrim.isA('Imageable')) {
      vec.push(HdVisibilitySchema.getSchemaToken())
      if (_HasNonDefaultPurpose(usdPrim)) {
        vec.push(HdPurposeSchema.getSchemaToken())
      }
    }

    if (usdPrim.isA('Xformable')) {
      vec.push(HdXformSchema.getSchemaToken())
      if (_HasAuthoredXform(usdPrim)) {
        vec.push(UsdImagingGeomXformVectorsSchema.getSchemaToken())
      }
    }

    if (usdPrim.isA('Boundable')) {
      vec.push(HdExtentSchema.getSchemaToken())
    }

    if (usdPrim.isModel()) {
      vec.push(UsdImagingModelSchema.getSchemaToken())
    }

    // UsdGeomModelAPI::GetExtentsHintAttr (modelAPI.cpp:367-371).
    if (new UsdAttributeQuery(usdPrim.getAttr(_UsdGeomTokens.extentsHint))
      .hasAuthoredValue()) {
      vec.push(UsdImagingExtentsHintSchema.getSchemaToken())
    }

    return vec
  }

  /** dataSourcePrim.cpp:741-861: returns the data source representing
   *  `name`, if valid. */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._sceneIndexPathIsPrimPath()) {
      return undefined
    }

    if (name === HdXformSchema.getSchemaToken()) {
      // UsdGeomXformable xformable(_GetUsdPrim()); if (!xformable)
      const xformable = this._getUsdPrim()
      if (!xformable.isValid() || !xformable.isA('Xformable')) {
        return undefined
      }

      const xformQuery = new UsdGeomXformableXformQuery(xformable)
      if (xformQuery.transformMightHaveEffect()) {
        return UsdImagingDataSourceXform.new(
          xformQuery, this._sceneIndexPath, this._getStageGlobals())
      } else {
        return undefined
      }
    } else if (name === HdPrimvarsSchema.getSchemaToken()) {
      // Return null data source if no primvars exist.
      if (_UsdGeomPrimvarsAPIGetAuthoredPrimvars(this._getUsdPrim()).length === 0) {
        return undefined
      }
      return UsdImagingDataSourcePrimvars.new(
        this._getSceneIndexPath(),
        this._getUsdPrim(),
        this._getStageGlobals())
    } else if (name === HdVisibilitySchema.getSchemaToken()) {
      // UsdGeomImageable imageable(_GetUsdPrim()); if (!imageable)
      const imageable = this._getUsdPrim()
      if (!imageable.isValid() || !imageable.isA('Imageable')) {
        return undefined
      }

      // UsdGeomImageable::GetVisibilityAttr
      const visibilityQuery = new UsdAttributeQuery(imageable.getAttr(_UsdGeomTokens.visibility))
      if (visibilityQuery.hasAuthoredValue()) {
        return UsdImagingDataSourceVisibility.new(
          visibilityQuery, this._sceneIndexPath, this._getStageGlobals())
      } else {
        return undefined
      }
    } else if (name === HdPurposeSchema.getSchemaToken()) {
      const imageable = this._getUsdPrim()
      if (_HasNonDefaultPurpose(imageable)) {
        return UsdImagingDataSourcePurpose.new(
          // UsdGeomImageable::GetPurposeAttr
          new UsdAttributeQuery(imageable.getAttr(_UsdGeomTokens.purpose)),
          this._getStageGlobals())
      }
      return undefined
    } else if (name === HdExtentSchema.getSchemaToken()) {
      // UsdGeomBoundable boundable(_GetUsdPrim()); if (!boundable)
      const boundable = this._getUsdPrim()
      if (!boundable.isValid() || !boundable.isA('Boundable')) {
        return undefined
      }

      // UsdGeomBoundable::GetExtentAttr
      const extentQuery = new UsdAttributeQuery(boundable.getAttr(_UsdGeomTokens.extent))
      if (extentQuery.hasAuthoredValue()) {
        return UsdImagingDataSourceExtent.new(
          extentQuery,
          this._sceneIndexPath,
          this._getStageGlobals())
      } else {
        return undefined
      }
    } else if (name === UsdImagingExtentsHintSchema.getSchemaToken()) {
      // For compatibility with UsdImagingDelegate, we read the extentsHint
      // even if the prim is not a Usd model or UsdGeomModelAPI.
      const extentsHintQuery = new UsdAttributeQuery(
        // UsdGeomModelAPI::GetExtentsHintAttr (modelAPI.cpp:367-371).
        this._getUsdPrim().getAttr(_UsdGeomTokens.extentsHint))
      if (extentsHintQuery.hasAuthoredValue()) {
        return UsdImagingDataSourceExtentsHint.new(
          extentsHintQuery,
          this._sceneIndexPath,
          this._getStageGlobals())
      } else {
        return undefined
      }
    } else if (name === UsdImagingModelSchema.getSchemaToken()) {
      // UsdModelAPI model = UsdModelAPI(_GetUsdPrim()); if (model)
      const model = this._getUsdPrim()
      if (model.isValid()) {
        if (UsdImagingDataSourcePrim_ModelAPI.hasData(this._usdPrim)) {
          return UsdImagingDataSourcePrim_ModelAPI.new(model)
        }
      }
      return undefined
    } else if (name === UsdImagingUsdPrimInfoSchema.getSchemaToken()) {
      return UsdImagingDataSourceUsdPrimInfo.new(
        this._getUsdPrim())
    } else if (name === HdPrimOriginSchema.getSchemaToken()) {
      return UsdImagingDataSourcePrimOrigin.new(
        this._getUsdPrim())
    } else if (name === UsdImagingGeomXformVectorsSchema.getSchemaToken()) {
      // XXX Note that this data source does not currently support
      // returning multi-sampled data.
      const usdPrim = this._getUsdPrim()
      if (_HasAuthoredXform(usdPrim)) {
        const [translation, rotation, scale, pivot, rotOrder] =
          new UsdGeomXformCommonAPI(usdPrim, usdPrim.getStage())
            .getXformVectorsByAccumulation(_UsdGeomTime(this._stageGlobals.getTime()))
        return new UsdImagingGeomXformVectorsSchema.Builder()
          .setTranslation(
            new HdRetainedTypedSampledDataSource<GfVec3d>(new GfVec3d(translation), VtValueTypes.GfVec3d))
          .setRotation(
            new HdRetainedTypedSampledDataSource<GfVec3f>(new GfVec3f(rotation), VtValueTypes.GfVec3f))
          .setScale(
            new HdRetainedTypedSampledDataSource<GfVec3f>(new GfVec3f(scale), VtValueTypes.GfVec3f))
          .setPivot(
            new HdRetainedTypedSampledDataSource<GfVec3f>(new GfVec3f(pivot), VtValueTypes.GfVec3f))
          .setRotationOrder(
            // TfEnum::GetName(UsdGeomXformCommonAPI::RotationOrder).
            new HdRetainedTypedSampledDataSource<string>(
              'RotationOrder' + rotOrder, _TfTokenType))
          .build()
      }
    }
    return undefined
  }

  /** dataSourcePrim.cpp:863-911: returns the hydra attribute set we should
   *  invalidate if the value of the USD properties in `properties`
   *  change. */
  static invalidate(
    _prim: UsdPrim,
    _subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = new HdDataSourceLocatorSet()

    for (const propertyName of properties) {
      if (propertyName === _UsdGeomTokens.visibility) {
        locators.insert(HdVisibilitySchema.getDefaultLocator())
      }

      if (propertyName === _UsdGeomTokens.purpose) {
        locators.insert(HdPurposeSchema.getDefaultLocator())
      }

      if (_UsdGeomXformableIsTransformationAffectedByAttrNamed(propertyName)) {
        locators.insert(HdXformSchema.getDefaultLocator())
      }

      if (propertyName === _UsdGeomTokens.extent) {
        locators.insert(HdExtentSchema.getDefaultLocator())
      }

      if (propertyName === _UsdGeomTokens.extentsHint) {
        locators.insert(UsdImagingExtentsHintSchema.getDefaultLocator())
      }

      if (_UsdGeomPrimvarsAPICanContainPropertyName(propertyName)) {
        if (invalidationType === UsdImagingPropertyInvalidationType.Resync) {
          locators.insert(
            HdPrimvarsSchema.getDefaultLocator())
        } else {
          const prefixLength = 9 // "primvars:"
          locators.insert(
            HdPrimvarsSchema.getDefaultLocator()
              .append(propertyName.slice(prefixLength)))
        }
      }
    }

    // Changes to the variant selections for a prim should result in a resync
    // of the prim and its descendants, so we don't need to handle that here.

    return locators
  }
}

