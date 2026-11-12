// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceCamera.cpp,
//  pxr/usdImaging/usdImaging/dataSourceCamera.h, pxr/imaging/hd/dataSource.cpp
// Copyright 2021, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceCamera.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - HdTypedSampledDataSource<float>::Cast / HdTypedSampledDataSource<
//   VtArray<GfVec4f>>::Cast (dataSourceCamera.cpp:294-306) are dynamic casts
//   on the C++ class UsdImagingDataSourceAttributeNew instantiated for the
//   attribute's value type. TypeScript has one attribute data source class
//   (dataSourceAttribute.ts header), so the cast is decided by the
//   attribute's Sdf value type name instead (see _CastToTyped).
// - HdGetMergedContributingSampleTimesForInterval (hd/dataSource.cpp:77-119)
//   is not exported by typescript-usd/hd; it is ported locally below.

import { Camera as GfCamera, Vec4d as GfVec4d, type Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  CameraSchema as HdCameraSchema,
  CameraSchemaTokens as HdCameraSchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  GetContributingSampleTimesForInterval as HdGetContributingSampleTimesForInterval,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
  type SampledDataSource as HdSampledDataSource,
} from 'typescript-usd/hd'
import { TimeCode as UsdTimeCode, type Attribute as UsdAttribute, type Prim as UsdPrim } from 'typescript-usd/usd'
import { Camera as UsdGeomCamera } from 'typescript-usd/usdGeom'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

// UsdGeomTokens used below.
const _UsdGeomTokens = {
  projection: 'projection',
  horizontalAperture: 'horizontalAperture',
  verticalAperture: 'verticalAperture',
  horizontalApertureOffset: 'horizontalApertureOffset',
  verticalApertureOffset: 'verticalApertureOffset',
  focalLength: 'focalLength',
  clippingRange: 'clippingRange',
  clippingPlanes: 'clippingPlanes',
  fStop: 'fStop',
  focusDistance: 'focusDistance',
  stereoRole: 'stereoRole',
  shutterOpen: 'shutter:open',
  shutterClose: 'shutter:close',
  exposure: 'exposure',
  exposureIso: 'exposure:iso',
  exposureTime: 'exposure:time',
  exposureFStop: 'exposure:fStop',
  exposureResponsivity: 'exposure:responsivity',
} as const

/** UsdGeomCamera::GetSchemaAttributeNames(false) (usdGeom/camera.cpp:409-439):
 *  the camera schema's own attribute names. */
const _usdGeomCameraSchemaAttributeNames: readonly string[] = [
  _UsdGeomTokens.projection,
  _UsdGeomTokens.horizontalAperture,
  _UsdGeomTokens.verticalAperture,
  _UsdGeomTokens.horizontalApertureOffset,
  _UsdGeomTokens.verticalApertureOffset,
  _UsdGeomTokens.focalLength,
  _UsdGeomTokens.clippingRange,
  _UsdGeomTokens.clippingPlanes,
  _UsdGeomTokens.fStop,
  _UsdGeomTokens.focusDistance,
  _UsdGeomTokens.stereoRole,
  _UsdGeomTokens.shutterOpen,
  _UsdGeomTokens.shutterClose,
  _UsdGeomTokens.exposure,
  _UsdGeomTokens.exposureIso,
  _UsdGeomTokens.exposureTime,
  _UsdGeomTokens.exposureFStop,
  _UsdGeomTokens.exposureResponsivity,
]

/** The HdTypedSampledDataSource<T>::Cast of a data source made by
 *  UsdImagingDataSourceAttributeNew for `attr`: the data source when the
 *  attribute's value type is `sdfTypeName`, else undefined (see the header). */
function _CastToTyped<T>(
  dataSource: HdSampledDataSource | undefined, attr: UsdAttribute, sdfTypeName: string,
): HdTypedSampledDataSource<T> | undefined {
  if (!(dataSource instanceof HdTypedSampledDataSource)) return undefined
  return attr.typeName === sdfTypeName ? dataSource as HdTypedSampledDataSource<T> : undefined
}

/** hd/dataSource.cpp:62-73 _Union: the set-wise union of two sorted vectors
 *  of sample times. */
function _Union(a: readonly number[], b: readonly number[]): number[] {
  const result: number[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i]! < b[j]!) result.push(a[i++]!)
    else if (b[j]! < a[i]!) result.push(b[j++]!)
    else { result.push(a[i++]!); j++ }
  }
  while (i < a.length) result.push(a[i++]!)
  while (j < b.length) result.push(b[j++]!)
  return result
}

