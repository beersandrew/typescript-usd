// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/layerStack.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  ErrorType as PcpErrorType,
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  SDF_LAYER_OFFSET_IDENTITY,
  computePcpLayerStack,
} from '../../src/index.ts'

// Hermetic fake layer: a flat field map for the '/' spec; resolveAsset is
// identity (test paths are already "resolved").
function fakeLayer(filePath: string, rootFields: Record<string, unknown> = {}): PcpLayer {
  return {
    filePath,
    hasSpec: path => path === '/',
    getSpecType: path => path === '/' ? 'pseudoRoot' : 'unknown',
    getSpecPaths: () => ['/'],
    getFieldNames: path => path === '/' ? Object.keys(rootFields) : [],
    getField(specPath: string, fieldName: string): unknown {
      return specPath === '/' ? rootFields[fieldName] : undefined
    },
    resolveAsset(assetPath: string): string {
      return assetPath
    },
  }
}

// A fake layer with prim specs (path -> fields, '/' included), and
// optionally its own schema (SdfLayer::GetSchema).
function fakeSpecLayer(
  filePath: string, specs: Record<string, Record<string, unknown>>,
  schema?: { isRegistered(fieldName: string): boolean },
): PcpLayer {
  return {
    filePath,
    hasSpec: path => path in specs,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path in specs ? 'prim' : 'unknown',
    getSpecPaths: () => Object.keys(specs),
    getFieldNames: path => Object.keys(specs[path] ?? {}),
    getField: (specPath, fieldName) => specs[specPath]?.[fieldName],
    resolveAsset: assetPath => assetPath,
    ...(schema ? { getSchema: () => schema } : {}),
  }
}

// A non-USD file format schema that registers Pcp_Fields->primRelocates.
const primRelocatesSchema = { isRegistered: (field: string) => field === 'relocates' }

function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map((l) => [l.filePath, l]))
  return async (filePath: string) => byPath.get(filePath) ?? null
}

describe('computePcpLayerStack — flattening', () => {
  it('a lone layer is the only stack entry, at identity offset', async () => {
    const root = fakeLayer('/root')
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(ls.layers.map((l) => l.layer.filePath)).toEqual(['/root'])
    expect(ls.layers[0]!.offset).toEqual(SDF_LAYER_OFFSET_IDENTITY)
    expect(ls.hasRelocates).toBe(false)
  })

  it('collects sublayers depth-first pre-order, strong→weak', async () => {
    const c = fakeLayer('/c')
    const a = fakeLayer('/a', { subLayers: ['/c'] })
    const b = fakeLayer('/b')
    const root = fakeLayer('/root', { subLayers: ['/a', '/b'] })
    const ls = await computePcpLayerStack(root, openerOver([root, a, b, c]))
    expect(ls.layers.map((l) => l.layer.filePath)).toEqual(['/root', '/a', '/c', '/b'])
  })

  it('composes sublayer offsets relative to the root (deepest maps up to root)', async () => {
    const c = fakeLayer('/c')
    const a = fakeLayer('/a', { subLayers: ['/c'], subLayerOffsets: [{ offset: 5, scale: 2 }] })
    const root = fakeLayer('/root', { subLayers: ['/a'], subLayerOffsets: [{ offset: 10, scale: 1 }] })
    const ls = await computePcpLayerStack(root, openerOver([root, a, c]))
    const byPath = new Map(ls.layers.map((l) => [l.layer.filePath, l.offset]))
    expect(byPath.get('/root')).toEqual(SDF_LAYER_OFFSET_IDENTITY)
    expect(byPath.get('/a')).toEqual({ offset: 10, scale: 1 })
    // c under a: compose({10,1}, {5,2}) = {10 + 1*5, 1*2} = {15, 2}
    expect(byPath.get('/c')).toEqual({ offset: 15, scale: 2 })
  })

  it('guards against sublayer cycles (no infinite recursion)', async () => {
    const a = fakeLayer('/a', { subLayers: ['/b'] })
    const b = fakeLayer('/b', { subLayers: ['/a'] })
    const ls = await computePcpLayerStack(a, openerOver([a, b]))
    expect(ls.layers.map((l) => l.layer.filePath)).toEqual(['/a', '/b'])
  })
})

