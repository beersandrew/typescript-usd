// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderDelegate.cpp,
//  pxr/imaging/plugin/hdStorm/rendererPlugin.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdStormRendererPlugin (pxr/imaging/plugin/hdStorm/rendererPlugin.cpp,
// plugInfo.json; OpenUSD 26.11.1) and the HdStRenderDelegate::IsSupported it
// forwards to (pxr/imaging/hdSt/renderDelegate.cpp:608-670). Upstream has no
// registered testenv for the plugin; each expectation cites the upstream
// source that determines it. These run without a GPU: the Hgi below is a
// stand-in whose only behaviour is IsBackendSupported.

import { describe, expect, it } from 'vitest'
import {
  RendererCreateArgsSchema as HdRendererCreateArgsSchema,
  RendererCreateArgsSchemaTokens as HdRendererCreateArgsSchemaTokens,
  RendererPluginRegistry as HdRendererPluginRegistry,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexCreateArgsSchema as HdSceneIndexCreateArgsSchema,
} from 'typescript-usd/hd'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { Hgi } from 'typescript-usd/hgi'
import { RendererPlugin as HdStormRendererPlugin } from 'typescript-usd/hdStorm'

function _StandInHgi(backendSupported: boolean): Hgi {
  const hgi = Object.create(Hgi.prototype) as Hgi
  Object.defineProperty(hgi, 'IsBackendSupported', { value: () => backendSupported })
  return hgi
}

function _Args(options: { gpuEnabled?: boolean, hgi?: Hgi }): HdRendererCreateArgsSchema {
  const builder = new HdRendererCreateArgsSchema.Builder()
  if (options.gpuEnabled !== undefined) {
    builder.setGpuEnabled(HdRetainedTypedSampledDataSource.new(options.gpuEnabled))
  }
  if (options.hgi) {
    builder.setDrivers(HdRetainedContainerDataSource.new(
      [HdRendererCreateArgsSchemaTokens.hgi],
      [HdRetainedTypedSampledDataSource.new(options.hgi)]))
  }
  return new HdRendererCreateArgsSchema(builder.build())
}

describe('HdStormRendererPlugin', () => {
  it('is registered with its plugInfo.json metadata (plugInfo.json:6-12)', () => {
    const registry = HdRendererPluginRegistry.GetInstance()
    expect(registry.getPluginDesc('HdStormRendererPlugin')).toEqual({
      id: 'HdStormRendererPlugin', displayName: 'GL', priority: 0,
    })
    const handle = registry.getOrCreateRendererPlugin('HdStormRendererPlugin')
    expect(handle.Get()).toBeInstanceOf(HdStormRendererPlugin)
    expect(handle.Get()!.getDisplayName()).toBe('GL')
    expect(handle.Get()!.getPluginId()).toBe('HdStormRendererPlugin')
    handle.Reset()
  })

  it('checks the gpuEnabled and hgi create args (hdSt/renderDelegate.cpp:608-670)', () => {
    const plugin = HdRendererPluginRegistry.GetInstance().getOrCreateRendererPlugin('HdStormRendererPlugin')
    const storm = plugin.Get()!

    let reason: { value?: string } = {}
    expect(storm.isSupported(_Args({ gpuEnabled: false, hgi: _StandInHgi(true) }), reason)).toBe(false)
    expect(reason.value).toBe('GPU not enabled')

    reason = {}
    expect(storm.isSupported(_Args({ hgi: _StandInHgi(false) }), reason)).toBe(false)
    expect(reason.value).toBe('Given Hgi backend not supported')

    reason = {}
    expect(storm.isSupported(_Args({ gpuEnabled: true, hgi: _StandInHgi(true) }), reason)).toBe(true)
    expect(reason.value).toBeUndefined()

    // No Hgi: the platform default Hgi decides. Node has no WebGPU API.
    reason = {}
    expect(storm.isSupported(_Args({ gpuEnabled: true }), reason)).toBe(false)
    expect(reason.value).toBe('Platform default Hgi not supported')

    plugin.Reset()
  })

  it('is the default plugin only when supported (hd/rendererPluginRegistry.cpp:36-70)', () => {
    const registry = HdRendererPluginRegistry.GetInstance()
    expect(registry.getDefaultPluginId(_Args({ gpuEnabled: true, hgi: _StandInHgi(true) })))
      .toBe('HdStormRendererPlugin')
    expect(registry.getDefaultPluginId(_Args({ gpuEnabled: true }))).toBe('')
  })

  it('advertises its scene index create args (rendererPlugin.cpp:79-98)', () => {
    const plugin = HdRendererPluginRegistry.GetInstance().getOrCreateRendererPlugin('HdStormRendererPlugin')
    const schema = new HdSceneIndexCreateArgsSchema(plugin.Get()!.getSceneIndexCreateArgs())
    expect(schema.getMotionBlurSupport()!.getTypedValue(0)).toBe(false)
    expect(schema.getCameraMotionBlurSupport()!.getTypedValue(0)).toBe(true)
    expect(schema.getLegacyRenderDelegateInfo()!.getTypedValue(0))
      .toEqual(HdStRenderDelegate.getRenderDelegateInfo())

    const descriptors = schema.getRenderSettingDescriptors()
    const expected = HdStRenderDelegate.getRenderSettingDescriptorsForPlugin()
    expect(descriptors.getNames()).toEqual(expected.map(d => d.key))
    for (const desc of expected) {
      const entry = descriptors.Get(desc.key)
      expect(entry.getName()!.getTypedValue(0)).toBe(desc.name)
      expect(entry.getDefaultValue()!.GetValue(0)).toEqual(desc.defaultValue)
    }
    plugin.Reset()
  })

  it('creates no render delegate where Storm is unsupported (hd/rendererPlugin.cpp:48-54)', () => {
    // CreateDelegate checks IsSupported with empty create args, i.e. the
    // platform default Hgi, which Node lacks.
    const delegate = HdRendererPluginRegistry.GetInstance().createRenderDelegate('HdStormRendererPlugin')
    expect(delegate.isValid()).toBe(false)
  })
})
