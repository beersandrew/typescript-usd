// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneGlobalsSchema.cpp,
//  pxr/imaging/hd/sceneGlobalsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sceneGlobalsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SceneGlobals entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdDoubleDataSource, HdIntDataSource, HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { HdVectorOfTypedSampledDataSourcesSchema } from './vectorSchema.ts'

/** sceneGlobalsSchema.h:36 `using HdPathVectorSchema = HdTypedVectorSchema<HdPathDataSource>;` */
export class HdPathVectorSchema extends HdVectorOfTypedSampledDataSourcesSchema<HdPathDataSource> {}

/** sceneGlobalsSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSceneGlobalsSchemaTokens) */
export const HdSceneGlobalsSchemaTokens = TfMakeTokens({
  sceneGlobals: 'sceneGlobals',
  primaryCameraPrim: 'primaryCameraPrim',
  activeRenderPassPrim: 'activeRenderPassPrim',
  activeRenderSettingsPrim: 'activeRenderSettingsPrim',
  startTimeCode: 'startTimeCode',
  endTimeCode: 'endTimeCode',
  timeCodesPerSecond: 'timeCodesPerSecond',
  currentFrame: 'currentFrame',
  sceneStateId: 'sceneStateId',
  primIdToPath: 'primIdToPath',
})

export class HdSceneGlobalsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** sceneGlobalsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSceneGlobalsSchema {
    const ds = fromParentContainer?.Get(HdSceneGlobalsSchemaTokens.sceneGlobals)
    return new HdSceneGlobalsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /** sceneGlobalsSchema.cpp:35-46. Retrieves a container data source with
   *  the schema's default name token "sceneGlobals" from the root prim of
   *  the scene index `si`. */
  static getFromSceneIndex(si: HdSceneIndexBase | undefined): HdSceneGlobalsSchema {
    if (!si) {
      TF_CODING_ERROR('Invalid input scene index provided.')
      return new HdSceneGlobalsSchema(undefined)
    }

    return HdSceneGlobalsSchema.getFromParent(
      si.getPrim(HdSceneGlobalsSchema.getDefaultPrimPath()).dataSource)
  }

  /** sceneGlobalsSchema.h:105-110. Utility method to concretize the
   *  convention of parking the "sceneGlobals" container at the root prim of
   *  the scene index. */
  static getDefaultPrimPath(): string {
    return '/'
  }

  getPrimaryCameraPrim(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdSceneGlobalsSchemaTokens.primaryCameraPrim)
  }

  getActiveRenderPassPrim(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdSceneGlobalsSchemaTokens.activeRenderPassPrim)
  }

  getActiveRenderSettingsPrim(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim)
  }

  getStartTimeCode(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdSceneGlobalsSchemaTokens.startTimeCode)
  }

  getEndTimeCode(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdSceneGlobalsSchemaTokens.endTimeCode)
  }

  getTimeCodesPerSecond(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdSceneGlobalsSchemaTokens.timeCodesPerSecond)
  }

  getCurrentFrame(): HdDoubleDataSource | undefined {
    return this._getTypedDataSource<HdDoubleDataSource>(HdSceneGlobalsSchemaTokens.currentFrame)
  }

  getSceneStateId(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdSceneGlobalsSchemaTokens.sceneStateId)
  }

  /** sceneGlobalsSchema.cpp:106-111 */
  getPrimIdToPath(): HdPathVectorSchema {
    return new HdPathVectorSchema(this._getVectorDataSource(HdSceneGlobalsSchemaTokens.primIdToPath))
  }

  static getSchemaToken(): TfToken {
    return HdSceneGlobalsSchemaTokens.sceneGlobals
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._defaultLocator ??= new HdDataSourceLocator(HdSceneGlobalsSchema.getSchemaToken())
  }

  private static _primaryCameraPrimLocator: HdDataSourceLocator | undefined
  static getPrimaryCameraPrimLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._primaryCameraPrimLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.primaryCameraPrim)
  }

  private static _activeRenderPassPrimLocator: HdDataSourceLocator | undefined
  static getActiveRenderPassPrimLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._activeRenderPassPrimLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.activeRenderPassPrim)
  }

  private static _activeRenderSettingsPrimLocator: HdDataSourceLocator | undefined
  static getActiveRenderSettingsPrimLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._activeRenderSettingsPrimLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim)
  }

  private static _startTimeCodeLocator: HdDataSourceLocator | undefined
  static getStartTimeCodeLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._startTimeCodeLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.startTimeCode)
  }

  private static _endTimeCodeLocator: HdDataSourceLocator | undefined
  static getEndTimeCodeLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._endTimeCodeLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.endTimeCode)
  }

  private static _timeCodesPerSecondLocator: HdDataSourceLocator | undefined
  static getTimeCodesPerSecondLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._timeCodesPerSecondLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.timeCodesPerSecond)
  }

  private static _currentFrameLocator: HdDataSourceLocator | undefined
  static getCurrentFrameLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._currentFrameLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.currentFrame)
  }

  private static _sceneStateIdLocator: HdDataSourceLocator | undefined
  static getSceneStateIdLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._sceneStateIdLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.sceneStateId)
  }

  private static _primIdToPathLocator: HdDataSourceLocator | undefined
  /** sceneGlobalsSchema.cpp:375-382 */
  static getPrimIdToPathLocator(): HdDataSourceLocator {
    return HdSceneGlobalsSchema._primIdToPathLocator ??= HdSceneGlobalsSchema.getDefaultLocator().append(HdSceneGlobalsSchemaTokens.primIdToPath)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    primaryCameraPrim?: HdPathDataSource | undefined,
    activeRenderPassPrim?: HdPathDataSource | undefined,
    activeRenderSettingsPrim?: HdPathDataSource | undefined,
    startTimeCode?: HdDoubleDataSource | undefined,
    endTimeCode?: HdDoubleDataSource | undefined,
    timeCodesPerSecond?: HdDoubleDataSource | undefined,
    currentFrame?: HdDoubleDataSource | undefined,
    sceneStateId?: HdIntDataSource | undefined,
    primIdToPath?: HdVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSceneGlobalsSchemaTokens.primaryCameraPrim]: primaryCameraPrim,
      [HdSceneGlobalsSchemaTokens.activeRenderPassPrim]: activeRenderPassPrim,
      [HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim]: activeRenderSettingsPrim,
      [HdSceneGlobalsSchemaTokens.startTimeCode]: startTimeCode,
      [HdSceneGlobalsSchemaTokens.endTimeCode]: endTimeCode,
      [HdSceneGlobalsSchemaTokens.timeCodesPerSecond]: timeCodesPerSecond,
      [HdSceneGlobalsSchemaTokens.currentFrame]: currentFrame,
      [HdSceneGlobalsSchemaTokens.sceneStateId]: sceneStateId,
      [HdSceneGlobalsSchemaTokens.primIdToPath]: primIdToPath,
    })
  }
}

