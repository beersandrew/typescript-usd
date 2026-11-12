// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneIndexCreateArgsSchema.cpp,
//  pxr/imaging/hd/sceneIndexCreateArgsSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sceneIndexCreateArgsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SceneIndexCreateArgs entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream sceneIndexCreateArgsSchema.h.
//
// Upstream this schema has no schema token / locators (it describes a
// top-level container), so there is no GetFromParent.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import type { HdBoolDataSource, HdContainerDataSource, HdTypedSampledDataSource } from './dataSource.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdRenderSettingDescriptorContainerSchema } from './schemaTypeDefs.ts'
import type { HdRenderDelegateInfo } from './renderDelegateInfo.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// sceneIndexCreateArgsSchema.h:33-37
export type HdRenderDelegateInfoDataSource = HdTypedSampledDataSource<HdRenderDelegateInfo>
// --(END CUSTOM CODE: Declares)--

/** sceneIndexCreateArgsSchema.h:40-47 TF_DECLARE_PUBLIC_TOKENS(HdSceneIndexCreateArgsSchemaTokens) */
export const HdSceneIndexCreateArgsSchemaTokens = TfMakeTokens({
  motionBlurSupport: 'motionBlurSupport',
  cameraMotionBlurSupport: 'cameraMotionBlurSupport',
  legacyRenderDelegateInfo: 'legacyRenderDelegateInfo',
  renderSettingDescriptors: 'renderSettingDescriptors',
})

/**
 * Schema for the container data source returned by
 * HdRendererPlugin::GetSceneIndexCreateArgs. The application forwards it
 * (possibly overlayed with its own container data source) to the scene index
 * constructors or scene index plugins. In other words,
 * HdRendererPlugin::GetSceneIndexCreateArgs gives a renderer the opportunity
 * to configure scene indices.
 */
export class HdSceneIndexCreateArgsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** sceneIndexCreateArgsSchema.cpp:35-40. Does consumer (most likely
   *  HdRenderer) of scene indices need samples for motion blur? */
  getMotionBlurSupport(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdSceneIndexCreateArgsSchemaTokens.motionBlurSupport)
  }

  /** sceneIndexCreateArgsSchema.cpp:42-47. Does consumer need samples for
   *  motion blur for cameras? */
  getCameraMotionBlurSupport(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdSceneIndexCreateArgsSchemaTokens.cameraMotionBlurSupport)
  }

  /** sceneIndexCreateArgsSchema.cpp:49-54. Used for
   *  HdRenderIndexAdapterSceneIndex. */
  getLegacyRenderDelegateInfo(): HdRenderDelegateInfoDataSource | undefined {
    return this._getTypedDataSource<HdRenderDelegateInfoDataSource>(HdSceneIndexCreateArgsSchemaTokens.legacyRenderDelegateInfo)
  }

  /** sceneIndexCreateArgsSchema.cpp:56-61. Render settings advertised by
   *  rendererer. */
  getRenderSettingDescriptors(): HdRenderSettingDescriptorContainerSchema {
    return new HdRenderSettingDescriptorContainerSchema(
      this._getContainerDataSource(HdSceneIndexCreateArgsSchemaTokens.renderSettingDescriptors))
  }

  /** @deprecated Use Builder instead. (sceneIndexCreateArgsSchema.cpp:63-97) */
  static buildRetained(
    motionBlurSupport?: HdBoolDataSource | undefined,
    cameraMotionBlurSupport?: HdBoolDataSource | undefined,
    legacyRenderDelegateInfo?: HdRenderDelegateInfoDataSource | undefined,
    renderSettingDescriptors?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSceneIndexCreateArgsSchemaTokens.motionBlurSupport]: motionBlurSupport,
      [HdSceneIndexCreateArgsSchemaTokens.cameraMotionBlurSupport]: cameraMotionBlurSupport,
      [HdSceneIndexCreateArgsSchemaTokens.legacyRenderDelegateInfo]: legacyRenderDelegateInfo,
      [HdSceneIndexCreateArgsSchemaTokens.renderSettingDescriptors]: renderSettingDescriptors,
    })
  }
}

export namespace HdSceneIndexCreateArgsSchema {
  /** HdSceneIndexCreateArgsSchema::Builder (sceneIndexCreateArgsSchema.cpp:99-140) */
  export class Builder {
    private _motionBlurSupport: HdBoolDataSource | undefined
    private _cameraMotionBlurSupport: HdBoolDataSource | undefined
    private _legacyRenderDelegateInfo: HdRenderDelegateInfoDataSource | undefined
    private _renderSettingDescriptors: HdContainerDataSource | undefined
    setMotionBlurSupport(motionBlurSupport: HdBoolDataSource | undefined): this {
      this._motionBlurSupport = motionBlurSupport
      return this
    }
    setCameraMotionBlurSupport(cameraMotionBlurSupport: HdBoolDataSource | undefined): this {
      this._cameraMotionBlurSupport = cameraMotionBlurSupport
      return this
    }
    setLegacyRenderDelegateInfo(legacyRenderDelegateInfo: HdRenderDelegateInfoDataSource | undefined): this {
      this._legacyRenderDelegateInfo = legacyRenderDelegateInfo
      return this
    }
    setRenderSettingDescriptors(renderSettingDescriptors: HdContainerDataSource | undefined): this {
      this._renderSettingDescriptors = renderSettingDescriptors
      return this
    }
    build(): HdContainerDataSource {
      return HdSceneIndexCreateArgsSchema.buildRetained(
        this._motionBlurSupport,
        this._cameraMotionBlurSupport,
        this._legacyRenderDelegateInfo,
        this._renderSettingDescriptors,
      )
    }
  }
}
