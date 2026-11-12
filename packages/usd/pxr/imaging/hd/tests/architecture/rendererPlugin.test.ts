// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/renderDelegateAdapterRenderer.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdRendererPluginRegistry / HdRendererPlugin / handles / back-end emulation
// (pxr/imaging/hd/renderer*.cpp, rendererPlugin*.cpp, plugin*UniqueHandle.cpp,
// renderDelegateAdapterRenderer.cpp; OpenUSD 26.11.1). Upstream has no
// registered hd testenv for these; each expectation below cites the upstream
// code that determines it. The test plugins and render delegate are
// registration-side doubles (what a plugin library and its plugInfo.json
// provide upstream); every behaviour under test is the ported hd code.

import { beforeEach, describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  Bprim as HdBprim,
  LegacyRenderControlInterface as HdLegacyRenderControlInterface,
  RenderDelegate as HdRenderDelegate,
  RenderDelegateAdapterRenderer as HdRenderDelegateAdapterRenderer,
  RendererCreateArgsSchema as HdRendererCreateArgsSchema,
  RendererCreateArgsSchemaTokens as HdRendererCreateArgsSchemaTokens,
  RendererPlugin as HdRendererPlugin,
  RendererPluginRegistry as HdRendererPluginRegistry,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  Rprim as HdRprim,
  SceneGlobalsSchemaTokens as HdSceneGlobalsSchemaTokens,
  RenderSettingsSchemaTokens as HdRenderSettingsSchemaTokens,
  Sprim as HdSprim,
  type RenderSettingDescriptor as HdRenderSettingDescriptor,
  type RenderSettingsMap as HdRenderSettingsMap,
} from 'typescript-usd/hd'

const _settingDescriptors: HdRenderSettingDescriptor[] = [
  { name: 'Samples', key: 'samples', defaultValue: 4 },
]

