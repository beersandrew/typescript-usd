import { describe, expect, it } from 'vitest'
import {
  LayerHandle as PcpLayerHandle,
  pcpLayerStackIdentifier,
  pcpLayerStackIdentifierEquals,
  pcpLayerStackIdentifierKey,
  pcpSite,
  pcpSiteEquals,
  pcpSiteKey,
} from '../../src/index.ts'

const layer = (filePath: string): PcpLayerHandle => ({ filePath })

describe('PcpLayerStackIdentifier', () => {
  it('keys and compares by (rootLayer, sessionLayer) identity', () => {
    const a = pcpLayerStackIdentifier(layer('/root.usd'))
    const b = pcpLayerStackIdentifier(layer('/root.usd'))
    const c = pcpLayerStackIdentifier(layer('/root.usd'), layer('/session.usd'))

    expect(pcpLayerStackIdentifierEquals(a, b)).toBe(true)
    expect(pcpLayerStackIdentifierKey(a)).toBe(pcpLayerStackIdentifierKey(b))
    expect(pcpLayerStackIdentifierEquals(a, c)).toBe(false)
    expect(pcpLayerStackIdentifierKey(a)).not.toBe(pcpLayerStackIdentifierKey(c))
  })

  it('omits the session layer when absent', () => {
    const id = pcpLayerStackIdentifier(layer('/root.usd'))
    expect(id.sessionLayer).toBeUndefined()
  })
})

describe('PcpSite', () => {
  it('keys and compares by layer stack + path', () => {
    const id = pcpLayerStackIdentifier(layer('/root.usd'))
    const s1 = pcpSite(id, '/Model')
    const s2 = pcpSite(id, '/Model')
    const s3 = pcpSite(id, '/Other')

    expect(pcpSiteEquals(s1, s2)).toBe(true)
    expect(pcpSiteKey(s1)).toBe(pcpSiteKey(s2))
    expect(pcpSiteEquals(s1, s3)).toBe(false)
  })
})
