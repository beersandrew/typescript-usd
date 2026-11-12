// Ported from OpenUSD 26.11.1: pxr/imaging/hd/cameraSchema.cpp,
//  pxr/imaging/hd/cameraSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/cameraSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Camera entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream cameraSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdDoubleDataSource, HdFloatDataSource, HdTokenDataSource, HdVec2fDataSource, HdVec4dArrayDataSource } from './dataSourceTypeDefs.ts'
import { HdLensDistortionSchema } from './lensDistortionSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdBackPlateContainerSchema, HdSampledDataSourceContainerContainerSchema } from './schemaTypeDefs.ts'
import { HdSplitDiopterSchema } from './splitDiopterSchema.ts'

/** cameraSchema.h TF_DECLARE_PUBLIC_TOKENS(HdCameraSchemaTokens) */
export const HdCameraSchemaTokens = TfMakeTokens({
  camera: 'camera',
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
  shutterOpen: 'shutterOpen',
  shutterClose: 'shutterClose',
  exposure: 'exposure',
  exposureTime: 'exposureTime',
  exposureIso: 'exposureIso',
  exposureFStop: 'exposureFStop',
  exposureResponsivity: 'exposureResponsivity',
  linearExposureScale: 'linearExposureScale',
  focusOn: 'focusOn',
  dofAspect: 'dofAspect',
  splitDiopter: 'splitDiopter',
  lensDistortion: 'lensDistortion',
  namespacedProperties: 'namespacedProperties',
  backPlate: 'backPlate',
  perspective: 'perspective',
  orthographic: 'orthographic',
})

