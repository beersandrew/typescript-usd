import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Collector, Reporter } from 'typescript-usd/trace'
import { Layer } from '../../src/layer.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('Sdf layer-open trace instrumentation', () => {
  const collector = Collector.GetInstance()

  beforeEach(() => {
    collector.enabled = false
    collector.clear()
  })

  afterEach(() => { collector.enabled = false })

  it('preserves the OpenUSD layer-open boundary order and parentage', async () => {
    const reporter = new Reporter('Sdf layer open')
    collector.enabled = true
    await _sdfFindOrOpenLayer('trace-layer.usda', new ArInMemoryResolver({
      'trace-layer.usda': enc('#usda 1.0\ndef Scope "World" {}'),
    }))
    collector.enabled = false
    reporter.updateTraceTrees()

    const lanes = reporter.getEventRoot().children
    expect(lanes).toHaveLength(1)
    const findOrOpen = lanes[0]?.children[0]
    expect(findOrOpen?.key).toBe('typescript-usd:Layer.findOrOpen')
    expect(findOrOpen?.attributes.get('identifier')).toEqual(['trace-layer.usda'])
    expect(findOrOpen?.children.map(node => node.key)).toEqual([
      'typescript-usd:Layer.computeInfoToFindOrOpenLayer',
      'typescript-usd:LayerRegistry.findOrOpen',
    ])

    const computeInfo = findOrOpen?.children[0]
    expect(computeInfo?.children.map(node => node.key)).toEqual([
      'typescript-usd:sdfResolvePath',
      'typescript-usd:SdfFileFormat.findByExtension',
    ])
    expect(computeInfo?.children[0]?.attributes.get('assetPath'))
      .toEqual(['trace-layer.usda'])

    const registry = findOrOpen?.children[1]
    expect(registry?.children.map(node => node.key)).toEqual([
      'typescript-usd:LayerRegistry.find',
      'typescript-usd:Layer.openLayer',
      'typescript-usd:LayerRegistry.find',
      'typescript-usd:LayerRegistry.insert',
    ])
    const read = registry?.children[1]?.children[0]
    expect(read?.key).toBe('typescript-usd:Layer.read')
    expect(read?.children[0]?.key).toBe('typescript-usd:SdfUsdaFileFormat.read')
    expect(read?.children[0]?.children[0]?.key).toBe('typescript-usd:parseUsda')
  })

  it('does not allocate layer-open events while tracing is disabled', async () => {
    await _sdfFindOrOpenLayer('disabled-layer.usda', new ArInMemoryResolver({
      'disabled-layer.usda': enc('#usda 1.0\ndef Scope "World" {}'),
    }))
    expect(collector.createCollection().empty).toBe(true)
  })
})
