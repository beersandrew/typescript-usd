// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfRelocates.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/sdf/testenv/testSdfRelocates.py.
//
// The "(parse)" suites feed the USDA parser the exact layer text that
// upstream's ExportToString() produces in each test and check the parsed field
// values. The suites after them port upstream's tests as written, through the
// layer relocates authoring API: the layer relocates list,
// HasRelocates/ClearRelocates and SetInfo/GetInfo on the pseudo-root.

import { describe, expect, it } from 'vitest'
import { Layer, PrimSpec } from 'typescript-usd/sdf'

describe('prim relocates (parse)', () => {
  // OpenUSD 26.11.1 has no prim relocates in Sdf: relocates are layer metadata
  // only (LayerMetadataItem, textFileFormatParser.h:1631-1634) and the prim
  // metadata grammar fails at the keyword. Native usdcat on this text:
  //   prim.usda:3:13: Expected ) at 'relocates = {<B>: <B_2>}) {}' in </Root/A>
  const PRIM_RELOCATES_USDA =
    '#usda 1.0\n' +
    'def "Root" {\n' +
    '  over "A" (relocates = {<B>: <B_2>}) {}\n' +
    '}\n'

  it('rejects relocates in prim metadata, as the native parser does', () => {
    expect(() => Layer.createInMemory('prim.usda', PRIM_RELOCATES_USDA))
      .toThrow("3:13: Expected ) at 'relocates = {<B>: <B_2>}) {}' in </Root/A>")
  })
})

describe('test_LayerRelocates (parse)', () => {
  // Golden: Sdf.Layer.ExportToString() after
  //   layer.relocates = [("/Root/source2","/Root/target2"),
  //                      ("/Root/source1","/Root/target1"),
  //                      ("/Root/source3","/Root/target3"),
  //                      ("/Root/sourceToDelete", Sdf.Path())]
  // Layer-metadata relocates are authored with ABSOLUTE paths and an empty
  // target is written as `<>`; insertion order is preserved (not sorted).
  const LAYER_RELOCATES_USDA =
    '#usda 1.0\n' +
    '(\n' +
    '    relocates = {\n' +
    '        </Root/source2>: </Root/target2>, \n' +
    '        </Root/source1>: </Root/target1>, \n' +
    '        </Root/source3>: </Root/target3>, \n' +
    '        </Root/sourceToDelete>: <>\n' +
    '    }\n' +
    ')\n' +
    '\n' +
    'def Scope "Root"\n' +
    '{\n' +
    '}\n' +
    '\n'

  it('parses layer-metadata relocates under layerRelocates on the pseudo-root', () => {
    const layer = Layer.createInMemory('layer.usda', LAYER_RELOCATES_USDA)
    const relocates = layer.getField('/', 'layerRelocates') as [string, string][]

    // Field is present (the HasRelocates()/HasInfo(LayerRelocatesKey) analog).
    expect(layer.getFieldNames('/')).toContain('layerRelocates')
    expect(relocates).toBeDefined()

    // Golden: layer.relocates == [('/Root/source2','/Root/target2'),
    //   ('/Root/source1','/Root/target1'), ('/Root/source3','/Root/target3'),
    //   ('/Root/sourceToDelete', Sdf.Path.emptyPath)], in authored order. The
    // empty target `<>` is recorded as the empty string (relocate-to-none).
    expect(relocates).toEqual([
      ['/Root/source2', '/Root/target2'],
      ['/Root/source1', '/Root/target1'],
      ['/Root/source3', '/Root/target3'],
      ['/Root/sourceToDelete', ''],
    ])
  })

  it('records the empty-path delete target as the empty string', () => {
    const layer = Layer.createInMemory('layer.usda', LAYER_RELOCATES_USDA)
    const relocates = layer.getField('/', 'layerRelocates') as [string, string][]
    expect(relocates.find(([source]) => source === '/Root/sourceToDelete')?.[1]).toBe('')
  })

  it('round-trips multiple layer relocates with required separators', () => {
    // OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.cpp:795-818 writes a comma
    // between every pair of relocate entries.
    const layer = Layer.createInMemory('layer.usda', LAYER_RELOCATES_USDA)
    const text = layer.toUsda()
    expect(text).toContain('</Root/source2>: </Root/target2>,')
    expect(text).toContain('</Root/source1>: </Root/target1>,')
    expect(() => Layer.createInMemory('roundtrip.usda', text)).not.toThrow()
  })

  it('reports no layerRelocates field when none are authored', () => {
    // Golden: a layer with no relocates has HasRelocates() == False and
    // HasInfo(LayerRelocatesKey) == False (GetInfo returns the fallback []).
    const layer = Layer.createInMemory(
      'plain.usda',
      '#usda 1.0\n\ndef Scope "Root"\n{\n}\n\n',
    )
    expect(layer.getFieldNames('/')).not.toContain('layerRelocates')
    expect(layer.getField('/', 'layerRelocates')).toBeUndefined()
  })
})