export class HdCameraSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** cameraSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdCameraSchema {
    const ds = fromParentContainer?.Get(HdCameraSchemaTokens.camera)
    return new HdCameraSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  GetProjection(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdCameraSchemaTokens.projection)
  }

  GetHorizontalAperture(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.horizontalAperture)
  }

  getVerticalAperture(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.verticalAperture)
  }

  getHorizontalApertureOffset(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.horizontalApertureOffset)
  }

  getVerticalApertureOffset(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.verticalApertureOffset)
  }

  getFocalLength(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.focalLength)
  }

  getClippingRange(): HdVec2fDataSource | undefined {
    return this._getTypedDataSource<HdVec2fDataSource>(HdCameraSchemaTokens.clippingRange)
  }

  getClippingPlanes(): HdVec4dArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec4dArrayDataSource>(HdCameraSchemaTokens.clippingPlanes)
  }

  getFStop(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.fStop)
  }

  getFocusDistance(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.focusDistance)
  }

  getShutterOpen(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCameraSchemaTokens.shutterOpen)
  }

  getShutterClose(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdCameraSchemaTokens.shutterClose)
  }

  getExposure(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.exposure)
  }

  getExposureTime(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.exposureTime)
  }

  getExposureIso(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.exposureIso)
  }

  getExposureFStop(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.exposureFStop)
  }

  getExposureResponsivity(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.exposureResponsivity)
  }

  getLinearExposureScale(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.linearExposureScale)
  }

  getFocusOn(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdCameraSchemaTokens.focusOn)
  }

  getDofAspect(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdCameraSchemaTokens.dofAspect)
  }

  getSplitDiopter(): HdSplitDiopterSchema {
    return new HdSplitDiopterSchema(this._getContainerDataSource(HdCameraSchemaTokens.splitDiopter))
  }

  getLensDistortion(): HdLensDistortionSchema {
    return new HdLensDistortionSchema(this._getContainerDataSource(HdCameraSchemaTokens.lensDistortion))
  }

  getNamespacedProperties(): HdSampledDataSourceContainerContainerSchema {
    return new HdSampledDataSourceContainerContainerSchema(this._getContainerDataSource(HdCameraSchemaTokens.namespacedProperties))
  }

  getBackPlate(): HdBackPlateContainerSchema {
    return new HdBackPlateContainerSchema(this._getContainerDataSource(HdCameraSchemaTokens.backPlate))
  }

  static getSchemaToken(): TfToken {
    return HdCameraSchemaTokens.camera
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdCameraSchema._defaultLocator ??= new HdDataSourceLocator(HdCameraSchema.getSchemaToken())
  }

  private static _shutterOpenLocator: HdDataSourceLocator | undefined
  static getShutterOpenLocator(): HdDataSourceLocator {
    return HdCameraSchema._shutterOpenLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.shutterOpen)
  }

  private static _shutterCloseLocator: HdDataSourceLocator | undefined
  static getShutterCloseLocator(): HdDataSourceLocator {
    return HdCameraSchema._shutterCloseLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.shutterClose)
  }

  private static _exposureLocator: HdDataSourceLocator | undefined
  static getExposureLocator(): HdDataSourceLocator {
    return HdCameraSchema._exposureLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.exposure)
  }

  private static _exposureTimeLocator: HdDataSourceLocator | undefined
  static getExposureTimeLocator(): HdDataSourceLocator {
    return HdCameraSchema._exposureTimeLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.exposureTime)
  }

  private static _exposureIsoLocator: HdDataSourceLocator | undefined
  static getExposureIsoLocator(): HdDataSourceLocator {
    return HdCameraSchema._exposureIsoLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.exposureIso)
  }

  private static _exposureFStopLocator: HdDataSourceLocator | undefined
  static getExposureFStopLocator(): HdDataSourceLocator {
    return HdCameraSchema._exposureFStopLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.exposureFStop)
  }

  private static _exposureResponsivityLocator: HdDataSourceLocator | undefined
  static getExposureResponsivityLocator(): HdDataSourceLocator {
    return HdCameraSchema._exposureResponsivityLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.exposureResponsivity)
  }

  private static _linearExposureScaleLocator: HdDataSourceLocator | undefined
  static getLinearExposureScaleLocator(): HdDataSourceLocator {
    return HdCameraSchema._linearExposureScaleLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.linearExposureScale)
  }

  private static _namespacedPropertiesLocator: HdDataSourceLocator | undefined
  static getNamespacedPropertiesLocator(): HdDataSourceLocator {
    return HdCameraSchema._namespacedPropertiesLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.namespacedProperties)
  }

  private static _backPlateLocator: HdDataSourceLocator | undefined
  static getBackPlateLocator(): HdDataSourceLocator {
    return HdCameraSchema._backPlateLocator ??= HdCameraSchema.getDefaultLocator().append(HdCameraSchemaTokens.backPlate)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    projection?: HdTokenDataSource | undefined,
    horizontalAperture?: HdFloatDataSource | undefined,
    verticalAperture?: HdFloatDataSource | undefined,
    horizontalApertureOffset?: HdFloatDataSource | undefined,
    verticalApertureOffset?: HdFloatDataSource | undefined,
    focalLength?: HdFloatDataSource | undefined,
    clippingRange?: HdVec2fDataSource | undefined,
    clippingPlanes?: HdVec4dArrayDataSource | undefined,
    fStop?: HdFloatDataSource | undefined,
    focusDistance?: HdFloatDataSource | undefined,
    shutterOpen?: HdDoubleDataSource | undefined,
    shutterClose?: HdDoubleDataSource | undefined,
    exposure?: HdFloatDataSource | undefined,
    exposureTime?: HdFloatDataSource | undefined,
    exposureIso?: HdFloatDataSource | undefined,
    exposureFStop?: HdFloatDataSource | undefined,
    exposureResponsivity?: HdFloatDataSource | undefined,
    linearExposureScale?: HdFloatDataSource | undefined,
    focusOn?: HdBoolDataSource | undefined,
    dofAspect?: HdFloatDataSource | undefined,
    splitDiopter?: HdContainerDataSource | undefined,
    lensDistortion?: HdContainerDataSource | undefined,
    namespacedProperties?: HdContainerDataSource | undefined,
    backPlate?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdCameraSchemaTokens.projection]: projection,
      [HdCameraSchemaTokens.horizontalAperture]: horizontalAperture,
      [HdCameraSchemaTokens.verticalAperture]: verticalAperture,
      [HdCameraSchemaTokens.horizontalApertureOffset]: horizontalApertureOffset,
      [HdCameraSchemaTokens.verticalApertureOffset]: verticalApertureOffset,
      [HdCameraSchemaTokens.focalLength]: focalLength,
      [HdCameraSchemaTokens.clippingRange]: clippingRange,
      [HdCameraSchemaTokens.clippingPlanes]: clippingPlanes,
      [HdCameraSchemaTokens.fStop]: fStop,
      [HdCameraSchemaTokens.focusDistance]: focusDistance,
      [HdCameraSchemaTokens.shutterOpen]: shutterOpen,
      [HdCameraSchemaTokens.shutterClose]: shutterClose,
      [HdCameraSchemaTokens.exposure]: exposure,
      [HdCameraSchemaTokens.exposureTime]: exposureTime,
      [HdCameraSchemaTokens.exposureIso]: exposureIso,
      [HdCameraSchemaTokens.exposureFStop]: exposureFStop,
      [HdCameraSchemaTokens.exposureResponsivity]: exposureResponsivity,
      [HdCameraSchemaTokens.linearExposureScale]: linearExposureScale,
      [HdCameraSchemaTokens.focusOn]: focusOn,
      [HdCameraSchemaTokens.dofAspect]: dofAspect,
      [HdCameraSchemaTokens.splitDiopter]: splitDiopter,
      [HdCameraSchemaTokens.lensDistortion]: lensDistortion,
      [HdCameraSchemaTokens.namespacedProperties]: namespacedProperties,
      [HdCameraSchemaTokens.backPlate]: backPlate,
    })
  }

  private static _projectionDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as projection value; the values
   * perspective, orthographic are stored statically and reused. */
  static buildProjectionDataSource(projection: string): HdTokenDataSource {
    const known: readonly string[] = [HdCameraSchemaTokens.perspective, HdCameraSchemaTokens.orthographic]
    if (known.includes(projection)) {
      const cache = HdCameraSchema._projectionDataSources ??= new Map()
      let ds = cache.get(projection)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(projection)
        cache.set(projection, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(projection)
  }
}

export namespace HdCameraSchema {
  /** HdCameraSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _projection: HdTokenDataSource | undefined
    private _horizontalAperture: HdFloatDataSource | undefined
    private _verticalAperture: HdFloatDataSource | undefined
    private _horizontalApertureOffset: HdFloatDataSource | undefined
    private _verticalApertureOffset: HdFloatDataSource | undefined
    private _focalLength: HdFloatDataSource | undefined
    private _clippingRange: HdVec2fDataSource | undefined
    private _clippingPlanes: HdVec4dArrayDataSource | undefined
    private _fStop: HdFloatDataSource | undefined
    private _focusDistance: HdFloatDataSource | undefined
    private _shutterOpen: HdDoubleDataSource | undefined
    private _shutterClose: HdDoubleDataSource | undefined
    private _exposure: HdFloatDataSource | undefined
    private _exposureTime: HdFloatDataSource | undefined
    private _exposureIso: HdFloatDataSource | undefined
    private _exposureFStop: HdFloatDataSource | undefined
    private _exposureResponsivity: HdFloatDataSource | undefined
    private _linearExposureScale: HdFloatDataSource | undefined
    private _focusOn: HdBoolDataSource | undefined
    private _dofAspect: HdFloatDataSource | undefined
    private _splitDiopter: HdContainerDataSource | undefined
    private _lensDistortion: HdContainerDataSource | undefined
    private _namespacedProperties: HdContainerDataSource | undefined
    private _backPlate: HdContainerDataSource | undefined
    setProjection(projection: HdTokenDataSource | undefined): this {
      this._projection = projection
      return this
    }
    setHorizontalAperture(horizontalAperture: HdFloatDataSource | undefined): this {
      this._horizontalAperture = horizontalAperture
      return this
    }
    setVerticalAperture(verticalAperture: HdFloatDataSource | undefined): this {
      this._verticalAperture = verticalAperture
      return this
    }
    setHorizontalApertureOffset(horizontalApertureOffset: HdFloatDataSource | undefined): this {
      this._horizontalApertureOffset = horizontalApertureOffset
      return this
    }
    setVerticalApertureOffset(verticalApertureOffset: HdFloatDataSource | undefined): this {
      this._verticalApertureOffset = verticalApertureOffset
      return this
    }
    setFocalLength(focalLength: HdFloatDataSource | undefined): this {
      this._focalLength = focalLength
      return this
    }
    setClippingRange(clippingRange: HdVec2fDataSource | undefined): this {
      this._clippingRange = clippingRange
      return this
    }
    setClippingPlanes(clippingPlanes: HdVec4dArrayDataSource | undefined): this {
      this._clippingPlanes = clippingPlanes
      return this
    }
    setFStop(fStop: HdFloatDataSource | undefined): this {
      this._fStop = fStop
      return this
    }
    setFocusDistance(focusDistance: HdFloatDataSource | undefined): this {
      this._focusDistance = focusDistance
      return this
    }
    setShutterOpen(shutterOpen: HdDoubleDataSource | undefined): this {
      this._shutterOpen = shutterOpen
      return this
    }
    setShutterClose(shutterClose: HdDoubleDataSource | undefined): this {
      this._shutterClose = shutterClose
      return this
    }
    setExposure(exposure: HdFloatDataSource | undefined): this {
      this._exposure = exposure
      return this
    }
    setExposureTime(exposureTime: HdFloatDataSource | undefined): this {
      this._exposureTime = exposureTime
      return this
    }
    setExposureIso(exposureIso: HdFloatDataSource | undefined): this {
      this._exposureIso = exposureIso
      return this
    }
    setExposureFStop(exposureFStop: HdFloatDataSource | undefined): this {
      this._exposureFStop = exposureFStop
      return this
    }
    setExposureResponsivity(exposureResponsivity: HdFloatDataSource | undefined): this {
      this._exposureResponsivity = exposureResponsivity
      return this
    }
    setLinearExposureScale(linearExposureScale: HdFloatDataSource | undefined): this {
      this._linearExposureScale = linearExposureScale
      return this
    }
    setFocusOn(focusOn: HdBoolDataSource | undefined): this {
      this._focusOn = focusOn
      return this
    }
    setDofAspect(dofAspect: HdFloatDataSource | undefined): this {
      this._dofAspect = dofAspect
      return this
    }
    setSplitDiopter(splitDiopter: HdContainerDataSource | undefined): this {
      this._splitDiopter = splitDiopter
      return this
    }
    setLensDistortion(lensDistortion: HdContainerDataSource | undefined): this {
      this._lensDistortion = lensDistortion
      return this
    }
    setNamespacedProperties(namespacedProperties: HdContainerDataSource | undefined): this {
      this._namespacedProperties = namespacedProperties
      return this
    }
    setBackPlate(backPlate: HdContainerDataSource | undefined): this {
      this._backPlate = backPlate
      return this
    }
    build(): HdContainerDataSource {
      return HdCameraSchema.buildRetained(
        this._projection,
        this._horizontalAperture,
        this._verticalAperture,
        this._horizontalApertureOffset,
        this._verticalApertureOffset,
        this._focalLength,
        this._clippingRange,
        this._clippingPlanes,
        this._fStop,
        this._focusDistance,
        this._shutterOpen,
        this._shutterClose,
        this._exposure,
        this._exposureTime,
        this._exposureIso,
        this._exposureFStop,
        this._exposureResponsivity,
        this._linearExposureScale,
        this._focusOn,
        this._dofAspect,
        this._splitDiopter,
        this._lensDistortion,
        this._namespacedProperties,
        this._backPlate,
      )
    }
  }
}
