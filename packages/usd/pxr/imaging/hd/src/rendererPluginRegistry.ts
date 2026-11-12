// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rendererPluginRegistry.cpp,
//  pxr/imaging/hd/rendererPluginRegistry.h, pxr/imaging/hf/pluginDesc.h,
//  pxr/imaging/hf/pluginEntry.cpp, pxr/imaging/hf/pluginEntry.h,
//  pxr/imaging/hf/pluginRegistry.cpp, and 1 more cited below
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/rendererPluginRegistry.{h,cpp} (OpenUSD 26.11.1),
// with the parts of its base class HfPluginRegistry
// (pxr/imaging/hf/pluginRegistry.{h,cpp}, pluginEntry.{h,cpp},
// pluginDesc.h) that it uses. This repository has no Hf/Plug plugin system.
//
// Divergences:
// - Plugin discovery. Upstream, HfPluginRegistry::_DiscoverPlugins
//   (hf/pluginRegistry.cpp:160-214) finds every TfType derived from
//   HdRendererPlugin through PlugRegistry, reading "displayName" and
//   "priority" from the plugin's plugInfo.json, and the plugin library's
//   TF_REGISTRY_FUNCTION calls HdRendererPluginRegistry::Define<T>() to give
//   the type its factory. Here a package's registration module calls
//   HdRendererPluginRegistry.Define(id, factory, plugInfo) with the factory
//   and the plugInfo.json metadata together (for example
//   typescript-usd/hdStorm, from pxr/imaging/plugin/hdStorm/plugInfo.json).
//   Entries are added (and re-sorted) as they are defined instead of once on
//   first use; a second Define of the same id is ignored.
// - Loading. HfPluginRegistry::GetPlugin loads the plugin's library on first
//   use (hf/pluginRegistry.cpp:125-138); the registration module is already
//   loaded here.
// - Out parameters. GetPluginDescs returns the vector and GetPluginDesc
//   returns the description or null instead of filling a pointer.
// - Plugin identity. _GetEntryForPlugin finds the entry by TfType::Find of
//   the plugin (hf/pluginRegistry.cpp:216-239); here by the instance.

import { Debug as TfDebug, Token as TfToken } from 'typescript-usd/tf'
import { HdDebugCodes } from './debugCodes.ts'
import type { HdRenderSettingsMap } from './renderDelegate.ts'
import type { HdRendererCreateArgsSchema } from './rendererCreateArgsSchema.ts'
import type { HdRendererPlugin } from './rendererPlugin.ts'
import { HdRendererPluginHandle } from './rendererPluginHandle.ts'
import { HdPluginRenderDelegateUniqueHandle } from './pluginRenderDelegateUniqueHandle.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/**
 * hf/pluginDesc.h:17-34. Common structure used to report registered plugins
 * in one of the plugin registries. The id token is used for internal api
 * communication about the name of the plugin. displayName is a human
 * readable name given to the plugin intended to be used in menus.
 * priority is used to provide an ordering of plugins. The plugin
 * with the highest priority is determined to be the default (unless
 * overridden by the application). In the event of a tie
 * the string version of id is used to sort alphabetically ('a' has priority
 * over 'b').
 */
export interface HfPluginDesc {
  id: TfToken
  displayName: string
  priority: number
}

/** The plugInfo.json "Info"/"Types" metadata HfPluginRegistry reads for a
 *  plugin type (hf/pluginRegistry.cpp:19-20, 182-195). */
export interface HdRendererPluginInfo {
  displayName: string
  priority: number
}

/** The factory TF_REGISTRY_FUNCTION gives the plugin's TfType
 *  (Hf_PluginEntry::SetFactory, hf/pluginEntry.cpp:126-131). */
export type HdRendererPluginFactory = () => HdRendererPlugin

/** hf/pluginEntry.{h,cpp}: Hf_PluginEntry. */
class _PluginEntry {
  constructor(
    readonly id: TfToken,
    readonly displayName: string,
    readonly priority: number,
    private readonly _factory: HdRendererPluginFactory,
  ) {}

  /** hf/pluginEntry.h:61 */
  GetInstance(): HdRendererPlugin | null { return this._instance }

  /** hf/pluginEntry.cpp:64-70 */
  getDesc(): HfPluginDesc {
    return { id: this.id, displayName: this.displayName, priority: this.priority }
  }

  /** hf/pluginEntry.cpp:72-87 */
  incRefCount(): void {
    if (this._refCount === 0) {
      this._instance = this._factory()
    }

    ++this._refCount
  }

