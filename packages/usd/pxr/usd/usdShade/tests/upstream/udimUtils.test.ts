// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeUdimUtils.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeUdimUtils.py (OpenUSD 26.11.1).
// Fixtures: fixtures/testUsdShadeUdimUtils is a verbatim copy of the
// upstream testenv directory pxr/usd/usdShade/testenv/testUsdShadeUdimUtils
// (Pixar, TOST 1.0 license). The test runs with that
// directory as its cwd upstream; here paths are absolute against it, which
// matches os.path.abspath in the Python assertions. Tile resolution is
// asynchronous in TypeScript (ArResolver::Resolve returns a promise).
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AssetPath, Layer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UdimUtils } from '../../src/index.ts'

const testenv = path.join(import.meta.dirname, 'fixtures/testUsdShadeUdimUtils')

async function openLayer(): Promise<Layer> {
  return (await Layer.findOrOpen(path.join(testenv, 'layer.usda')))!
}

// attr.default.path in the Python test: SdfAssetPath::GetAssetPath. Layer
// data holds an authored asset path either as an SdfAssetPath or as its
// path string.
function assetPathOf(layer: Layer, propPath: string): string {
  const value = layer.getPropertyAtPath(propPath)!.getDefaultValue()
  return value instanceof AssetPath ? value.getAssetPath() : value as string
}

describe('TestUsdShadeUdimUtils', () => {
  // testUsdShadeUdimUtils.py:14-28 (test_IsUdimIdentifier).
  it('test_IsUdimIdentifier', async () => {
    const layer = await openLayer()
    const test = (propPath: string, value: boolean) =>
      expect(UdimUtils.isUdimIdentifier(assetPathOf(layer, propPath))).toBe(value)
    test('/foo.udim_style_a', true)
    test('/foo.udim_style_b', true)
    test('/foo.udim_missing', true)
    test('/foo.not_udim', false)
  })

  // testUsdShadeUdimUtils.py:30-63 (test_ResolveUdimTilePaths).
  it('test_ResolveUdimTilePaths', async () => {
    const layer = await openLayer()
    const test = async (propPath: string, expected: [string, string][]) => {
      const actual = await UdimUtils.resolveUdimTilePaths(assetPathOf(layer, propPath), layer)
      expect(actual.length).toBe(expected.length)
      expect(actual).toEqual(expected.map(([p, tile]) => [path.resolve(testenv, p), tile]))
    }
    await test('/foo.udim_style_a', [['style_a.1001.exr', '1001'], ['style_a.1011.exr', '1011']])
    await test('/foo.udim_style_b', [['style_b_1002.exr', '1002'], ['style_b_1021.exr', '1021']])
    await test('/foo.udim_package', [
      ['udims.usdz[udim_tex_1001_.foo.bar.baz]', '1001'],
      ['udims.usdz[udim_tex_1002_.foo.bar.baz]', '1002'],
      ['udims.usdz[udim_tex_1003_.foo.bar.baz]', '1003'],
    ])
    await test('/foo.udim_missing', [])
  })

  // testUsdShadeUdimUtils.py:65-78 (test_ReplaceUdimPattern).
  it('test_ReplaceUdimPattern', () => {
    expect(UdimUtils.replaceUdimPattern('style_a.<UDIM>.exr', '1011')).toBe('style_a.1011.exr')
    expect(UdimUtils.replaceUdimPattern('style_b.<UDIM>.exr', '1021')).toBe('style_b.1021.exr')
    expect(UdimUtils.replaceUdimPattern('style_z.exr', '1021')).toBe('style_z.exr')
  })

  // testUsdShadeUdimUtils.py:80-96 (test_ResolveUdimPath).
  it('test_ResolveUdimPath', async () => {
    const layer = await openLayer()
    const test = async (propPath: string, value: string) => {
      expect(await UdimUtils.resolveUdimPath(assetPathOf(layer, propPath), layer))
        .toBe(value !== '' ? path.resolve(testenv, value) : value)
    }
    await test('/foo.udim_style_a', 'style_a.<UDIM>.exr')
    await test('/foo.udim_style_b', 'style_b_<UDIM>.exr')
    await test('/foo.udim_missing', '')
    await test('/foo.not_udim', '')
  })

  // testUsdShadeUdimUtils.py:80-96 (test_ResolveUdimPath) again through
  // resolveUdimPathSync, the synchronous ResolveUdimPath imaging calls
  // (usdImaging/dataSourceAttribute.cpp:56-70): the tiles resolve
  // synchronously on the filesystem here, and through the resolutions read
  // ahead when a stage prepares the layer's asset-valued attributes.
  it('test_ResolveUdimPath (resolveUdimPathSync)', async () => {
    const layer = await openLayer()
    const test = (propPath: string, value: string) => {
      expect(UdimUtils.resolveUdimPathSync(assetPathOf(layer, propPath), layer))
        .toBe(value !== '' ? path.resolve(testenv, value) : value)
    }
    test('/foo.udim_style_a', 'style_a.<UDIM>.exr')
    test('/foo.udim_style_b', 'style_b_<UDIM>.exr')
    test('/foo.udim_missing', '')
    test('/foo.not_udim', '')
  })

  // /foo.udim_package: the reference build's
  // UsdShade.UdimUtils.ResolveUdimPath(path, layer) returns '' (with the
  // "ambigious result" warning, udimUtils.cpp:146-152), as resolveUdimPath
  // does; the tiles resolve only through the asynchronous package resolver,
  // so the synchronous form reaches that result through the tiles a stage
  // reads ahead.
  it('test_ResolveUdimPath (resolveUdimPathSync, package tiles read ahead by a stage)', async () => {
    const layer = await openLayer()
    await UsdStage.open(path.join(testenv, 'layer.usda'))
    const udimPath = assetPathOf(layer, '/foo.udim_package')
    expect(await UdimUtils.resolveUdimPath(udimPath, layer)).toBe('')
    expect(UdimUtils.resolveUdimPathSync(udimPath, layer)).toBe('')
  })
})
