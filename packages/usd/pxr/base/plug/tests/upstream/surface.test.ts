// Ported from OpenUSD v26.08 pxr/base/plug/{notice,interfaceFactory,
// staticInterface,plugin,thisPlugin}.{h,cpp}.
import { describe, expect, it } from 'vitest'
import {
  PlugFindPluginResource,
  PlugStaticInterface,
  Plug_InterfaceFactory,
  Plug_RegistrationMetadata,
  Plug_StaticInterfaceBase,
  Notice,
  Plugin,
  Registry,
} from '../../src/index.ts'

describe('Phase 41 Plug runtime surface', () => {
  it('carries registration metadata and notice payloads', () => {
    const info = { Name: 'surfaceTestPlug', Type: 'resource' as const, Info: {} }
    const metadata = new Plug_RegistrationMetadata(info)
    expect(metadata.name).toBe('surfaceTestPlug')
    const [plugin] = Registry.GetInstance().RegisterPlugins(
      { Plugins: [info] },
      { surfaceTestPlug: { 'resource.txt': 'value' } },
    )
    expect(plugin).toBeInstanceOf(Plugin)
    const notice = new Notice.DidRegisterPlugins([plugin!])
    expect(notice.getNewPlugins()).toEqual([plugin])
    expect(PlugFindPluginResource(plugin, 'resource.txt')).toBe('resource.txt')
  })

  it('instantiates singleton factories and lazy static interfaces once', () => {
    let count = 0
    const factory = new Plug_InterfaceFactory(() => ({ id: ++count }))
    expect(factory.new()).toBe(factory.new())
    expect(count).toBe(1)

    const iface = new PlugStaticInterface(() => factory.new())
    expect(iface).toBeInstanceOf(Plug_StaticInterfaceBase)
    expect(iface.isInitialized()).toBe(false)
    expect(iface.Get()).toBe(factory.new())
    expect(iface.isInitialized()).toBe(true)
  })
})
