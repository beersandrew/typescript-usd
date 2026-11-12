import { describe, expect, it } from 'vitest'
import { normalizePath, resolveAssetPath } from '../../src/internal.ts'

describe('Ar resolver boundary', () => {
  it('normalizes anchored identifiers', () => {
    expect(resolveAssetPath('/show/layers/root.usda', '../assets/./model.usdc'))
      .toBe('/show/assets/model.usdc')
    expect(normalizePath('https://example.test/a/../b.usda'))
      .toBe('https://example.test/b.usda')
  })

  it('anchors assets inside package-relative paths', () => {
    expect(resolveAssetPath('scene.usdz[layers/root.usda]', '../textures/a.png'))
      .toBe('scene.usdz[textures/a.png]')
  })

})