/** hd/dataSource.cpp:76-119 HdGetMergedContributingSampleTimesForInterval:
 *  computes union of contributing sample times from several data sources. */
function _HdGetMergedContributingSampleTimesForInterval(
  inputDataSources: readonly (HdSampledDataSource | undefined)[],
  startTime: number,
  endTime: number,
  outSampleTimes: number[],
): boolean {
  let result = false

  let sampleTimes: number[] = []

  for (const input of inputDataSources) {
    if (!input) {
      continue
    }
    const times: number[] = []
    if (!input.GetContributingSampleTimesForInterval(startTime, endTime, times)) {
      continue
    }
    result = true
    if (sampleTimes.length === 0) {
      sampleTimes = times
    } else {
      sampleTimes = _Union(sampleTimes, times)
    }
  }

  if (!result) {
    return false
  }

  const contributing = HdGetContributingSampleTimesForInterval(
    sampleTimes.length, sampleTimes, startTime, endTime)
  outSampleTimes.length = 0
  outSampleTimes.push(...contributing.sampleTimes)
  return contributing.changing
}

/** dataSourceCamera.cpp:17-59 */
class _ScalingTypedSampledDataSource extends HdTypedSampledDataSource<number> {
  constructor(
    private readonly _dataSource: HdTypedSampledDataSource<number> | undefined,
    private readonly _scale: number,
  ) { super() }

  static new(
    dataSource: HdTypedSampledDataSource<number> | undefined, scale: number,
  ): _ScalingTypedSampledDataSource {
    return new _ScalingTypedSampledDataSource(dataSource, scale)
  }

  override GetValue(shutterOffset: number): VtValue {
    // T = float
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.float)
  }

  getTypedValue(shutterOffset: number): number {
    if (!this._dataSource) {
      return 0.0
    }
    // float * float
    return Math.fround(this._dataSource.getTypedValue(shutterOffset) * this._scale)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._dataSource) {
      return false
    }
    return this._dataSource.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceCamera.cpp:61-110 */
class _Vec4fArrayToVec4dArrayDataSource extends HdTypedSampledDataSource<VtArray<GfVec4d>> {
  constructor(
    private readonly _dataSource: HdTypedSampledDataSource<VtArray<GfVec4f>> | undefined,
  ) { super() }

  static new(
    dataSource: HdTypedSampledDataSource<VtArray<GfVec4f>> | undefined,
  ): _Vec4fArrayToVec4dArrayDataSource {
    return new _Vec4fArrayToVec4dArrayDataSource(dataSource)
  }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset))
  }

  getTypedValue(shutterOffset: number): VtArray<GfVec4d> {
    const result: GfVec4d[] = []
    if (!this._dataSource) {
      return new VtArray<GfVec4d>(result, VtValueTypes.GfVec4d)
    }

    const data = this._dataSource.getTypedValue(shutterOffset)
    for (const v of data ?? []) {
      result.push(new GfVec4d(v))
    }
    return new VtArray<GfVec4d>(result, VtValueTypes.GfVec4d)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._dataSource) {
      return false
    }

    return this._dataSource.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** dataSourceCamera.cpp:112-182 */
class _CameraLinearExposureScaleDataSource extends HdTypedSampledDataSource<number> {
  // Copies of the input attributes, for time-varyingness and time samples.
  private readonly _inputs: (HdSampledDataSource | undefined)[] = []

  constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdCamera: UsdGeomCamera,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    const linearExposureScaleLocator = HdCameraSchema.getLinearExposureScaleLocator()

    const inputNames = [
      _UsdGeomTokens.exposure,
      _UsdGeomTokens.exposureTime,
      _UsdGeomTokens.exposureIso,
      _UsdGeomTokens.exposureFStop,
      _UsdGeomTokens.exposureResponsivity,
    ]