class _TestRenderDelegate extends HdRenderDelegate {
  deleted = false
  constructor(settingsMap?: HdRenderSettingsMap) {
    super()
    for (const [key, value] of settingsMap ?? []) this._settingsMap.set(key, value)
    this._populateDefaultSettings(_settingDescriptors)
  }
  getSupportedRprimTypes(): string[] { return [] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }
  createRprim(): HdRprim { throw new Error('unsupported') }
  destroyRprim(): void {}
  createSprim(): HdSprim { throw new Error('unsupported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('unsupported') }
  destroyBprim(): void {}
  CommitResources(): void {}
  override getRenderSettingDescriptors(): HdRenderSettingDescriptor[] { return _settingDescriptors }
}

const _created: _TestRendererPlugin[] = []

class _TestRendererPlugin extends HdRendererPlugin {
  supported = true
  constructor() { super(); _created.push(this) }
  isSupported(_args: HdRendererCreateArgsSchema, reasonWhyNot?: { value?: string }): boolean {
    if (!this.supported && reasonWhyNot) reasonWhyNot.value = 'test plugin unsupported'
    return this.supported
  }
  createRenderDelegate(settingsMap?: HdRenderSettingsMap): HdRenderDelegate | null {
    return new _TestRenderDelegate(settingsMap)
  }
  deleteRenderDelegate(renderDelegate: HdRenderDelegate): void {
    (renderDelegate as _TestRenderDelegate).deleted = true
  }
}

class _UnsupportedRendererPlugin extends _TestRendererPlugin {
  constructor() { super(); this.supported = false }
}

function _args(): HdRendererCreateArgsSchema {
  return new HdRendererCreateArgsSchema(new HdRendererCreateArgsSchema.Builder()
    .setGpuEnabled(HdRetainedTypedSampledDataSource.new(true))
    .build())
}

beforeEach(() => {
  HdRendererPluginRegistry._resetInstance()
  _created.length = 0
})

describe('HdRendererCreateArgsSchema', () => {
  it('round-trips the Builder members (rendererCreateArgsSchema.cpp:35-96)', () => {
    const hgi = { name: 'stand-in Hgi' }
    const container = new HdRendererCreateArgsSchema.Builder()
      .setGpuEnabled(HdRetainedTypedSampledDataSource.new(false))
      .setDrivers(HdRetainedContainerDataSource.new(
        [HdRendererCreateArgsSchemaTokens.hgi],
        [HdRetainedTypedSampledDataSource.new(hgi)]))
      .build()
    const schema = new HdRendererCreateArgsSchema(container)
    expect(schema.isDefined()).toBe(true)
    expect(schema.getGpuEnabled()!.getTypedValue(0)).toBe(false)
    expect(schema.getDrivers().getNames()).toEqual(['hgi'])
    expect(schema.getDrivers().Get(HdRendererCreateArgsSchemaTokens.hgi)!.GetValue(0)).toBe(hgi)

    // BuildRetained excludes null members (rendererCreateArgsSchema.cpp:49-71).
    expect(new HdRendererCreateArgsSchema.Builder().build().getNames()).toEqual([])

    // GetFromParent / locators (rendererCreateArgsSchema.cpp:98-143).
    const parent = HdRetainedContainerDataSource.new(['rendererCreateArgs'], [container])
    expect(HdRendererCreateArgsSchema.getFromParent(parent).getContainer()).toBe(container)
    expect(HdRendererCreateArgsSchema.getDriversLocator().GetString()).toBe('rendererCreateArgs/drivers')
    expect(HdRendererCreateArgsSchema.getGpuEnabledLocator().GetString()).toBe('rendererCreateArgs/gpuEnabled')
  })
})

describe('HdRendererPluginRegistry', () => {
  it('orders descriptions by priority, then id (hf/pluginEntry.cpp:106-124)', () => {
    HdRendererPluginRegistry.define('ZPlugin', () => new _TestRendererPlugin(), { displayName: 'Z', priority: 0 })
    HdRendererPluginRegistry.define('APlugin', () => new _TestRendererPlugin(), { displayName: 'A', priority: 0 })
    HdRendererPluginRegistry.define('HighPlugin', () => new _TestRendererPlugin(), { displayName: 'High', priority: 5 })
    const registry = HdRendererPluginRegistry.GetInstance()
    expect(registry.getPluginDescs()).toEqual([
      { id: 'APlugin', displayName: 'A', priority: 0 },
      { id: 'ZPlugin', displayName: 'Z', priority: 0 },
      { id: 'HighPlugin', displayName: 'High', priority: 5 },
    ])
    expect(registry.getPluginDesc('ZPlugin')).toEqual({ id: 'ZPlugin', displayName: 'Z', priority: 0 })
    expect(registry.getPluginDesc('Missing')).toBeNull()
    expect(registry.isRegisteredPlugin('APlugin')).toBe(true)
    // Neither listing nor looking up descriptions instantiates a plugin.
    expect(_created).toHaveLength(0)
  })

  it('skips plugins with incomplete type information (hf/pluginRegistry.cpp:182-195)', () => {
    HdRendererPluginRegistry.define('NoName', () => new _TestRendererPlugin(), { displayName: '', priority: 0 })
    expect(HdRendererPluginRegistry.GetInstance().isRegisteredPlugin('NoName')).toBe(false)
  })

  it('picks the first supported plugin as default and releases what it loaded (rendererPluginRegistry.cpp:36-70)', () => {
    HdRendererPluginRegistry.define('APlugin', () => new _UnsupportedRendererPlugin(), { displayName: 'A', priority: 0 })
    HdRendererPluginRegistry.define('BPlugin', () => new _TestRendererPlugin(), { displayName: 'B', priority: 0 })
    HdRendererPluginRegistry.define('CPlugin', () => new _TestRendererPlugin(), { displayName: 'C', priority: 0 })
    const registry = HdRendererPluginRegistry.GetInstance()
    expect(registry.getDefaultPluginId(_args())).toBe('BPlugin')
    // Stops at the first supported plugin: CPlugin is never instantiated.
    expect(_created).toHaveLength(2)
    // Each plugin was released back to a zero reference count, so the
    // registry no longer has instances to name (hf/pluginEntry.cpp:89-104).
    expect(registry.getPluginId(_created[1]!)).toBe('')
  })

  it('has no default when no plugin is supported', () => {
    HdRendererPluginRegistry.define('APlugin', () => new _UnsupportedRendererPlugin(), { displayName: 'A', priority: 0 })
    expect(HdRendererPluginRegistry.GetInstance().getDefaultPluginId(_args())).toBe('')
  })

  it('returns a counted handle with the id and display name (rendererPluginRegistry.cpp:78-83, rendererPlugin.cpp:104-126)', () => {
    HdRendererPluginRegistry.define('BPlugin', () => new _TestRendererPlugin(), { displayName: 'B display', priority: 0 })
    const registry = HdRendererPluginRegistry.GetInstance()
    expect(registry.getOrCreateRendererPlugin('Missing').isValid()).toBe(false)
    const handle = registry.getOrCreateRendererPlugin('BPlugin')
    expect(handle.isValid()).toBe(true)
    const plugin = handle.Get()!
    expect(plugin.getPluginId()).toBe('BPlugin')
    expect(plugin.getDisplayName()).toBe('B display')
    const copy = handle.copy()
    handle.Reset()
    // The copy still holds a reference: same instance.
    expect(registry.getPluginId(plugin)).toBe('BPlugin')
    copy.Reset()
    expect(registry.getPluginId(plugin)).toBe('')
    // A new reference creates a new instance.
    const again = registry.getOrCreateRendererPlugin('BPlugin')
    expect(again.Get()).not.toBe(plugin)
    again.Reset()
  })

  it('creates render delegates with the plugin display name (rendererPlugin.cpp:48-81)', () => {
    HdRendererPluginRegistry.define('BPlugin', () => new _TestRendererPlugin(), { displayName: 'B display', priority: 0 })
    const registry = HdRendererPluginRegistry.GetInstance()
    const delegateHandle = registry.createRenderDelegate('BPlugin', new Map([['samples', 16]]))
    expect(delegateHandle.isValid()).toBe(true)
    expect(delegateHandle.getPluginId()).toBe('BPlugin')
    const delegate = delegateHandle.Get() as _TestRenderDelegate
    expect(delegate.getRendererDisplayName()).toBe('B display')
    expect(delegate.getRenderSetting('samples')).toBe(16)
    delegateHandle.Reset()
    expect(delegate.deleted).toBe(true)
    expect(delegateHandle.isValid()).toBe(false)
  })
})

describe('HdRendererPlugin::CreateRenderer', () => {
  it('refuses unsupported create args with a coding error (rendererPlugin.cpp:88-93)', () => {
    HdRendererPluginRegistry.define('APlugin', () => new _UnsupportedRendererPlugin(), { displayName: 'A', priority: 0 })
    const plugin = HdRendererPluginRegistry.GetInstance().getOrCreateRendererPlugin('APlugin')
    const reason: { value?: string } = {}
    expect(plugin.Get()!.isSupported(_args(), reason)).toBe(false)
    expect(reason.value).toBe('test plugin unsupported')
    const mark = new TfErrorMark()
    mark.setMark()
    const renderer = plugin.Get()!.createRenderer(HdRetainedSceneIndex.new(), _args())
    expect(mark.isClean()).toBe(false)
    mark.clear()
    expect(renderer.isValid()).toBe(false)
    expect(renderer.getPluginId()).toBe('')
    plugin.Reset()
  })

  it('falls back to back-end emulation of the render delegate (rendererPlugin.cpp:134-157)', () => {
    HdRendererPluginRegistry.define('BPlugin', () => new _TestRendererPlugin(), { displayName: 'B display', priority: 0 })
    const registry = HdRendererPluginRegistry.GetInstance()
    const plugin = registry.getOrCreateRendererPlugin('BPlugin')
    const pluginInstance = plugin.Get()!

    // The scene globals point at an active render settings prim that opts in
    // to the legacy SetRenderSetting path
    // (renderDelegateAdapterRenderer.cpp:393-424).
    const sceneIndex = HdRetainedSceneIndex.new()
    sceneIndex.addPrims([
      {
        primPath: '/', primType: '',
        dataSource: HdRetainedContainerDataSource.new([HdSceneGlobalsSchemaTokens.sceneGlobals], [
          HdRetainedContainerDataSource.new([HdSceneGlobalsSchemaTokens.activeRenderSettingsPrim], [
            HdRetainedTypedSampledDataSource.new('/Render/Settings')]),
        ]),
      },
      {
        primPath: '/Render/Settings', primType: 'renderSettings',
        dataSource: HdRetainedContainerDataSource.new([HdRenderSettingsSchemaTokens.renderSettings], [
          HdRetainedContainerDataSource.new(
            [HdRenderSettingsSchemaTokens.useForLegacyRenderDelegateSettings, 'samples'],
            [HdRetainedTypedSampledDataSource.new(true), HdRetainedTypedSampledDataSource.new(64)]),
        ]),
      },
    ])

    const rendererHandle = pluginInstance.createRenderer(sceneIndex, _args())
    expect(rendererHandle.isValid()).toBe(true)
    expect(rendererHandle.getPluginId()).toBe('BPlugin')
    const renderer = rendererHandle.Get()!
    expect(renderer).toBeInstanceOf(HdRenderDelegateAdapterRenderer)

    const control = renderer.getLegacyRenderControl()!
    expect(control).toBeInstanceOf(HdLegacyRenderControlInterface)
    // Forwarded to the HdRenderDelegate base implementations
    // (renderDelegate.cpp:93-138, 235-295).
    expect(control.requiresStormTasks()).toBe(false)
    expect(control.isPauseSupported()).toBe(false)
    expect(control.Stop()).toBe(true)
    expect(control.getRenderDelegateInfo()).toEqual({
      materialBindingPurpose: 'preview',
      materialRenderContexts: [''],
      renderSettingsNamespaces: [],
      isPrimvarFilteringNeeded: false,
      shaderSourceTypes: [],
      isCoordSysSupported: false,
    })
    // The render settings observer pushed the active prim's opinion.
    expect(control.getRenderSetting('samples')).toBe(64)

    // Re-adding the active prim re-pushes its settings
    // (renderDelegateAdapterRenderer.cpp:243-267).
    sceneIndex.addPrims([{
      primPath: '/Render/Settings', primType: 'renderSettings',
      dataSource: HdRetainedContainerDataSource.new([HdRenderSettingsSchemaTokens.renderSettings], [
        HdRetainedContainerDataSource.new(
          [HdRenderSettingsSchemaTokens.useForLegacyRenderDelegateSettings],
          [HdRetainedTypedSampledDataSource.new(true)]),
      ]),
    }])
    // Absent from the prim: the descriptor's default value.
    expect(control.getRenderSetting('samples')).toBe(4)

    // Task context data goes through the HdEngine (renderDelegateAdapterRenderer.cpp:92-106).
    control.setTaskContextData('key', 7)
    const out: { value?: unknown } = {}
    expect(control.getTaskContextData('key', out)).toBe(true)
    expect(out.value).toBe(7)
    control.removeTaskContextData('key')
    expect(control.getTaskContextData('key', {})).toBe(false)

    // CreateDelegate and CreateRenderer each hold a plugin reference.
    plugin.Reset()
    expect(registry.getPluginId(pluginInstance)).toBe('BPlugin')
    rendererHandle.Reset()
    expect(rendererHandle.isValid()).toBe(false)
    expect(registry.getPluginId(pluginInstance)).toBe('')
  })
})