export namespace HdSceneGlobalsSchema {
  /** HdSceneGlobalsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _primaryCameraPrim: HdPathDataSource | undefined
    private _activeRenderPassPrim: HdPathDataSource | undefined
    private _activeRenderSettingsPrim: HdPathDataSource | undefined
    private _startTimeCode: HdDoubleDataSource | undefined
    private _endTimeCode: HdDoubleDataSource | undefined
    private _timeCodesPerSecond: HdDoubleDataSource | undefined
    private _currentFrame: HdDoubleDataSource | undefined
    private _sceneStateId: HdIntDataSource | undefined
    private _primIdToPath: HdVectorDataSource | undefined
    setPrimaryCameraPrim(primaryCameraPrim: HdPathDataSource | undefined): this {
      this._primaryCameraPrim = primaryCameraPrim
      return this
    }
    setActiveRenderPassPrim(activeRenderPassPrim: HdPathDataSource | undefined): this {
      this._activeRenderPassPrim = activeRenderPassPrim
      return this
    }
    setActiveRenderSettingsPrim(activeRenderSettingsPrim: HdPathDataSource | undefined): this {
      this._activeRenderSettingsPrim = activeRenderSettingsPrim
      return this
    }
    setStartTimeCode(startTimeCode: HdDoubleDataSource | undefined): this {
      this._startTimeCode = startTimeCode
      return this
    }
    setEndTimeCode(endTimeCode: HdDoubleDataSource | undefined): this {
      this._endTimeCode = endTimeCode
      return this
    }
    setTimeCodesPerSecond(timeCodesPerSecond: HdDoubleDataSource | undefined): this {
      this._timeCodesPerSecond = timeCodesPerSecond
      return this
    }
    setCurrentFrame(currentFrame: HdDoubleDataSource | undefined): this {
      this._currentFrame = currentFrame
      return this
    }
    setSceneStateId(sceneStateId: HdIntDataSource | undefined): this {
      this._sceneStateId = sceneStateId
      return this
    }
    setPrimIdToPath(primIdToPath: HdVectorDataSource | undefined): this {
      this._primIdToPath = primIdToPath
      return this
    }
    build(): HdContainerDataSource {
      return HdSceneGlobalsSchema.buildRetained(
        this._primaryCameraPrim,
        this._activeRenderPassPrim,
        this._activeRenderSettingsPrim,
        this._startTimeCode,
        this._endTimeCode,
        this._timeCodesPerSecond,
        this._currentFrame,
        this._sceneStateId,
        this._primIdToPath,
      )
    }
  }
}
