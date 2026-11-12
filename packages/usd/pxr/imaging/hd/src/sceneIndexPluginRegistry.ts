// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneIndexPluginRegistry.cpp,
//  pxr/imaging/hd/sceneIndexPluginRegistry.h, pxr/imaging/hf/pluginEntry.cpp,
//  pxr/imaging/hf/pluginEntry.h, pxr/imaging/hf/pluginRegistry.cpp,
//  pxr/imaging/hf/pluginRegistry.h
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/sceneIndexPluginRegistry.{h,cpp}, with the parts of
// its base class HfPluginRegistry (pxr/imaging/hf/pluginRegistry.{h,cpp},
// pluginEntry.{h,cpp}) it uses.
//
// A registry for renderer- and application-specific scene indices. Plugins are
// registered for a renderer (or all renderers, via the empty allRenderers
// token) with an insertion phase + order, and LoadAndGetSceneIndexPluginIds()
// returns the plugin ids in the sorted order they would be run.
//
// Discovery is upstream's: every TfType derived from HdSceneIndexPlugin that a
// registered plugin's plugInfo.json declares is a plugin entry
// (HfPluginRegistry::_DiscoverPlugins, hf/pluginRegistry.cpp:160-214), its
// "loadWithRenderer"/"loadWithApps" metadata decides when it is loaded
// (_CollectAdditionalMetadata, sceneIndexPluginRegistry.cpp:1307-1364), and
// loading it (_LoadPluginsForRenderer, sceneIndexPluginRegistry.cpp:1366-1411)
// instantiates it from its TfType's factory, which Define sets
// (hf/pluginRegistry.h:117-131). The plugin modules' registry functions
// (TF_REGISTRY_FUNCTION(HdSceneIndexPlugin)) are TfRegistryManager functions
// keyed by HdSceneIndexPlugin, which the registry subscribes to when
// constructed (sceneIndexPluginRegistry.cpp:1157-1167).
//
// Loading: a plugin registered without a plugInfo URL is part of this build
// and is loaded (base/plug/src/plugin.ts), so its module's registry functions
// have run; a plugin loaded from a URL must be loaded with PlugPlugin.LoadAsync
// first, as PlugPlugin.Load reports. Plugins can be registered at any time on
// the web, where upstream registers them all before the registry discovers
// them once, so plugins that registered after discovery are discovered on the
// next lookup, and a derived TfType no plugin declares yet is not an entry
// until one does (upstream warns that its information is incomplete). The
// per-entry reference count of Hf_PluginEntry is not ported: upstream never
// releases scene index plugin instances (sceneIndexPluginRegistry.cpp:1205-1207).
//
// FAITHFULNESS-DEBT(hd-scene-index-plugin-json-ordering): the "tags" and
// "ordering" metadata of the plugInfo entries and the JsonMetadataOnly and
// Hybrid ordering policies (_ComputeOrderedEntries,
// sceneIndexPluginRegistry.cpp:465-1098) are not ported; every policy orders
// as CppRegistrationOnly (_ComputeOrderedEntriesFromRegistration,
// sceneIndexPluginRegistry.cpp:494-566) -> port the JSON entries, the tag
// graph and the policies.

