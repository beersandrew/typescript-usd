// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rendererPlugin.cpp,
//  pxr/imaging/hd/rendererPlugin.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/rendererPlugin.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HfPluginBase and TfType registration (rendererPlugin.cpp:22-25) are
//   replaced by HdRendererPluginRegistry.Define (see rendererPluginRegistry.ts).
// - The two CreateRenderDelegate overloads (rendererPlugin.h:131, 142-143)
//   are one method with an optional settings map. Upstream the
//   settings-taking overload falls back to the settings-less one
//   (rendererPlugin.cpp:27-33); a subclass that ignores the settings map
//   behaves the same way here.
// - IsSupported's `std::string *reasonWhyNot` is an optional out object
//   `{ value?: string }` (the convention of SdfPath.isValidPathString's errMsg
//   in this repository).
// - Null handles are empty handle objects (IsValid() false) rather than
//   nullptr.

import { Debug as TfDebug, type Token as TfToken } from 'typescript-usd/tf'
import type { HdContainerDataSource } from './dataSource.ts'
import { HdDebugCodes } from './debugCodes.ts'
import type { HdRenderDelegate, HdRenderSettingsMap } from './renderDelegate.ts'
import { HdRenderDelegateAdapterRenderer } from './renderDelegateAdapterRenderer.ts'
import type { HdRenderer } from './renderer.ts'
import { HdRendererCreateArgsSchema } from './rendererCreateArgsSchema.ts'
import { HdRendererPluginHandle } from './rendererPluginHandle.ts'
import { HdRendererPluginRegistry } from './rendererPluginRegistry.ts'
import { HdPluginRenderDelegateUniqueHandle } from './pluginRenderDelegateUniqueHandle.ts'
import { HdPluginRendererUniqueHandle } from './pluginRendererUniqueHandle.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/**
 * rendererPlugin.h:23-175. This class defines a renderer plugin interface for
 * Hydra. A renderer plugin is a dynamically discovered and loaded at run-time
 * using the Plug system.
 *
 * This object has singleton behavior, in that is instantiated once per
 * library (managed by the plugin registry).
 *
 * The class is used to factory objects that provide delegate support
 * to other parts of the Hydra Ecosystem.
 */
export abstract class HdRendererPlugin {
  // ---- Hydra 2.0 API (rendererPlugin.h:38-98) ----

  /**
   * rendererPlugin.h:41-56. Returns true if this renderer plugin is supported
   * in the running process and false if not.
   *
   * This gives the plugin a chance to perform some runtime checks to make
   * sure that the system meets minimum requirements (given the requested
   * configuration/resources provided by rendererCreateArgs).
   *
   * The reasonWhyNot param, when provided, can be filled with the reason
   * why the renderer plugin is not supported.
   */
  abstract isSupported(
    rendererCreateArgs: HdRendererCreateArgsSchema,
    reasonWhyNot?: { value?: string },
  ): boolean

  /**
   * rendererPlugin.h:58-78, rendererPlugin.cpp:128-132. Arguments that an
   * application should pass as create arguments to scene indices so that
   * they can be configured for the needs of the renderer.
   *
   * Follows the HdSceneIndexCreateArgsSchema but can have data sources
   * at additional data sources.
   */
  getSceneIndexCreateArgs(): HdContainerDataSource | undefined {
    return undefined
  }

  /**
   * rendererPlugin.h:80-96, rendererPlugin.cpp:83-102. Create renderer
   * through the plugin and wrap it in a handle that keeps this plugin alive
   * until the renderer is destroyed.
   *
   * The renderer is populated from the given scene index.
   * rendererCreateArgs should conform to HdRendererCreateArgsSchema.
   *
   * Note that for a seamless transition, this Hydra 2.0 method falls back to
   * creating a Hydra 1.0 render delegate and the necessary "back-end"
   * emulation for render plugins that do not implement the Hydra 2.0
   * _CreateRenderer.
   */
  createRenderer(
    sceneIndex: HdSceneIndexBase,
    rendererCreateArgs: HdRendererCreateArgsSchema,
  ): HdPluginRendererUniqueHandle {
    if (!this.isSupported(rendererCreateArgs)) {
      TF_CODING_ERROR(
        'Clients are supposed to check HdRendererPlugin::IsSupported(...) ' +
        'before calling HdRendererPlugin::CreateRenderer.')
      return new HdPluginRendererUniqueHandle()
    }

    HdRendererPluginRegistry.GetInstance().addPluginReference(this)

    return new HdPluginRendererUniqueHandle(
      new HdRendererPluginHandle(this),
      this._createRenderer(
        sceneIndex, rendererCreateArgs))
  }

