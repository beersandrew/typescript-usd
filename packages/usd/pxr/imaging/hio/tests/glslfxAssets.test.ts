// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLVdbVolume/volumeShaderDensity.glslfx
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HioGlslfx opening glslfx files a scene ships (not plugin resources) through
// Ar, against native OpenUSD 26.11.1 (fixtures/glslfxAssets): the
// glslfx files of the testUsdImagingGLSimpleVolumes and
// testUsdImagingGLVdbVolume testenvs, and authored files with relative,
// $TOOLS and missing #imports. Natively the files are on disk; here they are
// served at an asset URL, read ahead through Ar (HioGlslfx_PrefetchAsync, or
// a UsdStage naming them in an asset-valued attribute) and then opened by the
// synchronous constructor, as the Ar adaptation in hio/src/glslfx.ts
// describes.
import { readFileSync, existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DefaultResolver as ArDefaultResolver,
  InMemoryAsset as ArInMemoryAsset,
  ResolvedPath as ArResolvedPath,
} from 'typescript-usd/ar'
import { _ArClearPrefetchedAssetsForTest, _resetResolverForTest, _setResolverForTest } from 'typescript-usd/ar/_internal'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { HioGlslfx, HioGlslfx_PrefetchAsync } from '../src/glslfx.ts'
import { HdSt_RegisterShaderResources } from '../../hdSt/src/shaderResources.ts'
import { runGlslfxCase, type GlslfxCase } from './glslfxCase.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

HdSt_RegisterShaderResources()

const native = readOracleFixture<{ cases: Array<{ case: GlslfxCase; result: any }> }>(
  new URL('./fixtures/glslfxAssets/expected.json', import.meta.url))
const sceneDir = new URL('./fixtures/glslfxAssets/scene/', import.meta.url)

// The scene directory as an asset URL, and the installed resource directory
// as the TypeScript plugins' ResourcePath (as in glslfx.test.ts).
const SCENE = 'https://assets.example/scene/'
function toTs<T>(value: T): T {
  if (typeof value === 'string') {
    return value.split('<scene>/').join(SCENE).split('<install>/lib/usd/').join('/usd/') as T
  }
  if (Array.isArray(value)) return value.map(toTs) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toTs(v)])) as T
  }
  return value
}

const extraAssets = new Map<string, string>()
const opened: string[] = []
function sceneBytes(url: string): Uint8Array | undefined {
  if (!url.startsWith(SCENE)) return undefined
  const extra = extraAssets.get(url)
  if (extra !== undefined) return new TextEncoder().encode(extra)
  const file = new URL(url.slice(SCENE.length), sceneDir)
  return existsSync(file) ? new Uint8Array(readFileSync(file)) : undefined
}

// The default resolver, plus the scene's files at SCENE, which it resolves
// and opens only asynchronously (as a browser's HTTP transport does), and
// whose relative paths it anchors as URLs.
class SceneResolver extends ArDefaultResolver {
  override createIdentifier(assetPath: string, anchor = new ArResolvedPath()) {
    return anchor.toString().startsWith(SCENE) && assetPath && !assetPath.startsWith('$')
      && !/^[a-z][a-z0-9+.-]*:|^\//i.test(assetPath)
      ? new URL(assetPath, anchor.toString()).href : super.createIdentifier(assetPath, anchor)
  }
  override async resolve(assetPath: string) {
    if (!assetPath.startsWith(SCENE)) return super.resolve(assetPath)
    return new ArResolvedPath(sceneBytes(assetPath) ? assetPath : '')
  }
  override async openAsset(resolvedPath: ArResolvedPath) {
    const path = resolvedPath.toString()
    if (!path.startsWith(SCENE)) return super.openAsset(resolvedPath)
    opened.push(path)
    const bytes = sceneBytes(path)
    return bytes ? new ArInMemoryAsset(bytes) : undefined
  }
}

beforeAll(() => { _setResolverForTest(new SceneResolver()) })
afterAll(() => { _resetResolverForTest(); _ArClearPrefetchedAssetsForTest() })
beforeEach(() => { _ArClearPrefetchedAssetsForTest(); opened.length = 0; extraAssets.clear() })

describe('HioGlslfx reads scene glslfx files through Ar as native OpenUSD 26.11.1 reads them from disk', () => {
  for (const { case: nativeCase, result: nativeResult } of native.cases) {
    it(nativeCase.name, async () => {
      const c = toTs(nativeCase)
      await HioGlslfx_PrefetchAsync(c.input)
      const readAhead = opened.length
      expect(runGlslfxCase(c)).toEqual(toTs(nativeResult))
      // The synchronous constructor did no I/O of its own.
      expect(opened.length).toBe(readAhead)
    })
  }

  it('finds a scene file nothing read ahead missing, with the native missing-file warning', () => {
    const trap = new TfDiagnosticTrap()
    try {
      const path = `${SCENE}testUsdImagingGLVdbVolume/volumeShaderDensity.glslfx`
      const glslfx = new HioGlslfx(path)
      expect(glslfx.isValid()).toBe(false)
      expect(trap.getWarnings().map(w => w.getCommentary())).toEqual([`File doesn't exist: "${path}"\n`])
      expect(opened).toEqual([])
    } finally {
      trap.clear()
      trap.dismiss()
    }
  })

  it('reads ahead the glslfx files a UsdStage names in asset-valued attributes', async () => {
    // testUsdImagingGLVdbVolume/vdbVolume.usda:19,93 author these attributes.
    extraAssets.set(`${SCENE}testUsdImagingGLVdbVolume/shaders.usda`, `#usda 1.0
def Shader "Density"
{
    uniform token info:implementationSource = "sourceAsset"
    uniform asset info:glslfx:sourceAsset = @volumeShaderDensity.glslfx@
}
def Shader "Checkerboard"
{
    uniform token info:implementationSource = "sourceAsset"
    uniform asset info:glslfx:sourceAsset = @./checkerboardShader.glslfx@
}
`)
    const stage = (await UsdStage.open(`${SCENE}testUsdImagingGLVdbVolume/shaders.usda`))!
    for (const [prim, name] of [['/Density', 'volumeShaderDensity'], ['/Checkerboard', 'checkerboardShader']] as const) {
      const asset = stage.getPrim(prim)!.getAttr('info:glslfx:sourceAsset')!.getValue() as { getResolvedPath(): string }
      const resolvedPath = asset.getResolvedPath()
      expect(resolvedPath).toBe(`${SCENE}testUsdImagingGLVdbVolume/${name}.glslfx`)
      const expected = native.cases.find(c => c.case.name === `testUsdImagingGLVdbVolume/${name}.glslfx`)!
      const c = toTs(expected.case)
      expect(runGlslfxCase(c)).toEqual(toTs(expected.result))
    }
  })
})
