// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/layer.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Collector, Reporter, type EventNode } from 'typescript-usd/trace'
import { Asset as ArAsset, InMemoryAsset as ArInMemoryAsset, ResolvedPath as ArResolvedPath, Resolver as ArResolver } from 'typescript-usd/ar'
import { TfErrorMark } from 'typescript-usd/tf'
import { Layer, _sdfFindOrOpenLayer as findOrOpen } from '../../src/layer.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)
let resolverSequence = 0

class ResolvingAssetResolver extends ArResolver {
  constructor(
    private readonly resolvedPath: string,
    private readonly bytes: Uint8Array,
  ) { super() }
  async resolve(): Promise<ArResolvedPath> { return new ArResolvedPath(this.resolvedPath) }
  async openAsset(): Promise<ArAsset> { return new ArInMemoryAsset(this.bytes) }
}

function onlyChild(node: EventNode, key: string): EventNode {
  expect(node.children.map(child => child.key)).toEqual([key])
  return node.children[0]!
}

describe('Sdf canonical file-format read boundaries', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })
  afterEach(() => { collector.enabled = false })

  it('USDA follows Layer.fromBytes -> Layer.read -> SdfUsdaFileFormat.read -> parseUsda', () => {
    const reporter = new Reporter('Sdf USDA read path')
    collector.enabled = true
    Layer.fromBytes(enc('#usda 1.0\ndef Scope "World" {}'), 'trace.usda')
    collector.enabled = false
    reporter.updateTraceTrees()

    const root = reporter.getEventRoot().children[0]?.children[0]!
    const read = onlyChild(root, 'typescript-usd:Layer.read')
    expect(read.children.map(child => child.key)).toEqual([
      'typescript-usd:SdfFileFormat.findByExtension',
      'typescript-usd:SdfUsdaFileFormat.read',
    ])
    expect(read.children[1]!.children.map(child => child.key)).toEqual(['typescript-usd:parseUsda'])
    expect(JSON.stringify(root)).not.toContain('typescript-usd:parseCrate')
  })

  it('USDC follows Layer.fromBytes -> Layer.read -> SdfUsdcFileFormat.read -> parseCrate', () => {
    const source = Layer.createInMemory('source.usda', '#usda 1.0\ndef Scope "World" {}')
    const bytes = source.toUsdc()
    const reporter = new Reporter('Sdf USDC read path')
    collector.enabled = true
    Layer.fromBytes(bytes, 'trace.usdc')
    collector.enabled = false
    reporter.updateTraceTrees()

    const root = reporter.getEventRoot().children[0]?.children[0]!
    const read = onlyChild(root, 'typescript-usd:Layer.read')
    expect(read.children.map(child => child.key)).toEqual([
      'typescript-usd:SdfFileFormat.findByExtension',
      'typescript-usd:SdfUsdcFileFormat.read',
    ])
    expect(read.children[1]!.children.map(child => child.key)).toEqual(['typescript-usd:parseCrate'])
    expect(JSON.stringify(root)).not.toContain('typescript-usd:parseUsda')
  })

  it('selects USDC from the resolved asset path for an extensionless logical identifier', async () => {
    const source = Layer.createInMemory('source.usda', '#usda 1.0\ndef Scope "World" {}')
    const suffix = ++resolverSequence
    const layer = await findOrOpen(
      `logical-${suffix}`,
      new ResolvingAssetResolver(`/resolved/logical-${suffix}.usdc`, source.toUsdc()),
    )
    // SdfLayer::GetField returns SdfSpecifierDef whichever format read the
    // layer (oracle: a USDC layer's /World specifier is Sdf.SpecifierDef).
    expect(layer!.getField('/World', 'specifier')).toBe('def')
    expect(layer!.getField('/World', 'typeName')).toBe('Scope')
  })

  it('fails to open an unknown resolved extension while fromBytes retains its USDA fallback', async () => {
    const bytes = enc('#usda 1.0\ndef Scope "World" {}')
    const suffix = ++resolverSequence
    // layer.cpp:3563-3568: no layer, with a coding error.
    const mark = new TfErrorMark()
    try {
      expect(await findOrOpen(
        `logical-unknown-${suffix}`,
        new ResolvingAssetResolver(`/resolved/logical-${suffix}.unknown`, bytes),
      )).toBeUndefined()
      const errors = mark.getErrors()
      mark.clear()
      expect(errors.map(error => [error.isCodingError(), error.getCommentary()]))
        .toEqual([[true, `Cannot determine file format for @logical-unknown-${suffix}@`]])
    } finally {
      mark.dispose()
    }

    expect(Layer.fromBytes(bytes, `logical-${suffix}`).getField('/World', 'specifier')).toBe('def')
  })
})
