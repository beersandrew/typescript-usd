// Ported from OpenUSD 26.11.1: pxr/base/plug/plugin.cpp,
//  pxr/usd/sdf/fileFormatRegistry.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A file format plugin registered at runtime from a plugInfo URL: Sdf finds
// its format by extension through Plug (fileFormatRegistry.cpp:257-529),
// loads the plugin's ES module once (plugin.cpp:202-354), and manufactures
// the format with the factory the module defines (fileFormat.h:552-584).
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdMtlx'
import { FileFormat, FormatSupportsReading, FormatSupportsWriting, FormatSupportsEditing } from 'typescript-usd/sdf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { TfErrorMark } from 'typescript-usd/tf'
import { ArInMemoryResolver, _resolverContextForResolver } from 'typescript-usd/usd/_internal'

const exampleDir = new URL('../../../../../examples/demo-file-format/', import.meta.url)
const plugInfoUrl = new URL('plugInfo.json', exampleDir).href
const fileFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input))
  try { return new Response(await readFile(url)) } catch { return new Response(null, { status: 404 }) }
}) as typeof fetch

const scene = (files: Record<string, string>) => ({
  resolverContext: _resolverContextForResolver(new ArInMemoryResolver(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)])))),
})

const imported: string[] = []
const registry = PlugRegistry.GetInstance()
registry._moduleImporter = (url) => { imported.push(url); return import(/* @vite-ignore */ url) }

// The stage an open yields and the errors it posted.
async function openErrors(open: () => Promise<unknown>): Promise<{ stage: unknown, errors: string[] }> {
  const mark = new TfErrorMark()
  try {
    const stage = await open()
    const errors = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    return { stage, errors }
  } finally {
    mark.dispose()
  }
}