import { MakeTokens as TfMakeTokens, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import type { Token as TfToken } from 'typescript-usd/tf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { HdRetainedContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'
import type { HdContainerDataSource } from './dataSource.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'
import { HdSceneIndexPlugin, HdSceneIndexPlugin_GetTfType } from './sceneIndexPlugin.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

// HDSCENEINDEXPLUGINREGISTRY_TOKENS (sceneIndexPluginRegistry.h:27-33)
export const HdSceneIndexPluginRegistryTokens = TfMakeTokens({
  rendererDisplayName: '__rendererDisplayName',
  allRenderers: '',
  allApps: '',
})

// sceneIndexPluginRegistry.cpp:53-66 (the keys read here); hf/pluginRegistry.cpp:19-20.
const _jsonTokens = {
  loadWithRenderer: 'loadWithRenderer',
  loadWithApps: 'loadWithApps',
  displayName: 'displayName',
  priority: 'priority',
} as const

export enum InsertionOrder {
  InsertionOrderAtStart,
  InsertionOrderAtEnd,
}

export type InsertionPhase = number

export enum PluginOrderingPolicy {
  // The order of plugins is determined solely by the insertion phase/order
  // arguments of the C++ registration API.
  CppRegistrationOnly,

  // The tags and ordering specified in the JSON metadata are used to drive the
  // ordering of scene index plugins.
  JsonMetadataOnly,

  // A hybrid scheme honoring *both* the insertion phase/order and the JSON
  // metadata tags/ordering.
  Hybrid,
}

export type SceneIndexAppendCallback = (
  renderInstanceId: string,
  inputScene: HdSceneIndexBase,
  inputArgs: HdContainerDataSource | undefined,
) => HdSceneIndexBase

/** The factory Define gives a plugin's TfType (HfPluginRegistry's
 *  _PluginFactory, hf/pluginRegistry.h:117-131; Hf_PluginEntry::SetFactory,
 *  hf/pluginEntry.cpp:126-131). */
export interface HdSceneIndexPluginFactory {
  'new'(): HdSceneIndexPlugin
}

interface _RegEntry {
  rendererDisplayName: string
  sceneIndexPluginId: string
  callback: SceneIndexAppendCallback | undefined
  inputArgs: HdContainerDataSource | undefined
  phase: InsertionPhase
  order: InsertionOrder
}

/** hf/pluginEntry.{h,cpp}: Hf_PluginEntry, without the reference count. */
interface _PluginEntry {
  type: TfType
  displayName: string
  priority: number
  instance: HdSceneIndexPlugin | undefined
}

/** _BuildStringVector (sceneIndexPluginRegistry.cpp:1236-1250): an array of
 *  strings, or a string (the empty string included), or nothing. */
function _BuildStringVector(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'string') {
    return [value]
  }
  return []
}

export class HdSceneIndexPluginRegistry {
  private static _instance: HdSceneIndexPluginRegistry | undefined

  private _entries: _RegEntry[] = []
  private _metadata = new WeakMap<HdSceneIndexBase, PluginInsertionMetadata>()
  private _orderingPolicy: PluginOrderingPolicy = PluginOrderingPolicy.Hybrid

  // HfPluginRegistry::_pluginEntries / _pluginIndex, by plugin id.
  private readonly _pluginEntries = new Map<string, _PluginEntry>()
  // The TfTypes discovered so far (see the header).
  private readonly _discoveredTypes = new Set<TfType>()
  private _discoveryNeeded = true
  private readonly _stopListening: () => void
  // _Impl::preloadsForRenderers (sceneIndexPluginRegistry.cpp:305-309):
  // renderer -> ids of the plugins to load with it.
  private readonly _preloadsForRenderers = new Map<string, string[]>()
  // _Impl::preloadAppsForPlugins (sceneIndexPluginRegistry.cpp:311-316).
  private readonly _preloadAppsForPlugins = new Map<string, Set<string>>()

  /** sceneIndexPluginRegistry.cpp:1157-1167 */
  private constructor() {
    // TfSingleton::SetInstanceConstructed: the registry functions run below
    // call GetInstance.
    HdSceneIndexPluginRegistry._instance = this
    this._stopListening = PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => {
      this._discoveryNeeded = true
    })
    TfRegistryManager.GetInstance().subscribeTo(HdSceneIndexPlugin)