  /** hf/pluginEntry.cpp:89-104 */
  decRefCount(): void {
    // something went wrong with ref counting
    if (!TF_VERIFY(this._refCount > 0)) {
      this._refCount = 0
      return
    }

    --this._refCount

    if (this._refCount === 0) {
      this._instance = null
    }
  }

  /** hf/pluginEntry.cpp:106-124 (operator<). Policy is sort by priority then
   *  alphabetical order on machine name. */
  static less(a: _PluginEntry, b: _PluginEntry): number {
    if (a.priority < b.priority) {
      return -1
    } else if (a.priority > b.priority) {
      return 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }

  private _instance: HdRendererPlugin | null = null
  private _refCount = 0
}

/** rendererPluginRegistry.h:23-100 */
export class HdRendererPluginRegistry {
  private static _instance: HdRendererPluginRegistry | undefined

  /** hf/pluginRegistry.h: _pluginEntries, sorted (hf/pluginRegistry.cpp:202-211) */
  private _pluginEntries: _PluginEntry[] = []
  /** hf/pluginRegistry.h: _pluginIndex */
  private _pluginIndex = new Map<string, number>()

  // Singleton gets private constructed (rendererPluginRegistry.cpp:28-31).
  private constructor() {}

  /** rendererPluginRegistry.cpp:21-25. Returns the singleton registry for
   *  HdRendererPlugin. */
  static GetInstance(): HdRendererPluginRegistry {
    if (!HdRendererPluginRegistry._instance) {
      HdRendererPluginRegistry._instance = new HdRendererPluginRegistry()
    }
    return HdRendererPluginRegistry._instance
  }

  /** Test seam: drop the singleton so registrations don't accrete across
   *  tests (as HdSceneIndexPluginRegistry._ResetInstance). */
  static _resetInstance(): void {
    HdRendererPluginRegistry._instance = undefined
  }

  /**
   * rendererPluginRegistry.h:32-36, 103-107. Entry point for defining an
   * HdRendererPlugin plugin. See the header note: the plugInfo.json
   * metadata of the plugin's type is passed alongside its factory.
   */
  static define(
    pluginId: TfToken | string,
    factory: HdRendererPluginFactory,
    plugInfo: HdRendererPluginInfo,
  ): void {
    HdRendererPluginRegistry.GetInstance()._define(TfToken(pluginId), factory, plugInfo)
  }

  /** hf/pluginRegistry.cpp:160-214 (_DiscoverPlugins) for one plugin type. */
  private _define(
    pluginId: TfToken,
    factory: HdRendererPluginFactory,
    plugInfo: HdRendererPluginInfo,
  ): void {
    if (this._pluginIndex.has(pluginId)) {
      return
    }

    const displayName = plugInfo.displayName
    const priority = plugInfo.priority

    if (displayName.length === 0 || !Number.isInteger(priority)) {
      TF_WARN(`Plugin ${pluginId} type information incomplete`)
    } else {
      this._pluginEntries.push(
        new _PluginEntry(pluginId, displayName, priority, factory))
    }

    this._collectAdditionalMetadata(pluginId)

    // Sort entries according to policy (in operator <)
    this._pluginEntries.sort(_PluginEntry.less)

    // Now sorted create index for fast lookup
    this._pluginIndex.clear()
    this._pluginEntries.forEach((entry, index) => {
      this._pluginIndex.set(entry.id, index)
    })
  }

  /** hf/pluginRegistry.cpp:35-54 */
  getPluginDescs(): HfPluginDesc[] {
    return this._pluginEntries.map(entry => entry.getDesc())
  }

  /** hf/pluginRegistry.cpp:56-72 */
  getPluginDesc(pluginId: TfToken | string): HfPluginDesc | null {
    const index = this._pluginIndex.get(pluginId)
    if (index === undefined) {
      return null
    }

    return this._pluginEntries[index]!.getDesc()
  }

  /** hf/pluginRegistry.cpp:74-83 */
  addPluginReference(plugin: HdRendererPlugin): void {
    const entry = this._getEntryForPlugin(plugin)
    if (entry === null) {
      return
    }

    entry.incRefCount()
  }

  /** hf/pluginRegistry.cpp:85-98 */
  releasePlugin(plugin: HdRendererPlugin | null): void {
    if (plugin === null) {
      return
    }

    const entry = this._getEntryForPlugin(plugin)
    if (entry === null) {
      return
    }

    entry.decRefCount()
  }

  /** hf/pluginRegistry.cpp:100-109 */
  isRegisteredPlugin(pluginId: TfToken | string): boolean {
    return this._pluginIndex.has(pluginId)
  }