    // Upstream resizes _inputs to inputNames.size() and then appends, so
    // the vector starts with that many null entries, which
    // HdGetMergedContributingSampleTimesForInterval skips.
    this._inputs.length = inputNames.length
    const prim = this._usdCamera.prim
    for (const inputName of inputNames) {
      const attr = prim.getAttr(inputName)
      this._inputs.push(attr?.isValid()
        ? UsdImagingDataSourceAttributeNew(
          attr,
          this._stageGlobals,
          this._sceneIndexPath,
          linearExposureScaleLocator)
        : undefined)
    }
  }

  static new(
    sceneIndexPath: string, usdCamera: UsdGeomCamera, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _CameraLinearExposureScaleDataSource {
    return new _CameraLinearExposureScaleDataSource(sceneIndexPath, usdCamera, stageGlobals)
  }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.float)
  }

  getTypedValue(shutterOffset: number): number {
    let time = this._stageGlobals.getTime()
    if (time.isNumeric()) {
      time = new UsdTimeCode(time.GetValue() + shutterOffset)
    }
    // UsdGeomCamera::ComputeLinearExposureScale returns a float.
    return Math.fround(this._usdCamera.computeLinearExposureScale(
      time.isDefault() ? undefined : time.GetValue()))
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return _HdGetMergedContributingSampleTimesForInterval(
      this._inputs,
      startTime,
      endTime,
      outSampleTimes)
  }
}

/** dataSourceCamera.h:21-45: a container data source representing camera
 *  info. */
export class UsdImagingDataSourceCamera extends HdContainerDataSource {
  /** dataSourceCamera.cpp:186-194 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdCamera: UsdGeomCamera,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdCamera: UsdGeomCamera, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceCamera {
    return new UsdImagingDataSourceCamera(sceneIndexPath, usdCamera, stageGlobals)
  }

  /** dataSourceCamera.cpp:196-241 */
  getNames(): string[] {
    const result: string[] = []

    // XXX Currently Get() will retrieve any attribute on the camera prim,
    // mapping certain camera attributes to Hydra camera schema equivalents.
    //
    // To ensure the Hydra Scene Debugger reflects an accurate view
    // of the data source, we match this behavior here.  If in the future
    // we restrict this data source to only UsdGeomCamera schema attributes,
    // we should revise this back to
    //
    // UsdGeomCamera::GetSchemaAttributeNames(
    //     /* includeInherited = */ false);
    //
    // ... along with the remapping to HdCameraSchema equivalents.
    //
    // For now, we pull in all USD attributes.
    // UsdPrim::GetAttributes: the properties that are attributes.
    const attrs = this._usdCamera.prim.getProperties().filter((p: UsdAttribute) => !p.isRelationship)
    for (const attr of attrs) {
      let name = attr.name
      if (name === _UsdGeomTokens.shutterOpen) {
        name = HdCameraSchemaTokens.shutterOpen
      } else if (name === _UsdGeomTokens.shutterClose) {
        name = HdCameraSchemaTokens.shutterClose
      } else if (name === _UsdGeomTokens.exposureTime) {
        name = HdCameraSchemaTokens.exposureTime
      } else if (name === _UsdGeomTokens.exposureIso) {
        name = HdCameraSchemaTokens.exposureIso
      } else if (name === _UsdGeomTokens.exposureFStop) {
        name = HdCameraSchemaTokens.exposureFStop
      } else if (name === _UsdGeomTokens.exposureResponsivity) {
        name = HdCameraSchemaTokens.exposureResponsivity
      }
      result.push(name)
    }

    // linearExposureScale is synthesized by Get() and has no corresponding
    // USD attribute in the camera schema.
    result.push(HdCameraSchemaTokens.linearExposureScale)

    return result
  }