    // Force discovery at instantiation time
    this._discoverPlugins()
  }

  /** sceneIndexPluginRegistry.cpp:1151-1155 */
  static GetInstance(): HdSceneIndexPluginRegistry {
    return HdSceneIndexPluginRegistry._instance ?? new HdSceneIndexPluginRegistry()
  }

  // Test seam: drop the singleton so registrations don't accrete across
  // tests. The next instance subscribes to the registry functions again, so
  // they run for it as for a new process.
  static _resetInstance(): void {
    HdSceneIndexPluginRegistry._instance?._stopListening()
    HdSceneIndexPluginRegistry._instance = undefined
    TfRegistryManager.GetInstance().unsubscribeFrom(HdSceneIndexPlugin)
  }

  /**
   * sceneIndexPluginRegistry.h:61-66 (Define<T>): HfPluginRegistry::Define<T,
   * HdSceneIndexPlugin> (hf/pluginRegistry.h:117-131) defines the plugin's
   * TfType, derived from HdSceneIndexPlugin, with the factory that
   * instantiates it. A plugin module calls this at its top level, where
   * upstream calls it from TF_REGISTRY_FUNCTION(TfType); the type name is the
   * one its plugInfo declares.
   */
  static define(
    sceneIndexPluginId: string | TfToken,
    pluginClass: new () => HdSceneIndexPlugin,
  ): TfType {
    const type = TfType.define(sceneIndexPluginId, [HdSceneIndexPlugin_GetTfType()])
    if (!type.getFactory()) {
      type.setFactory({ new: () => new pluginClass() } satisfies HdSceneIndexPluginFactory)
    }
    return type
  }

  /** HfPluginRegistry::_DiscoverPlugins (hf/pluginRegistry.cpp:160-214) for
   *  the types not discovered yet; see the header. */
  private _discoverPlugins(): void {
    if (!this._discoveryNeeded) return
    this._discoveryNeeded = false

    const pluginRegistry = PlugRegistry.GetInstance()
    const pluginTypes = [...new Set(PlugRegistry.getAllDerivedTypes(HdSceneIndexPlugin_GetTfType()))]
      .sort((a, b) => a.getTypeName() < b.getTypeName() ? -1 : a.getTypeName() > b.getTypeName() ? 1 : 0)

    for (const pluginType of pluginTypes) {
      if (this._discoveredTypes.has(pluginType)) continue
      if (!pluginRegistry.getPluginForType(pluginType)) continue
      this._discoveredTypes.add(pluginType)

      const metadata = pluginRegistry.getMetadataForType(pluginType)
      const displayName = metadata[_jsonTokens.displayName]
      const priority = metadata[_jsonTokens.priority]

      if (typeof displayName !== 'string' || displayName === '' || !Number.isInteger(priority)) {
        TF_WARN(`Plugin ${pluginType.getTypeName()} type information incomplete`)
      } else {
        this._pluginEntries.set(pluginType.getTypeName(), {
          type: pluginType, displayName, priority: priority as number, instance: undefined,
        })
      }

      this._collectAdditionalMetadata(pluginRegistry, pluginType)
    }
  }

  /** sceneIndexPluginRegistry.cpp:1307-1364: the preload maps. The JSON
   *  ordering entries are not ported (see the header). */
  private _collectAdditionalMetadata(pluginRegistry: PlugRegistry, pluginType: TfType): void {
    const pluginTypeToken = pluginType.getTypeName()
    const metadata = pluginRegistry.getMetadataForType(pluginType)

    // Update renderer -> pluginIds preload map.
    const renderers = _BuildStringVector(metadata[_jsonTokens.loadWithRenderer])
    for (const renderer of renderers) {
      const ids = this._preloadsForRenderers.get(renderer) ?? []
      ids.push(pluginTypeToken)
      this._preloadsForRenderers.set(renderer, ids)
    }

    // Update pluginId -> apps preload map.
    const apps = _BuildStringVector(metadata[_jsonTokens.loadWithApps])
    this._preloadAppsForPlugins.set(pluginTypeToken, new Set(apps))
  }

  /** _Impl::IsPluginRelevantForApp (sceneIndexPluginRegistry.cpp:1133-1148) */
  private _isPluginRelevantForApp(pluginId: string, appName: string): boolean {
    const apps = this._preloadAppsForPlugins.get(pluginId)
    if (apps === undefined) {
      // No loadWithApps entry => the plugin is to be loaded for all apps.
      return true
    }
    return apps.size === 0
      || apps.has(HdSceneIndexPluginRegistryTokens.allApps)
      || apps.has(appName)
  }

  /** _GetSceneIndexPlugin (sceneIndexPluginRegistry.cpp:1171-1175), i.e.
   *  HfPluginRegistry::GetPlugin (hf/pluginRegistry.cpp:111-139) and
   *  Hf_PluginEntry::IncRefCount (hf/pluginEntry.cpp:72-87). */
  private _getSceneIndexPlugin(pluginId: string): HdSceneIndexPlugin | undefined {
    this._discoverPlugins()

    const entry = this._pluginEntries.get(pluginId)
    if (!entry) {
      return undefined
    }

    if (entry.instance === undefined) {
      // If instance has not be created yet, make sure plugin is loaded
      const plugin = PlugRegistry.GetInstance().getPluginForType(entry.type)
      if (!TF_VERIFY(plugin, 'plugin')) {
        return undefined
      }

      if (!plugin!.Load()) {
        return undefined
      }

      // This will create the instance if nessasary.
      const factory = entry.type.getFactory<HdSceneIndexPluginFactory>()
      if (factory) {
        entry.instance = factory.new()
      } else {
        TF_CODING_ERROR(`Plugin ${pluginId} is missing TfType registration`)
      }
    }

    return entry.instance
  }

  /** _LoadPluginsForRenderer (sceneIndexPluginRegistry.cpp:1366-1411) */
  private _loadPluginsForRenderer(rendererDisplayName: string, appName: string): void {
    this._discoverPlugins()

    // Preload any renderer plug-ins which have been tagged (via plugInfo) to
    // be loaded along with the specified renderer (or any renderer)
    const preloadKeys = [
      HdSceneIndexPluginRegistryTokens.allRenderers as string,
      rendererDisplayName,
    ]

    for (const key of preloadKeys) {
      const rendererPlugins = this._preloadsForRenderers.get(key)
      if (rendererPlugins === undefined) {
        continue
      }

      for (let i = 0; i < rendererPlugins.length;) {
        const id = rendererPlugins[i]!

        if (!this._isPluginRelevantForApp(id, appName)) {
          ++i
          continue
        }

        // This only ensures that the plug-in is loaded as the plug-in
        // itself might do further registration relevant to below.
        this._getSceneIndexPlugin(id)

        // Preload only needs to happen once per process. Remove this
        // plugin so we don't try to load it again later.
        rendererPlugins.splice(i, 1)
      }

      if (rendererPlugins.length === 0) {
        // Common case: we loaded all the plugins. We can entirely
        // erase the entry for this renderer from the overall map.
        this._preloadsForRenderers.delete(key)
      }
    }
  }

  // Register a scene index plugin to be instantiated for a specified renderer
  // (or all renderers if rendererDisplayName is the empty allRenderers token).
  registerSceneIndexForRenderer(
    rendererDisplayName: string,
    sceneIndexPluginIdOrCallback: string | TfToken | SceneIndexAppendCallback,
    inputArgs: HdContainerDataSource | null,
    insertionPhase: InsertionPhase,
    insertionOrder: InsertionOrder,
  ): void {
    // TfToken is a branded string, so the id is usable directly.
    this._entries.push({
      rendererDisplayName,
      sceneIndexPluginId: typeof sceneIndexPluginIdOrCallback === 'function'
        ? '' : sceneIndexPluginIdOrCallback,
      callback: typeof sceneIndexPluginIdOrCallback === 'function'
        ? sceneIndexPluginIdOrCallback : undefined,
      inputArgs: inputArgs ?? undefined,
      phase: insertionPhase,
      order: insertionOrder,
    })
  }

  /** sceneIndexPluginRegistry.cpp:1192-1225 */
  appendSceneIndex(
    sceneIndexPluginId: string | TfToken,
    inputScene: HdSceneIndexBase,
    inputArgs?: HdContainerDataSource,
    renderInstanceId = '',
  ): HdSceneIndexBase {
    const plugin = this._getSceneIndexPlugin(sceneIndexPluginId)
    if (!plugin) return inputScene
    if (!plugin.isEnabled(inputArgs)) {
      return inputScene
    }
    const result = plugin.appendSceneIndex(renderInstanceId, inputScene, inputArgs)
    this._metadata.set(result, {
      rendererDisplayName: this._rendererName(inputArgs),
      sceneIndexPluginId,
      insertionPhase: -1,
    })
    return result
  }

  /** sceneIndexPluginRegistry.cpp:1428-1484 */
  appendSceneIndicesForRenderer(
    rendererDisplayName: string,
    inputScene: HdSceneIndexBase,
    renderInstanceId = '',
    appName = '',
    sceneIndexCreateArgs?: HdContainerDataSource,
  ): HdSceneIndexBase {
    // We've only discovered scene index plugins (from their plugInfo entries)
    // and collected their metadata at this point.
    // Filter the discovered plugins based on the {renderer, app} and load
    // them. For plugins using the registration API, this will trigger their
    // registration.
    this._loadPluginsForRenderer(rendererDisplayName, appName)

    let result = inputScene
    const rendererArgs = HdRetainedContainerDataSource.new(
      [HdSceneIndexPluginRegistryTokens.rendererDisplayName],
      [HdRetainedTypedSampledDataSource.new(rendererDisplayName)],
    )
    // sceneIndexPluginRegistry.cpp:1460-1462: the entry's args over the
    // scene index create args over the renderer display name.
    const underlayArgs = HdOverlayContainerDataSource.overlayedContainerDataSources(
      sceneIndexCreateArgs, rendererArgs)!
    for (const entry of this._orderedEntries(rendererDisplayName, appName)) {
      const input = result
      const args = entry.inputArgs
        ? HdOverlayContainerDataSource.overlayedContainerDataSources(entry.inputArgs, underlayArgs)
        : underlayArgs
      result = entry.callback
        ? entry.callback(renderInstanceId, input, args)
        : this.appendSceneIndex(entry.sceneIndexPluginId, input, args, renderInstanceId)
      this._metadata.set(result, {
        rendererDisplayName,
        sceneIndexPluginId: entry.sceneIndexPluginId,
        insertionPhase: entry.phase,
      })
    }
    return result
  }

  getPluginInsertionMetadataForSceneIndex(
    sceneIndex: HdSceneIndexBase,
  ): PluginInsertionMetadata | undefined {
    return this._metadata.get(sceneIndex)
  }

  // Sets the policy for determining the order of scene index plugins. Primarily
  // in service of testing.
  setPluginOrderingPolicy(policy: PluginOrderingPolicy): void {
    this._orderingPolicy = policy
  }

  /** sceneIndexPluginRegistry.cpp:1513-1538. Loads plugins for
   *  rendererDisplayName and appName and returns the sceneIndexPluginId's in
   *  the order they'll be run. Callback-registered entries (empty plugin id)
   *  are excluded. */
  loadAndGetSceneIndexPluginIds(
    rendererDisplayName: string,
    appName: string,
  ): string[] {
    const ret: string[] = []
    this._loadPluginsForRenderer(rendererDisplayName, appName)
    for (const entry of this._orderedEntries(rendererDisplayName, appName)) {
      if (entry.sceneIndexPluginId.length === 0) {
        // Skip callback-registered entries.
        continue
      }
      const plugin = this._getSceneIndexPlugin(entry.sceneIndexPluginId)
      if (plugin) {
        if (!plugin.isEnabled(entry.inputArgs)) {
          continue
        }
        ret.push(entry.sceneIndexPluginId)
      }
    }
    return ret
  }

  /** _ComputeOrderedEntriesFromRegistration with _GatherRegistrationEntries
   *  (sceneIndexPluginRegistry.cpp:493-566, 1008-1052), for every policy
   *  (see the header). */
  private _orderedEntries(rendererDisplayName: string, appName: string): _RegEntry[] {
    void this._orderingPolicy
    const allRenderers: string = HdSceneIndexPluginRegistryTokens.allRenderers
    const forAll = (e: _RegEntry): boolean => e.rendererDisplayName === allRenderers
      && this._isPluginRelevantForApp(e.sceneIndexPluginId, appName)

    // Gather "all renderers" entries first, then the renderer-specific ones
    // (allRenderers plugins always run before specific-renderer plugins for a
    // given phase, regardless of insertion order). When the requested renderer
    // IS allRenderers there is only the one group.
    const allEntries = this._entries.filter((e) => forAll(e))
    const rendererEntries =
      rendererDisplayName === allRenderers
        ? []
        : this._entries.filter((e) => e.rendererDisplayName === rendererDisplayName
          && this._isPluginRelevantForApp(e.sceneIndexPluginId, appName))

    // sortFn: phase ascending, then order ascending (AtStart before AtEnd),
    // then plugin id lexicographic for a discovery-order-independent result.
    const sortFn = (a: _RegEntry, b: _RegEntry): number => {
      if (a.phase !== b.phase) return a.phase - b.phase
      if (a.order !== b.order) return a.order - b.order
      return a.sceneIndexPluginId < b.sceneIndexPluginId
        ? -1
        : a.sceneIndexPluginId > b.sceneIndexPluginId
          ? 1
          : 0
    }
    allEntries.sort(sortFn)
    rendererEntries.sort(sortFn)

    // Merge the two sorted lists, grouping by phase with "all renderers"
    // entries coming before "specific renderer" entries within a phase.
    const merged: _RegEntry[] = []
    let i = 0
    let j = 0
    while (i < allEntries.length && j < rendererEntries.length) {
      if (allEntries[i]!.phase <= rendererEntries[j]!.phase) {
        merged.push(allEntries[i++]!)
      } else {
        merged.push(rendererEntries[j++]!)
      }
    }
    while (i < allEntries.length) merged.push(allEntries[i++]!)
    while (j < rendererEntries.length) merged.push(rendererEntries[j++]!)

    return merged
  }

  private _rendererName(inputArgs: HdContainerDataSource | undefined): string {
    const value = inputArgs?.Get(HdSceneIndexPluginRegistryTokens.rendererDisplayName) as
      { getTypedValue(shutterOffset: number): string } | undefined
    return value?.getTypedValue(0) ?? ''
  }
}

export interface PluginInsertionMetadata {
  rendererDisplayName: string
  sceneIndexPluginId: string
  insertionPhase: number
}
