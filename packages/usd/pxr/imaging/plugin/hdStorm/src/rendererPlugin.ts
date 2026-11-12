// Ported from OpenUSD 26.11.1: pxr/imaging/plugin/hdStorm/rendererPlugin.cpp,
//  pxr/imaging/plugin/hdStorm/rendererPlugin.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/plugin/hdStorm/rendererPlugin.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Registration. Upstream, TF_REGISTRY_FUNCTION(TfType) calls
//   HdRendererPluginRegistry::Define<HdStormRendererPlugin>()
//   (rendererPlugin.cpp:22-25) and HfPluginRegistry reads the type's
//   "displayName" ("GL") and "priority" (0) from
//   pxr/imaging/plugin/hdStorm/plugInfo.json. Here
//   HdStormRendererPlugin_Register passes the factory and that metadata to
//   HdRendererPluginRegistry.Define; typescript-usd/hdStorm calls it when
//   imported.
// - The two CreateRenderDelegate overloads (rendererPlugin.cpp:52-63) are one
//   method with an optional settings map (see hd/src/rendererPlugin.ts).
// - DeleteRenderDelegate (`delete renderDelegate`, rendererPlugin.cpp:65-69):
//   HdStRenderDelegate has no explicit teardown in this port, so dropping the
//   reference is all that remains.

import {
  RenderSettingDescriptorContainerSchema as HdRenderSettingDescriptorContainerSchema,
  RenderSettingDescriptorSchema as HdRenderSettingDescriptorSchema,
  RendererPlugin as HdRendererPlugin,
  RendererPluginRegistry as HdRendererPluginRegistry,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexCreateArgsSchema as HdSceneIndexCreateArgsSchema,
  type ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase,
  type RenderDelegate as HdRenderDelegate,
  type RenderSettingDescriptor as HdRenderSettingDescriptor,
  type RenderSettingsMap as HdRenderSettingsMap,
  type RendererCreateArgsSchema as HdRendererCreateArgsSchema,
} from 'typescript-usd/hd'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'

/** pxr/imaging/plugin/hdStorm/plugInfo.json: the plugin's TfType name. */
export const HdStormRendererPluginId = 'HdStormRendererPlugin'

/** pxr/imaging/plugin/hdStorm/plugInfo.json:6-12 ("Info"/"Types"/
 *  "HdStormRendererPlugin"). */
export const HdStormRendererPluginInfo = {
  displayName: 'GL',
  priority: 0,
} as const

/** rendererPlugin.cpp:26-50. Converts a list of render setting descriptors
 *  into a container data source mapping each descriptor's key to an
 *  HdRenderSettingDescriptorSchema. */
function _ToContainerDataSource(descriptors: readonly HdRenderSettingDescriptor[]): HdContainerDataSource {
  const names: string[] = []
  const values: HdDataSourceBase[] = []
  for (const desc of descriptors) {
    names.push(desc.key)
    values.push(
      new HdRenderSettingDescriptorSchema.Builder()
        .setName(
          HdRetainedTypedSampledDataSource.new<string>(
            desc.name))
        .setDefaultValue(
          // HdRetainedSampledDataSource::New(desc.defaultValue) upstream,
          // holding a VtValue. This port's HdRenderSettingDescriptor holds
          // the plain default value, so it is retained as such (the value
          // GetValue returns, as for typed sampled data sources here).
          HdRetainedTypedSampledDataSource.new<unknown>(desc.defaultValue))
        .build())
  }

  return HdRenderSettingDescriptorContainerSchema.buildRetained(
    names, values)
}

/** rendererPlugin.h:15-37 */
export class HdStormRendererPlugin extends HdRendererPlugin {
  /** rendererPlugin.cpp:52-63 */
  createRenderDelegate(settingsMap?: HdRenderSettingsMap): HdRenderDelegate | null {
    return new HdStRenderDelegate(settingsMap)
  }

  /** rendererPlugin.cpp:65-69 (see the header note). */
  deleteRenderDelegate(_renderDelegate: HdRenderDelegate): void {
  }

  /** rendererPlugin.cpp:71-77 */
  isSupported(
    rendererCreateArgs: HdRendererCreateArgsSchema,
    reasonWhyNot?: { value?: string },
  ): boolean {
    return HdStRenderDelegate.isSupported(rendererCreateArgs, reasonWhyNot)
  }

  /** rendererPlugin.cpp:79-98 */
  override getSceneIndexCreateArgs(): HdContainerDataSource | undefined {
    // The env-setting-derived defaults of the render settings are resolved at
    // call time, so we build this fresh per call rather than caching in a
    // static.
    return new HdSceneIndexCreateArgsSchema.Builder()
      .setMotionBlurSupport(
        HdRetainedTypedSampledDataSource.new<boolean>(false))
      .setCameraMotionBlurSupport(
        HdRetainedTypedSampledDataSource.new<boolean>(true))
      .setLegacyRenderDelegateInfo(
        HdRetainedTypedSampledDataSource.new(
          HdStRenderDelegate.getRenderDelegateInfo()))
      .setRenderSettingDescriptors(
        _ToContainerDataSource(
          HdStRenderDelegate.getRenderSettingDescriptorsForPlugin()))
      .build()
  }
}

/** rendererPlugin.cpp:22-25 TF_REGISTRY_FUNCTION(TfType), with the
 *  plugInfo.json metadata (see the header note). Call it again after
 *  HdRendererPluginRegistry._ResetInstance(). */
export function HdStormRendererPlugin_Register(): void {
  HdRendererPluginRegistry.define(
    HdStormRendererPluginId,
    () => new HdStormRendererPlugin(),
    HdStormRendererPluginInfo)
}