  /** hf/pluginRegistry.cpp:240-249 */
  getPluginId(plugin: HdRendererPlugin): TfToken {
    for (const entry of this._pluginEntries) {
      if (entry.GetInstance() === plugin) {
        return entry.id
      }
    }
    return TfToken()
  }

  /** hf/pluginRegistry.cpp:111-145. Returns the plugin with the given id,
   *  creating it if needed; its reference count is incremented. */
  getPlugin(pluginId: TfToken | string): HdRendererPlugin | null {
    const index = this._pluginIndex.get(pluginId)
    if (index === undefined) {
      return null
    }

    const entry = this._pluginEntries[index]!

    // This will create the instance if nessasary.
    entry.incRefCount()

    return entry.GetInstance()
  }

  /**
   * rendererPluginRegistry.cpp:36-70. Returns the id of plugin to use as the
   * default. To ensure an appropriate default is found, the
   * rendererCreateArgs (following the HdCreateRendererArgsSchema) parameter
   * will be used to indicate the resources available when making the
   * determination.
   */
  getDefaultPluginId(rendererCreateArgs: HdRendererCreateArgsSchema): TfToken {
    // Get all the available plugins to see if any of them is supported on this
    // platform and use the first one as the default.
    //
    // Important note, we want to avoid loading plugins as much as possible,
    // we would prefer to only load plugins when the user asks for them.  So
    // we will only load plugins until we find the first one that works.
    const pluginDescriptors = this.getPluginDescs()
    for (const desc of pluginDescriptors) {
      const plugin = HdRendererPluginRegistry.GetInstance().getRendererPlugin(desc.id)

      // Important to bail out as soon as we found a plugin that works to
      // avoid loading plugins unnecessary as that can be arbitrarily
      // expensive.
      if (plugin && plugin.isSupported(rendererCreateArgs)) {
        HdRendererPluginRegistry.GetInstance().releasePlugin(plugin)

        TfDebug.msg(HdDebugCodes.HD_RENDERER_PLUGIN,
          `Default renderer plugin: ${desc.id}\n`)
        return desc.id
      }

      HdRendererPluginRegistry.GetInstance().releasePlugin(plugin)
    }

    TfDebug.msg(HdDebugCodes.HD_RENDERER_PLUGIN,
      'Default renderer plugin: none\n')
    return TfToken()
  }

  /**
   * rendererPluginRegistry.cpp:72-76.
   * @deprecated Use GetOrCreateRendererPlugin instead.
   *
   * Returns the renderer plugin for the given id or null if not found. The
   * reference count on the returned delegate is incremented.
   */
  getRendererPlugin(pluginId: TfToken | string): HdRendererPlugin | null {
    return this.getPlugin(pluginId)
  }

  /**
   * rendererPluginRegistry.cpp:78-83. Returns the renderer plugin for the
   * given id or a null handle if not found. The plugin is wrapped in a handle
   * that automatically increments and decrements the reference count and
   * also stores the plugin id.
   */
  getOrCreateRendererPlugin(pluginId: TfToken | string): HdRendererPluginHandle {
    return new HdRendererPluginHandle(this.getPlugin(pluginId))
  }

  /**
   * rendererPluginRegistry.cpp:85-100. Returns a render delegate created by
   * the plugin with the given name if the plugin is supported using given
   * initial settings. The render delegate is wrapped in a movable handle that
   * keeps the plugin alive until the render delegate is destroyed by
   * dropping the handle.
   */
  createRenderDelegate(
    pluginId: TfToken | string,
    settingsMap: HdRenderSettingsMap = new Map(),
  ): HdPluginRenderDelegateUniqueHandle {
    const plugin = this.getOrCreateRendererPlugin(pluginId)
    if (!plugin.isValid()) {
      TF_CODING_ERROR(`Couldn't find plugin for id ${pluginId}`)
      return new HdPluginRenderDelegateUniqueHandle()
    }

    const result = plugin.Get()!.createDelegate(settingsMap)

    // ~HdRendererPluginHandle of the local handle.
    plugin.Reset()

    return result
  }

  /** rendererPluginRegistry.cpp:102-109 */
  private _collectAdditionalMetadata(pluginType: TfToken): void {
    TfDebug.msg(HdDebugCodes.HD_RENDERER_PLUGIN,
      `Renderer plugin discovery: ${pluginType}\n`)
  }

  /** hf/pluginRegistry.cpp:216-239 (see the header note). */
  private _getEntryForPlugin(plugin: HdRendererPlugin): _PluginEntry | null {
    const entry = this._pluginEntries.find(e => e.GetInstance() === plugin)
    if (!TF_VERIFY(entry !== undefined)) {
      return null
    }
    return entry!
  }
}
