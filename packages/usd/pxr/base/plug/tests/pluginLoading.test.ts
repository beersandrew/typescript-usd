// Ported from OpenUSD 26.11.1: pxr/base/plug/info.cpp,
//  pxr/base/plug/plugin.cpp, pxr/base/plug/registry.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Plugins read from plugInfo URLs (registry.cpp:69-109; info.cpp:150-276,
// 595-690) and loaded as ES modules (plugin.cpp:202-354).
import { describe, expect, it } from 'vitest'
import { Registry, type Plugin } from '../src/index.ts'
import { TfErrorMark } from 'typescript-usd/tf'

const documents: Record<string, string> = {
  'https://plugins.test/a/plugInfo.json': `# Comment lines are allowed.
{
    "Plugins": [
        {
            "Name": "loadTestBase", "Type": "library", "LibraryPath": "lib/base.js",
            "Info": { "Types": { "LoadTestBase": {} } }
        },
        {
            "Name": "loadTestDerived", "Type": "library", "Root": "derived", "LibraryPath": "derived.js",
            "ResourcePath": "resources",
            "Info": {
                "PluginDependencies": { "LoadTestBase": ["LoadTestBase"] },
                "Types": { "LoadTestDerived": { "bases": ["LoadTestBase"] } }
            }
        }
    ],
    "Includes": ["../b/", "*/plugInfo.json"]
}`,
  'https://plugins.test/b/plugInfo.json': `{
    "Plugins": [
        {
            "Name": "loadTestSchema", "Type": "resource",
            "Info": { "Types": { "LoadTestSchemaAPI": { "bases": ["LoadTestBase"], "schemaKind": "singleApplyAPI" } } }
        },
        {
            "Name": "loadTestCycleA", "Type": "library", "LibraryPath": "a.js",
            "Info": { "PluginDependencies": { "LoadTestBase": ["LoadTestCycleB"] }, "Types": { "LoadTestCycleA": {} } }
        },
        {
            "Name": "loadTestCycleB", "Type": "library", "LibraryPath": "b.js",
            "Info": { "PluginDependencies": { "LoadTestBase": ["LoadTestCycleA"] }, "Types": { "LoadTestCycleB": {} } }
        }
    ]
}`,
  'https://plugins.test/b/generatedSchema.usda': '#usda 1.0\n',
}
const fetched: string[] = []
const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input)
  fetched.push(url)
  return url in documents ? new Response(documents[url]) : new Response(null, { status: 404 })
}) as typeof fetch

describe('plugins registered from plugInfo URLs', () => {
  const registry = Registry.GetInstance()
  const imported: string[] = []
  registry._moduleImporter = async (url) => { imported.push(url) }
  let notices: Plugin[][] = []
  registry.addDidRegisterPluginsListener(plugins => notices.push(plugins))
  let plugins: Plugin[]

  it('reads documents and their includes, notifying once', async () => {
    const mark = new TfErrorMark()
    plugins = await registry.registerPluginsAsync('https://plugins.test/a/', { fetch: fakeFetch })
    const errors = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    mark.dispose()
    expect(plugins.map(plugin => plugin.getName()).sort()).toEqual(
      ['loadTestBase', 'loadTestCycleA', 'loadTestCycleB', 'loadTestDerived', 'loadTestSchema'])
    expect(notices).toHaveLength(1)
    expect(errors).toEqual([
      "Plugin info file https://plugins.test/a/plugInfo.json include '*/plugInfo.json' uses wildcards, which URLs cannot list",
    ])
    expect(imported).toEqual([])
  })

  it('resolves Root, LibraryPath and ResourcePath against the document', () => {
    const base = registry.GetPluginWithName('loadTestBase')!
    expect(base.getPath()).toBe('https://plugins.test/a/lib/base.js')
    expect(base.GetResourcePath()).toBe('https://plugins.test/a/')
    const derived = registry.GetPluginWithName('loadTestDerived')!
    expect(derived.getPath()).toBe('https://plugins.test/a/derived/derived.js')
    expect(derived.GetResourcePath()).toBe('https://plugins.test/a/derived/resources/')
  })

  it('reads a schema plugin\'s generatedSchema.usda at registration', async () => {
    const schema = registry.GetPluginWithName('loadTestSchema')!
    expect(schema.isLoaded()).toBe(true)
    expect(schema.hasResource('generatedSchema.usda')).toBe(true)
    expect(await schema.getResource('generatedSchema.usda')).toBe('#usda 1.0\n')
  })

  it('loads dependencies first and each module once', async () => {
    const derived = registry.GetPluginWithName('loadTestDerived')!
    expect(derived.isLoaded()).toBe(false)
    const [first, second] = await Promise.all([derived.loadAsync(), derived.loadAsync()])
    expect(first && second).toBe(true)
    expect(imported).toEqual(['https://plugins.test/a/lib/base.js', 'https://plugins.test/a/derived/derived.js'])
    expect(registry.GetPluginWithName('loadTestBase')!.isLoaded()).toBe(true)
    expect(derived.Load()).toBe(true)
    expect(await derived.loadAsync()).toBe(true)
    expect(imported).toHaveLength(2)
  })

  it('reports cyclic dependencies', async () => {
    const mark = new TfErrorMark()
    expect(await registry.GetPluginWithName('loadTestCycleA')!.loadAsync()).toBe(false)
    const errors = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    mark.dispose()
    expect(errors).toEqual([
      "Load failed because of cyclic dependency for 'loadTestCycleA'",
      "Load failed: unable to load dependent plugin 'LoadTestCycleA'",
      "Load failed: unable to load dependent plugin 'LoadTestCycleB'",
    ])
  })

  it('reads each document once and ignores registered plugins', async () => {
    notices = []
    fetched.length = 0
    expect(await registry.registerPluginsAsync(['https://plugins.test/b/plugInfo.json'], { fetch: fakeFetch })).toEqual([])
    expect(fetched).toEqual(['https://plugins.test/b/plugInfo.json'])
    expect(notices).toEqual([])
  })

  it('reports a document it cannot read', async () => {
    const mark = new TfErrorMark()
    expect(await registry.registerPluginsAsync('https://plugins.test/missing/', { fetch: fakeFetch })).toEqual([])
    const errors = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    mark.dispose()
    expect(errors).toEqual(["Plugin info file https://plugins.test/missing/plugInfo.json couldn't be read"])
  })
})