  /** rendererPlugin.cpp:104-108. Look-up plugin id in plugin registry. */
  getPluginId(): TfToken {
    return HdRendererPluginRegistry.GetInstance().getPluginId(this)
  }

  /** rendererPlugin.cpp:110-126. Look-up display name in plugin registry. */
  getDisplayName(): string {
    const pluginId =
      HdRendererPluginRegistry.GetInstance().getPluginId(this)
    const desc = HdRendererPluginRegistry.GetInstance().getPluginDesc(pluginId)
    if (!desc) {
      // Note, this is unlikely since if pluginId were illegal, this class
      // would not have been instantiated...
      TF_CODING_ERROR(`Unable to get display name for '${pluginId}'`)
      return ''
    }

    return desc.displayName
  }

  // ---- Hydra 1.0 (rendererPlugin.h:112-153) ----

  /**
   * rendererPlugin.cpp:48-81. Create a render delegate through the plugin and
   * wrap it in a handle that keeps this plugin alive until render delegate is
   * destroyed. Initial settings can be passed in.
   */
  createDelegate(
    settingsMap: HdRenderSettingsMap = new Map(),
  ): HdPluginRenderDelegateUniqueHandle {
    if (!this.isSupported(new HdRendererCreateArgsSchema(undefined))) {
      return new HdPluginRenderDelegateUniqueHandle()
    }

    HdRendererPluginRegistry.GetInstance().addPluginReference(this)

    const result =
      new HdPluginRenderDelegateUniqueHandle(
        new HdRendererPluginHandle(this),
        this.createRenderDelegate(settingsMap))

    if (TfDebug.isEnabled(HdDebugCodes.HD_RENDERER_PLUGIN)) {
      let ss = ''
      for (const [key, value] of settingsMap) {
        ss += `\t${key}: ${String(value)}\n`
      }
      TfDebug.msg(HdDebugCodes.HD_RENDERER_PLUGIN,
        `${result.isValid() ? 'Created' : 'Failed to create'} instance of ` +
        `renderer plugin '${this.getPluginId()}' with settings map:\n${ss}`)
    }

    // provide render delegate instance with display name to facilitate
    // association of this renderer to other code and resources
    if (result.isValid()) {
      result.Get()!._setRendererDisplayName(this.getDisplayName())
    }

    return result
  }

  /**
   * rendererPlugin.h:123-143. Clients should use CreateDelegate since this
   * method will eventually become protected.
   *
   * Factory a Render Delegate object, that Hydra can use to factory prims
   * and communicate with a renderer. Pass in initial settings...
   */
  abstract createRenderDelegate(settingsMap?: HdRenderSettingsMap): HdRenderDelegate | null

  /**
   * rendererPlugin.h:145-151. Clients should use CreateDelegate since this
   * method will eventually become protected.
   *
   * Release the object factoried by CreateRenderDelegate().
   */
  abstract deleteRenderDelegate(renderDelegate: HdRenderDelegate): void

  /** rendererPlugin.cpp:134-142 */
  protected _createRenderer(
    sceneIndex: HdSceneIndexBase,
    rendererCreateArgs: HdRendererCreateArgsSchema,
  ): HdRenderer | null {
    return this._createRendererFromRenderDelegate(
      sceneIndex,
      rendererCreateArgs)
  }

  /** rendererPlugin.cpp:144-157. Instantiates render delegate and uses
   *  "back-end" emulation. */
  protected _createRendererFromRenderDelegate(
    sceneIndex: HdSceneIndexBase,
    rendererCreateArgs: HdRendererCreateArgsSchema,
  ): HdRenderer | null {
    const renderDelegate = this.createDelegate()
    if (!renderDelegate.isValid()) {
      // ~HdPluginRenderDelegateUniqueHandle of the local handle releases the
      // plugin reference CreateDelegate took.
      renderDelegate.Reset()
      return null
    }

    return new HdRenderDelegateAdapterRenderer(
      renderDelegate, sceneIndex, rendererCreateArgs)
  }
}
