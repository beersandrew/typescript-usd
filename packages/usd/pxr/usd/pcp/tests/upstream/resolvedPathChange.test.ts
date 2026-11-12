// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpResolvedPathChange.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpResolvedPathChange.py
// (registered as testPcpResolvedPathChange). Each case builds its assets in
// a fresh directory and uses ArDefaultResolver search paths [v2, v1].

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  DefaultResolverContext as ArDefaultResolverContext, GetResolver as ArGetResolver,
  ResolverContext as ArResolverContext,
} from 'typescript-usd/ar'
import { Layer } from 'typescript-usd/sdf'
import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
import {
  ArcType as PcpArcType, Cache as PcpCache, Changes as PcpChanges,
  type Layer as PcpLayer, type LayerStack as PcpLayerStack, type NodeRef as PcpNodeRef,
  _TestChangeProcessor as PcpTestChangeProcessor,
} from '../../src/index.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testPcpResolvedPathChange-'))
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

// The @cwd decorator: a fresh directory per case; paths are made absolute.
function testDir(name: string): (relative: string) => string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  return (relative: string) => path.join(dir, relative)
}

function createLayer(filePath: string, layerString: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, layerString)
}

// CreatePcpCache: the root layer and every layer Pcp opens use the context.
async function createPcpCache(rootLayerPath: string, context: ArResolverContext): Promise<PcpCache> {
  const open = async (identifier: string): Promise<PcpLayer | null> => {
    try {
      return (await _sdfFindOrOpenLayer(identifier, ArGetResolver(), context))!
    } catch {
      return null
    }
  }
  const rootLayer = (await open(rootLayerPath))!
  return PcpCache.create(rootLayer, open)
}

function assertLayerStack(layerStack: PcpLayerStack, expectedLayers: string[]): void {
  expect(layerStack.getLayers()).toEqual(expectedLayers.map(l => Layer.find(l)))
}

function assertReferenceNode(node: PcpNodeRef, expectedLayers: string[]): void {
  expect(node.getArcType()).toBe(PcpArcType.Reference)
  assertLayerStack(node.getLayerStack(), expectedLayers)
}

async function computePrimIndex(cache: PcpCache, primPath: string) {
  const pi = await cache.computePrimIndex(primPath)
  return { pi, err: pi.localErrors }
}

// pcpCache.Reload() inside Pcp._TestChangeProcessor.
async function reload(cache: PcpCache): Promise<PcpTestChangeProcessor> {
  const processor = new PcpTestChangeProcessor(cache).enter()
  const changes = new PcpChanges()
  await cache.reload(changes)
  await changes.apply()
  await processor.process()
  return processor
}

const searchPaths = (p: (relative: string) => string) =>
  new ArResolverContext(new ArDefaultResolverContext([p('v2'), p('v1')]))