describe('computePcpLayerStack — relocations', () => {
  it('non-nested relocates: combined == incremental', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: { '/Root/Foo': '/Root/Spam', '/Root/ChildA': '/Root/ChildB' },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual({
      '/Root/Foo': '/Root/Spam',
      '/Root/ChildA': '/Root/ChildB',
    })
    expect(Object.fromEntries(ls.relocatesSourceToTarget)).toEqual({
      '/Root/Foo': '/Root/Spam',
      '/Root/ChildA': '/Root/ChildB',
    })
    expect(Object.fromEntries(ls.relocatesTargetToSource)).toEqual({
      '/Root/Spam': '/Root/Foo',
      '/Root/ChildB': '/Root/ChildA',
    })
    // Only prims with authored prim relocates are listed
    // (allPrimPathsWithAuthoredRelocates, layerStack.cpp:494).
    expect(ls.pathsToPrimsWithRelocates).toEqual([])
  })

  it('nested relocates: combined source uses the un-relocated origin', async () => {
    // /Root/A -> /Root/B, then /Root/B/C -> /Root/D. The origin of /Root/B/C
    // un-relocates through /Root/A -> /Root/B, so the combined map keys on
    // /Root/A/C. (Sources sit under a root prim: a root prim itself can never
    // be the source of a relocate, though it may be a target.)
    const root = fakeLayer('/root', {
      layerRelocates: { '/Root/A': '/Root/B', '/Root/B/C': '/Root/D' },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/Root/A': '/Root/B', '/Root/B/C': '/Root/D' })
    expect(Object.fromEntries(ls.relocatesSourceToTarget)).toEqual(
      { '/Root/A': '/Root/B', '/Root/A/C': '/Root/D' })
    expect(Object.fromEntries(ls.relocatesTargetToSource)).toEqual(
      { '/Root/B': '/Root/A', '/Root/D': '/Root/A/C' })
  })

  it('a stronger layer wins a conflicting relocate source', async () => {
    const weak = fakeLayer('/weak', { layerRelocates: { '/Root/A': '/Root/WEAK' } })
    const root = fakeLayer('/root', { subLayers: ['/weak'], layerRelocates: { '/Root/A': '/Root/STRONG' } })
    const ls = await computePcpLayerStack(root, openerOver([root, weak]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual({ '/Root/A': '/Root/STRONG' })
  })

  // Pcp_IsValidRelocatesEntry + _IsValidRelocatesEntryForComposing: an invalid
  // authored relocate is ignored entirely (composition continues through the
  // original paths). ErrorInvalidAuthoredRelocates exercises these end-to-end.
  it('invalid authored relocates are ignored (identity / ancestor / descendant / root-prim source)', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: {
        '/M1/I/Test': '/M1/I/Test',   // target == source
        '/M2/I/Test': '/M2/I',        // target is an ancestor of source
        '/M3/I': '/M3/I/Test',        // target is a descendant of source
        '/M4': '/M5',                 // root prims cannot be relocate sources
        '/M6/Ok': '/M6/Renamed',      // valid — survives
      },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/M6/Ok': '/M6/Renamed' })
  })

  // _ValidateAndRemoveConflictingRelocates: relocates invalid only in the
  // context of other relocates are all removed after the full scan.
  // ErrorInvalidConflictingRelocates exercises these end-to-end.
  it('conflicting relocates are all removed (same target, chained target/source)', async () => {
    const root = fakeLayer('/root', {
      layerRelocates: {
        // Two different sources naming the SAME target: both invalid.
        '/M1/I/ClassChild': '/M1/I/Test',
        '/M1/I/InstanceChild': '/M1/I/Test',
        // A chain (the target of one is the source of another): both invalid.
        '/M2/I/Child': '/M2/Test',
        '/M2/Test': '/M2/I/Renamed',
        // Independent valid relocate survives the sweep.
        '/M6/Ok': '/M6/Renamed',
      },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/M6/Ok': '/M6/Renamed' })
  })
})

// Prim relocates (Pcp_Fields->primRelocates) are read only when the layer
// stack's schema registers the field (_supportsPrimRelocates,
// layerStack.cpp:298-311); SdfSchema does not, so USD layers never compose
// them.
describe('computePcpLayerStack — prim relocates', () => {
  const specs = (extraRoot: Record<string, unknown> = {}) => ({
    '/': { primChildren: ['Root'], ...extraRoot },
    '/Root': { primChildren: ['A'] },
    // Relative paths, made absolute against the owning prim.
    '/Root/A': { relocates: { B: 'B_2' } },
  })

  it('a USD layer ignores a prim relocates field', async () => {
    const root = fakeSpecLayer('/root', specs())
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(ls.hasRelocates).toBe(false)
    expect(ls.pathsToPrimsWithRelocates).toEqual([])
  })

  it('a schema registering prim relocates composes them', async () => {
    const root = fakeSpecLayer('/root', specs(), primRelocatesSchema)
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/Root/A/B': '/Root/A/B_2' })
    expect(ls.pathsToPrimsWithRelocates).toEqual(['/Root/A'])
  })

  it('layer relocates usurp the prim relocates of the same layer', async () => {
    const root = fakeSpecLayer('/root',
      specs({ layerRelocates: [['/Root/A/C', '/Root/A/D']] }), primRelocatesSchema)
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/Root/A/C': '/Root/A/D' })
    expect(ls.pathsToPrimsWithRelocates).toEqual([])
  })

  it('layers with different schemas may support prim relocates', async () => {
    // GetSchemaForAllLayers is null, so every layer is walked.
    const weak = fakeSpecLayer('/weak', specs())
    const root = fakeSpecLayer('/root', { '/': { subLayers: ['/weak'] } }, primRelocatesSchema)
    const ls = await computePcpLayerStack(root, openerOver([root, weak]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/Root/A/B': '/Root/A/B_2' })
  })

  // _ConformLegacyRelocates (layerStack.cpp:500-591), on by default
  // (PCP_ENABLE_LEGACY_RELOCATES_BEHAVIOR): a source named by its unrelocated
  // path (/Root/Foo/A, under /Root/Foo -> /Root/Bar) moves to its most
  // relocated path (/Root/Bar/A), and the conflict a USD layer stack reports
  // (SourceIsConflictSourceDescendant) is not checked.
  it('legacy relocates are conformed to their most relocated source', async () => {
    const root = fakeSpecLayer('/root', {
      '/': { primChildren: ['Root'] },
      '/Root': { relocates: { '/Root/Foo': '/Root/Bar', '/Root/Foo/A': '/Root/Bar/B' } },
    }, primRelocatesSchema)
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual(
      { '/Root/Foo': '/Root/Bar', '/Root/Bar/A': '/Root/Bar/B' })
    expect(Object.fromEntries(ls.relocatesSourceToTarget)).toEqual(
      { '/Root/Foo': '/Root/Bar', '/Root/Foo/A': '/Root/Bar/B' })
    expect(ls.localErrors).toEqual([])
  })

  it('the same relocates in layer metadata are a conflict', async () => {
    const root = fakeSpecLayer('/root', {
      '/': { primChildren: ['Root'], layerRelocates: [['/Root/Foo', '/Root/Bar'], ['/Root/Foo/A', '/Root/Bar/B']] },
      '/Root': {},
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    expect(Object.fromEntries(ls.incrementalRelocatesSourceToTarget)).toEqual({ '/Root/Foo': '/Root/Bar' })
    expect(ls.localErrors.map(e => e.errorType)).toEqual([PcpErrorType.InvalidConflictingRelocation])
  })
})