describe('test_EmptyRelocatesRoundtrip (parse)', () => {
  // Golden: a layer with an explicitly authored empty `relocates = { }` in layer
  // metadata. Pixar: pseudoRoot.HasInfo('layerRelocates') == True and
  // GetInfo('layerRelocates') == [] (an explicit-but-empty relocates field).
  const EMPTY_RELOCATES_USDA =
    '#usda 1.0\n' +
    '(\n' +
    '    relocates = {\n' +
    '    }\n' +
    ')\n' +
    '\n' +
    'def Scope "Root"\n' +
    '{\n' +
    '}\n' +
    '\n'

  it('parses an explicit empty relocates as a present-but-empty layerRelocates field', () => {
    const layer = Layer.createInMemory('empty.usda', EMPTY_RELOCATES_USDA)

    // The field is present (HasInfo == True) ...
    expect(layer.getFieldNames('/')).toContain('layerRelocates')

    // ... and evaluates to the empty container (GetInfo == []).
    expect(layer.getField('/', 'layerRelocates')).toEqual([])
  })
})

// SdfLayer relocates API (layer.h: GetRelocates, SetRelocates, HasRelocates,
// ClearRelocates) and Sdf.Layer.LayerRelocatesKey (SdfFieldKeys->LayerRelocates).
type SdfRelocate = [string, string]
type LayerRelocatesApi = {
  getRelocates(): SdfRelocate[]
  setRelocates(relocates: readonly SdfRelocate[]): void
  hasRelocates(): boolean
  clearRelocates(): void
}
const relocatesApi = (layer: Layer): LayerRelocatesApi => layer as unknown as LayerRelocatesApi
const LayerRelocatesKey = (Layer as unknown as { LayerRelocatesKey: string }).LayerRelocatesKey

const hasPair = (pairs: Iterable<readonly [string, string]>, source: string, target: string): boolean =>
  [...pairs].some(([s, t]) => s === source && t === target)