describe('testPcpResolvedPathChange', () => {
  it('test_ReferencingLayerWithAbsoluteSublayerPaths', async () => {
    const p = testDir('referencingWithAbsSublayers')
    createLayer(p('absRef.usda'), '#usda 1.0\ndef "Ref" { }\n')
    createLayer(p('absSublayer.usda'), '#usda 1.0\n')
    createLayer(p('v1/root.usda'), `#usda 1.0
(
    subLayers = [
        @${p('absSublayer.usda')}@
    ]
)

def "AbsoluteReference" (
    references = @${p('absRef.usda')}@</Ref>
)
{
}

def "RelativeReference" (
    references = @./ref.usda@</Ref>
)
{
}
`)
    createLayer(p('v1/ref.usda'), '#usda 1.0\ndef "Ref" { }\n')

    // root.usda is found through the search path at v1/root.usda.
    const pcpCache = await createPcpCache('root.usda', searchPaths(p))

    let { pi, err } = await computePrimIndex(pcpCache, '/AbsoluteReference')
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('absRef.usda')])

    ;({ pi, err } = await computePrimIndex(pcpCache, '/RelativeReference'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v1/ref.usda')])

    expect(pcpCache.getLayerStack().getLayers()).toEqual(
      [Layer.find(p('v1/root.usda')), Layer.find(p('absSublayer.usda'))])

    // root.usda now resolves to v2/root.usda; prims with references relative
    // to it are resynced.
    fs.cpSync(p('v1'), p('v2'), { recursive: true })
    const changes = await reload(pcpCache)
    expect(changes.getSignificantChanges()).toEqual(['/RelativeReference'])

    expect(pcpCache.findPrimIndex('/AbsoluteReference')).toBeTruthy()
    expect(pcpCache.findPrimIndex('/RelativeReference')).toBeFalsy()

    ;({ pi, err } = await computePrimIndex(pcpCache, '/RelativeReference'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v2/ref.usda')])

    assertLayerStack(pcpCache.getLayerStack(), [p('v2/root.usda'), p('absSublayer.usda')])
  })

  it('test_ReferencingLayerWithRelativeSublayerPaths', async () => {
    const p = testDir('referencingWithRelSublayers')
    createLayer(p('absRef.usda'), '#usda 1.0\ndef "Ref" { }\n')
    createLayer(p('v1/root.usda'), `#usda 1.0
(
    subLayers = [
        @./sublayer.usda@
    ]
)
`)
    createLayer(p('v1/sublayer.usda'), `#usda 1.0

def "AbsoluteReference" (
    references = @${p('absRef.usda')}@</Ref>
)
{
}

def "RelativeReference" (
    references = @./ref.usda@</Ref>
)
{
}
`)
    createLayer(p('v1/ref.usda'), '#usda 1.0\ndef "Ref" { }\n')

    const pcpCache = await createPcpCache('root.usda', searchPaths(p))

    let { pi, err } = await computePrimIndex(pcpCache, '/AbsoluteReference')
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('absRef.usda')])

    ;({ pi, err } = await computePrimIndex(pcpCache, '/RelativeReference'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v1/ref.usda')])

    assertLayerStack(pcpCache.getLayerStack(), [p('v1/root.usda'), p('v1/sublayer.usda')])

    // The root layer stack had a relative sublayer, so it is recomputed and
    // every prim is resynced.
    fs.cpSync(p('v1'), p('v2'), { recursive: true })
    const changes = await reload(pcpCache)
    expect(changes.getSignificantChanges()).toEqual(['/'])

    expect(pcpCache.findPrimIndex('/AbsoluteReference')).toBeFalsy()
    expect(pcpCache.findPrimIndex('/RelativeReference')).toBeFalsy()

    ;({ pi, err } = await computePrimIndex(pcpCache, '/AbsoluteReference'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('absRef.usda')])

    ;({ pi, err } = await computePrimIndex(pcpCache, '/RelativeReference'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v2/ref.usda')])

    assertLayerStack(pcpCache.getLayerStack(), [p('v2/root.usda'), p('v2/sublayer.usda')])
  })

  it('test_ReferencedWithRelativeSublayerPaths', async () => {
    const p = testDir('referencedWithRelSublayers')
    createLayer(p('root.usda'), `#usda 1.0

def "SearchPathRef" (
    references = @ref.usda@</Ref>
)
{
}

def "InnocentBystander"
{
}
`)
    createLayer(p('v1/ref.usda'), `#usda 1.0
(
    subLayers = [
        @./sublayer.usda@
    ]
)
`)
    createLayer(p('v1/sublayer.usda'), '#usda 1.0\ndef "Ref" { }\n')

    const pcpCache = await createPcpCache(p('root.usda'), searchPaths(p))

    let { pi, err } = await computePrimIndex(pcpCache, '/InnocentBystander')
    expect(err).toEqual([])

    ;({ pi, err } = await computePrimIndex(pcpCache, '/SearchPathRef'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v1/ref.usda'), p('v1/sublayer.usda')])

    // ref.usda now resolves to v2/ref.usda; its relative sublayer's anchor
    // changed, so prims using that layer stack are resynced.
    fs.cpSync(p('v1'), p('v2'), { recursive: true })
    const changes = await reload(pcpCache)
    expect(changes.getSignificantChanges()).toEqual(['/SearchPathRef'])

    expect(pcpCache.findPrimIndex('/InnocentBystander')).toBeTruthy()
    expect(pcpCache.findPrimIndex('/SearchPathRef')).toBeFalsy()

    ;({ pi, err } = await computePrimIndex(pcpCache, '/SearchPathRef'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v2/ref.usda'), p('v2/sublayer.usda')])
  })

  it('test_ReferencedWithAbsoluteSublayerPaths', async () => {
    const p = testDir('referencedWithAbsSublayers')
    createLayer(p('root.usda'), `#usda 1.0

def "SearchPathRef" (
    references = @ref.usda@</Ref>
)
{
}

def "InnocentBystander"
{
}
`)
    createLayer(p('absSublayer.usda'), '#usda 1.0\ndef "Ref" {}\n')
    createLayer(p('v1/ref.usda'), `#usda 1.0
(
    subLayers = [
        @${p('absSublayer.usda')}@
    ]
)
`)

    const pcpCache = await createPcpCache(p('root.usda'), searchPaths(p))

    let { pi, err } = await computePrimIndex(pcpCache, '/InnocentBystander')
    expect(err).toEqual([])

    ;({ pi, err } = await computePrimIndex(pcpCache, '/SearchPathRef'))
    expect(err).toEqual([])
    assertReferenceNode(pi.rootNode.children[0]!, [p('v1/ref.usda'), p('absSublayer.usda')])

    // The referenced layer stack's sublayer path is absolute, so it holds
    // the same layers after the reload and nothing is resynced.
    fs.cpSync(p('v1'), p('v2'), { recursive: true })
    const changes = await reload(pcpCache)
    expect(changes.getSignificantChanges()).toEqual([])
  })
})