describe('file format plugins registered from a plugInfo URL', () => {
  it('finds no format for an extension no plugin declares', async () => {
    // usdMtlx's plugInfo declares the .mtlx format its module registers.
    const mark = new TfErrorMark()
    expect(FileFormat.findByExtension('scene.demo')).toBeUndefined()
    expect(FileFormat.findByExtension('a.mtlx')?.formatId).toBe('mtlx')
    expect(mark.isClean()).toBe(true)
    mark.dispose()
    expect(FormatSupportsReading('demo')).toBe(false)
    // As natively (fixtures/unknownFileFormat): the coding error, then
    // UsdStage::Open's runtime error, and no stage.
    expect(await openErrors(() => Stage.open('scene.demo', scene({ 'scene.demo': 'Xform /World\n' }))))
      .toEqual({ stage: undefined, errors: ['Cannot determine file format for @scene.demo@', 'Failed to open layer @scene.demo@'] })
  })

  it('registers the plugin without importing its module', async () => {
    const plugins = await registry.registerPluginsAsync(plugInfoUrl, { fetch: fileFetch })
    expect(plugins.map(plugin => plugin.getName())).toEqual(['demoFileFormat'])
    const [plugin] = plugins
    expect(plugin!.getPath()).toBe(new URL('demoFileFormat.js', exampleDir).href)
    expect(plugin!.GetResourcePath()).toBe(exampleDir.href)
    expect(plugin!.isLoaded()).toBe(false)
    expect(imported).toEqual([])
    // Capabilities come from the plugin metadata, before any load.
    expect(FormatSupportsReading('demo')).toBe(true)
    expect(FormatSupportsWriting('demo')).toBe(false)
    expect(FormatSupportsEditing('DEMO')).toBe(false)
  })

  it('loads the plugin on first open and composes its prims', async () => {
    const text = await readFile(new URL('scene.demo', exampleDir), 'utf8')
    const stage = (await Stage.open('scene.demo', scene({ 'scene.demo': text })))!
    expect(imported).toEqual([new URL('demoFileFormat.js', exampleDir).href])
    expect(registry.GetPluginWithName('demoFileFormat')!.isLoaded()).toBe(true)
    expect(stage.getRootLayer().getFileFormat()?.formatId).toBe('demo')
    expect(stage.getPrim('/World')!.typeName).toBe('Xform')
    const ball = stage.getPrim('/World/ball')!
    expect(ball.typeName).toBe('Sphere')
    expect(ball.getAttr('radius')!.typeName).toBe('double')
    expect(ball.getAttr('radius')!.getValue()).toBe(2)
    expect(ball.getAttr('primvars:displayColor')!.typeName).toBe('color3f[]')
    expect(stage.getRootLayer().exportToString()).toContain('color3f[] primvars:displayColor = [(1, 0.5, 0)]')
    expect(stage.getPrim('/World/box')!.getAttr('size')!.getValue()).toBe(1)
  })

  it('imports the module once and serves references to .demo layers', async () => {
    const stage = (await Stage.open('root.usda', scene({
      'root.usda': '#usda 1.0\ndef Xform "Shot" (\n    references = @props.demo@</World>\n)\n{\n}\n',
      'props.demo': 'Xform /World\nCube /World/crate size=3\n',
    })))!
    expect(stage.getPrim('/Shot/crate')!.typeName).toBe('Cube')
    expect(stage.getPrim('/Shot/crate')!.getAttr('size')!.getValue()).toBe(3)
    expect(imported).toHaveLength(1)
    expect(FileFormat.findByExtension('x.demo')).toBe(FileFormat.findById('demo'))
  })

  it('ignores a second registration of the same plugin', async () => {
    expect(await registry.registerPluginsAsync(plugInfoUrl, { fetch: fileFetch })).toEqual([])
    expect(imported).toHaveLength(1)
  })

  it('leaves the built-in formats as they were', async () => {
    expect(FileFormat.findByExtension('a.usda')?.formatId).toBe('usda')
    expect(FileFormat.findById('usdc')?.formatId).toBe('usdc')
    const stage = (await Stage.open('a.usda', scene({ 'a.usda': '#usda 1.0\ndef Scope "A"\n{\n}\n' })))!
    expect(stage.getPrim('/A')!.typeName).toBe('Scope')
  })

  it('reports a plugin whose module fails to load', async () => {
    const [plugin] = registry.RegisterPlugins({
      Plugins: [{
        Name: 'brokenFileFormat', Type: 'library', LibraryPath: 'missing.js',
        Info: { Types: { BrokenFileFormat: { bases: ['SdfFileFormat'], extensions: ['broken'], formatId: 'broken', target: 'usd' } } },
      }],
    }, undefined, { plugInfoUrl: new URL('plugInfo.json', exampleDir).href })
    const mark = new TfErrorMark()
    expect(plugin!.Load()).toBe(false)
    expect(await plugin!.loadAsync()).toBe(false)
    expect(plugin!.isLoaded()).toBe(false)
    const messages = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    mark.dispose()
    expect(messages[0]).toContain("Plugin 'brokenFileFormat' must be loaded with LoadAsync before use")
    expect(messages[1]).toMatch(/^Failed to load plugin 'brokenFileFormat': .* in '.*\/missing\.js'$/)
    // Finding the format retries the plugin load, which posts its errors
    // again before the open's own.
    const opened = await openErrors(() => Stage.open('x.broken', scene({ 'x.broken': '' })))
    expect(opened.stage).toBeUndefined()
    expect(opened.errors.slice(0, -2).every(message => message.includes("'brokenFileFormat'"))).toBe(true)
    expect(opened.errors.slice(-2)).toEqual(['Cannot determine file format for @x.broken@', 'Failed to open layer @x.broken@'])
  })

  it('rejects a second format claiming an extension and target already taken', async () => {
    const mark = new TfErrorMark()
    registry.RegisterPlugins({
      Plugins: [{
        Name: 'shadowingFileFormat', Type: 'resource',
        Info: { Types: { ShadowingFileFormat: { bases: ['SdfFileFormat'], extensions: ['usda'], formatId: 'shadow', target: 'usd' } } },
      }],
    })
    expect(FileFormat.findByExtension('a.usda')?.formatId).toBe('usda')
    const messages = mark.getErrors().map(error => error.getCommentary())
    mark.clear()
    mark.dispose()
    expect(messages).toEqual(["Multiple file formats with target 'usd' registered for extension 'usda', skipping."])
  })
})