  /** dataSourceCamera.cpp:243-308 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdCameraSchemaTokens.linearExposureScale) {
      return _CameraLinearExposureScaleDataSource.new(
        this._sceneIndexPath, this._usdCamera, this._stageGlobals)
    }

    // Handle necessary schema name conversions.
    let usdName = name
    // UsdGeomTokens->shutterOpen is "shutter:open" and thus different
    // from the camera schema.
    if (name === HdCameraSchemaTokens.shutterOpen) {
      usdName = _UsdGeomTokens.shutterOpen
    }
    // Similar to shutterOpen.
    else if (name === HdCameraSchemaTokens.shutterClose) {
      usdName = _UsdGeomTokens.shutterClose
    }
    // Hydra "exposure" attribute maps unchanged to USD "exposure".
    // Other Hydra "exposure" attributes need to be mapped due to e.g.
    // "exposure:time" vs "exposureTime"
    else if (name === HdCameraSchemaTokens.exposureTime) {
      usdName = _UsdGeomTokens.exposureTime
    }
    else if (name === HdCameraSchemaTokens.exposureIso) {
      usdName = _UsdGeomTokens.exposureIso
    }
    else if (name === HdCameraSchemaTokens.exposureFStop) {
      usdName = _UsdGeomTokens.exposureFStop
    }
    else if (name === HdCameraSchemaTokens.exposureResponsivity) {
      usdName = _UsdGeomTokens.exposureResponsivity
    }

    // Grab the attribute
    const attr = this._usdCamera.prim.getAttr(usdName)
    if (!attr?.isValid()) {
      return undefined
    }
    const dataSource = UsdImagingDataSourceAttributeNew(
      attr,
      this._stageGlobals,
      this._sceneIndexPath,
      HdCameraSchema.getDefaultLocator().append(name))

    // Handle necessary type/scale conversions.
    if (name === _UsdGeomTokens.horizontalAperture ||
        name === _UsdGeomTokens.verticalAperture ||
        name === _UsdGeomTokens.horizontalApertureOffset ||
        name === _UsdGeomTokens.verticalApertureOffset) {
      return _ScalingTypedSampledDataSource.new(
        _CastToTyped<number>(dataSource, attr, 'float'),
        Math.fround(GfCamera.APERTURE_UNIT))
    } else if (name === _UsdGeomTokens.focalLength) {
      return _ScalingTypedSampledDataSource.new(
        _CastToTyped<number>(dataSource, attr, 'float'),
        Math.fround(GfCamera.FOCAL_LENGTH_UNIT))
    } else if (name === _UsdGeomTokens.clippingPlanes) {
      return _Vec4fArrayToVec4dArrayDataSource.new(
        _CastToTyped<VtArray<GfVec4f>>(dataSource, attr, 'float4[]'))
    }

    return dataSource
  }
}

// ----------------------------------------------------------------------------

/** dataSourceCamera.h:49-76: a prim data source representing a UsdGeomCamera
 *  prim. */
export class UsdImagingDataSourceCameraPrim extends UsdImagingDataSourcePrim {
  /** dataSourceCamera.cpp:310-318 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceCameraPrim {
    return new UsdImagingDataSourceCameraPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceCamera.cpp:320-326 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdCameraSchema.getSchemaToken())
    return result
  }

  /** dataSourceCamera.cpp:328-339 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdCameraSchema.getSchemaToken()) {
      return UsdImagingDataSourceCamera.new(
        this._getSceneIndexPath(),
        new UsdGeomCamera(this._getUsdPrim()),
        this._getStageGlobals())
    }

    return super.Get(name)
  }

  /** dataSourceCamera.cpp:341-411 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourcePrim.invalidate(
      prim, subprim, properties, invalidationType)

    const usdNames = _usdGeomCameraSchemaAttributeNames

    for (const propertyName of properties) {
      for (const usdName of usdNames) {
        if (propertyName === usdName) {
          if (usdName === _UsdGeomTokens.shutterOpen) {
            // UsdGeomTokens->shutterOpen is "shutter:open" and thus
            // different from camera schema.
            locators.insert(
              HdCameraSchema.getShutterOpenLocator())
          } else if (usdName === _UsdGeomTokens.shutterClose) {
            // Similar to shutterOpen.
            locators.insert(
              HdCameraSchema.getShutterCloseLocator())
          } else if (usdName === _UsdGeomTokens.exposure) {
            // "exposure" maps unchanged to "exposure", and is an input
            // to the computed value stored at "linearExposureScale"
            locators.insert(
              HdCameraSchema.getExposureLocator())
            locators.insert(
              HdCameraSchema.getLinearExposureScaleLocator())
          } else if (usdName === _UsdGeomTokens.exposureTime) {
            // "exposure:time" maps to "exposureTime", and is an input
            // to the computed value stored at "linearExposureScale"
            locators.insert(
              HdCameraSchema.getExposureTimeLocator())
            locators.insert(
              HdCameraSchema.getLinearExposureScaleLocator())
          } else if (usdName === _UsdGeomTokens.exposureIso) {
            // similar to exposureTime
            locators.insert(
              HdCameraSchema.getExposureIsoLocator())
            locators.insert(
              HdCameraSchema.getLinearExposureScaleLocator())
          } else if (usdName === _UsdGeomTokens.exposureFStop) {
            // similar to exposureTime
            locators.insert(
              HdCameraSchema.getExposureFStopLocator())
            locators.insert(
              HdCameraSchema.getLinearExposureScaleLocator())
          } else if (usdName === _UsdGeomTokens.exposureResponsivity) {
            // similar to exposureTime
            locators.insert(
              HdCameraSchema.getExposureResponsivityLocator())
            locators.insert(
              HdCameraSchema.getLinearExposureScaleLocator())
          } else {
            locators.insert(
              HdCameraSchema.getDefaultLocator().append(
                propertyName))
          }
        }
      }
    }

    return locators
  }
}