describe('testSdfRelocates', () => {
  // Create a new layer with a single root prim /Root
  function _CreateTestLayer(): Layer {
    const layer = Layer.createAnonymous('.usda')
    PrimSpec.new(layer, 'Root', 'def', 'Scope')
    return layer
  }

  // Test editing relocates in layer metadata. The relocates property on layer
  // is NOT a proxy object and is just a simple read/write property. Any edits
  // to layers relocates must be explicitly set from a full list value. Also
  // layer relocates are a list of relocation path pairs which is different
  // from prim relocates which are path to path map type.
  it('test_LayerRelocates', () => {
    // Test editing relocates directly on the layer
    const layer = _CreateTestLayer()
    const api = relocatesApi(layer)

    // Prim starts with no relocates
    expect(api.getRelocates()).toEqual([])
    expect(api.hasRelocates()).toBe(false)

    // Set relocates; use absolute paths since they'll be authored in layer
    // metadata.
    api.setRelocates([
      ['/Root/source2', '/Root/target2'],
      ['/Root/source1', '/Root/target1'],
      ['/Root/source3', '/Root/target3'],
      ['/Root/sourceToDelete', '']])
    expect(api.hasRelocates()).toBe(true)
    expect(api.getRelocates()).toEqual(
      [['/Root/source2', '/Root/target2'],
        ['/Root/source1', '/Root/target1'],
        ['/Root/source3', '/Root/target3'],
        ['/Root/sourceToDelete', '']])

    // Write layer; relocates are written as layer metadata when the layer
    // is written.
    expect(layer.exportToString()).toBe(`#usda 1.0
(
    relocates = {
        </Root/source2>: </Root/target2>, 
        </Root/source1>: </Root/target1>, 
        </Root/source3>: </Root/target3>, 
        </Root/sourceToDelete>: <>
    }
)

def Scope "Root"
{
}

`)

    // Delete relocate
    let newRelocates = api.getRelocates()
    newRelocates.splice(0, 1)
    api.setRelocates(newRelocates)
    expect(api.hasRelocates()).toBe(true)
    expect(hasPair(api.getRelocates(), '/Root/source2', '/Root/target2')).toBe(false)
    expect(api.getRelocates()).toEqual(
      [['/Root/source1', '/Root/target1'],
        ['/Root/source3', '/Root/target3'],
        ['/Root/sourceToDelete', '']])

    // Add a single new relocate
    newRelocates = api.getRelocates()
    newRelocates.push(['/Root/source4', '/Root/target4'])
    api.setRelocates(newRelocates)
    expect(api.hasRelocates()).toBe(true)
    expect(hasPair(api.getRelocates(), '/Root/source4', '/Root/target4')).toBe(true)
    expect(api.getRelocates()).toEqual(
      [['/Root/source1', '/Root/target1'],
        ['/Root/source3', '/Root/target3'],
        ['/Root/sourceToDelete', ''],
        ['/Root/source4', '/Root/target4']])

    // Overwrite an existing relocate
    newRelocates = api.getRelocates()
    newRelocates[0] = ['/Root/source1', '/Root/targetFoo']
    api.setRelocates(newRelocates)
    expect(api.hasRelocates()).toBe(true)
    expect(hasPair(api.getRelocates(), '/Root/source1', '/Root/target1')).toBe(false)
    expect(hasPair(api.getRelocates(), '/Root/source1', '/Root/targetFoo')).toBe(true)
    expect(api.getRelocates()).toEqual(
      [['/Root/source1', '/Root/targetFoo'],
        ['/Root/source3', '/Root/target3'],
        ['/Root/sourceToDelete', ''],
        ['/Root/source4', '/Root/target4']])

    // Clear all relocates
    api.clearRelocates()
    expect(api.hasRelocates()).toBe(false)
    expect(api.getRelocates()).toEqual([])
  })

  // Test that layer relocates can be set and retrieved via Get/Set/HasInfo
  // API on the pseudoroot
  it('test_LayerRelocatesMetadata', () => {
    const layer = _CreateTestLayer()
    const pseudoRoot = layer.getPseudoRoot()

    // New layer has no relocates metadata to start
    expect(pseudoRoot.hasInfo(LayerRelocatesKey)).toBe(false)
    expect(pseudoRoot.getInfo(LayerRelocatesKey)).toEqual([])
    expect(relocatesApi(layer).getRelocates()).toEqual([])

    // Set the relocates field on the pseudo-root.
    pseudoRoot.setInfo(LayerRelocatesKey,
      [['/Root/source1', '/Root/target1'],
        ['/Root/source2', '/Root/target2']])

    // Relocates field exists and is set to the path values.
    expect(pseudoRoot.hasInfo(LayerRelocatesKey)).toBe(true)
    expect(pseudoRoot.getInfo(LayerRelocatesKey)).toEqual(
      [['/Root/source1', '/Root/target1'],
        ['/Root/source2', '/Root/target2']])

    // Relocates on the layer evaluates to the metadata value.
    expect(relocatesApi(layer).getRelocates()).toEqual(
      [['/Root/source1', '/Root/target1'],
        ['/Root/source2', '/Root/target2']])
  })

  // Test that an explicitly authored empty layer relocates gets written out as
  // empty data in the layer
  it('test_EmptyRelocatesRoundtrip', () => {
    // Create and new layer with an explicit empty relocates in the layer
    // metadata.
    const layerContents = `#usda 1.0
(
    relocates = {
    }
)

def Scope "Root"
{
}

`
    const layer = Layer.createAnonymous('.usda')
    layer.importFromString(layerContents)

    // The pseudoroot will have a layer relocates field and the returned
    // value for that field will be an empty list
    expect(layer.getPseudoRoot().hasInfo('layerRelocates')).toBe(true)
    expect(layer.getPseudoRoot().getInfo('layerRelocates')).toEqual([])

    // Writing the layer will produce the same contents with the explicit
    // empty layer relocates field.
    expect(layer.exportToString()).toBe(layerContents)

    // Clear the relocates on the layer via the layer API.
    relocatesApi(layer).clearRelocates()

    // This clears the relocates field on the pseudo-root (it no longer has
    // that field). The returned value for the field will still be the
    // fallback empty list though.
    expect(layer.getPseudoRoot().hasInfo('layerRelocates')).toBe(false)
    expect(layer.getPseudoRoot().getInfo('layerRelocates')).toEqual([])

    // Writing the layer will no longer write the relocates as the field is
    // no longer present.
    expect(layer.exportToString()).toBe(`#usda 1.0

def Scope "Root"
{
}

`)

    // Now explicitly set the relocates field on the pseudo-root to an empty
    // list using the SetInfo API
    layer.getPseudoRoot().setInfo(LayerRelocatesKey, [])

    // The relocates field will exist again and be the empty dictionary.
    expect(layer.getPseudoRoot().hasInfo('layerRelocates')).toBe(true)
    expect(layer.getPseudoRoot().getInfo('layerRelocates')).toEqual([])

    // Writing the layer again will produce the original contents of the
    // layer with the explicitly empty relocates.
    expect(layer.exportToString()).toBe(layerContents)
  })
})
