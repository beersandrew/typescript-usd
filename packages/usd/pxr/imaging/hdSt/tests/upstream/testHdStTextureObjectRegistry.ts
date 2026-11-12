// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp
// (OpenUSD 26.11.1), registered at pxr/imaging/hdSt/CMakeLists.txt:2936-2948
// (--offscreen; IMAGE_DIFF_COMPARE outTexture1FullRes.png,
// outTexture1LowRes.png, outTexture1Reloaded.png, outTexture2.png,
// outGrayscaleTexture.png).
//
// Divergences:
// - Texture loading is asynchronous: each Commit() is preceded by
//   `await registry.LoadAsync()`, its load phase
//   (textureObjectRegistry.ts header).
// - Dropping a shared pointer is an explicit Release() at the end of the
//   C++ scope holding it (textureObject.ts header).
// - The images go to the driver's image writer (textureTestDriver.ts).
// - Files are read through the asset resolver the caller set up (the
//   test's working directory, testenv/testHdStTextureObjectRegistry).

import { Token as TfToken } from 'typescript-usd/tf'
import {
  HgiMipFilter,
  HgiSamplerDesc,
  HgiSamplerFilter,
  type Hgi,
} from 'typescript-usd/hgi'
import { HdStTextureType } from '../../src/enums.ts'
import { HdStTextureIdentifier } from '../../src/textureIdentifier.ts'
import { HdStUvTextureObject } from '../../src/textureObject.ts'
import { HdSt_TextureObjectRegistry } from '../../src/textureObjectRegistry.ts'
import { HdSt_TextureTestDriver, type HdSt_TextureTestImage } from '../../src/textureTestDriver.ts'
import { CheckEqual, CheckEqualSet, MakeOutputTexture, TextureTestFailure } from './textureTestCommon.ts'

/** testHdStTextureObjectRegistry.cpp:24-46 My_TestGLDrawing */
export class My_TestGLDrawing {
  private _driver: HdSt_TextureTestDriver | null = null
  private _registry: HdSt_TextureObjectRegistry | null = null

  constructor(private readonly _hgi: Hgi,
    private readonly _writer: (image: HdSt_TextureTestImage) => void) {}

  /** testHdStTextureObjectRegistry.cpp:38-46 */
  initTest(): void {
    this._driver = new HdSt_TextureTestDriver(this._hgi)
    this._driver.setImageWriter(this._writer)
    this._registry = new HdSt_TextureObjectRegistry(this._driver.getResourceRegistry())
  }

  getRegistry(): HdSt_TextureObjectRegistry { return this._registry! }

  /** testHdStTextureObjectRegistry.cpp:73-280 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const registry = this._registry!
    const hgi = driver.getHgi()

    const dstTexture = MakeOutputTexture(hgi)

    // Make sampler object to use with the various input textures.
    const samplerDesc = new HgiSamplerDesc()
    samplerDesc.magFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    samplerDesc.minFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    samplerDesc.mipFilter = HgiMipFilter.HgiMipFilterLinear
    const sampler = hgi.createSampler(samplerDesc)

    const uv = (t: unknown): HdStUvTextureObject => {
      if (!(t instanceof HdStUvTextureObject)) {
        throw new TextureTestFailure('Invalid UV texture object')
      }
      return t
    }

    {
      const texture1 = registry.allocateTextureObject(
        new HdStTextureIdentifier(TfToken('texture1.png')), HdStTextureType.Uv)!

      // Check that texture gets committed
      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [texture1], 'Texture 1 not committed')

      driver.draw(dstTexture, uv(texture1).getTexture(), sampler)
      await driver.writeToFile(dstTexture, 'outTexture1FullRes.png')

      CheckEqual(registry.getTotalTextureMemory(), 349524,
        'Total texture memory wrong after first commit')

      // Garbage collect should have no effect.
      registry.garbageCollect()

      // Check that changing target memory will recommit texture and
      // down-sample it before uploading it
      texture1.setTargetMemory(4000)
      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [texture1], 'Texture 1 not recommitted')

      driver.draw(dstTexture, uv(texture1).getTexture(), sampler)
      await driver.writeToFile(dstTexture, 'outTexture1LowRes.png')

      CheckEqual(registry.getTotalTextureMemory(), 1364,
        'Total texture memory wrong after changing target memory')

      // We that we get the same handle when querrying the same texture
      // again.
      const again = registry.allocateTextureObject(
        new HdStTextureIdentifier(TfToken('texture1.png')), HdStTextureType.Uv)
      CheckEqual(again, texture1, 'Texture was not de-duplicated')
      again!.release()

      // Texture registry should have nothing to commit.
      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [], 'Unnecessary commit')

      CheckEqual(registry.getTotalTextureMemory(), 1364,
        'Total texture memory wrong after unnecessary commit')

      texture1.release()
    }

    // Texture 1 was dropped and can be garbaged collected.
    registry.garbageCollect()

    CheckEqual(registry.getTotalTextureMemory(), 0,
      'Total texture memory wrong after dropping all textures.')

    {
      const texture1 = registry.allocateTextureObject(
        new HdStTextureIdentifier(TfToken('texture1.png')), HdStTextureType.Uv)!

      // Texture 1 has to be committed again since it was garbage
      // collected. Target memory should be reset.
      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [texture1],
        'Texture 1 not committed again after it was dropped')

      driver.draw(dstTexture, uv(texture1).getTexture(), sampler)
      await driver.writeToFile(dstTexture, 'outTexture1Reloaded.png')

      // Sanity check, use a different texture.
      const texture2 = registry.allocateTextureObject(
        new HdStTextureIdentifier(TfToken('texture2.png')), HdStTextureType.Uv)!

      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [texture2], 'Texture 2 was not committed')

      driver.draw(dstTexture, uv(texture2).getTexture(), sampler)
      await driver.writeToFile(dstTexture, 'outTexture2.png')

      CheckEqual(registry.getTotalTextureMemory(), 349524 + 349524,
        'Total texture memory wrong with two textures')

      texture2.release()
      texture1.release()
    }

    // Check a grayscale texture.
    {
      const texture = registry.allocateTextureObject(
        new HdStTextureIdentifier(TfToken('grayscaleTexture.png')), HdStTextureType.Uv)!

      await registry.loadAsync()
      CheckEqualSet(registry.commit(), [texture], 'Grayscale texture not committed')

      driver.draw(dstTexture, uv(texture).getTexture(), sampler)
      await driver.writeToFile(dstTexture, 'outGrayscaleTexture.png')

      CheckEqual(registry.getTotalTextureMemory(), 349524 + 349524 + 409588,
        'Total texture memory wrong three textures')

      texture.release()
    }

    hgi.destroyTexture(dstTexture)
    hgi.destroySampler(sampler)

    // Clean-up things.
    registry.garbageCollect()

    CheckEqual(registry.getTotalTextureMemory(), 0,
      'Total texture memory wrong after final garbage collection')
  }
}

/** testHdStTextureObjectRegistry.cpp:282-301 */
export const OUTPUT_IMAGES = [
  'outTexture1FullRes.png',
  'outTexture1LowRes.png',
  'outTexture1Reloaded.png',
  'outTexture2.png',
  'outGrayscaleTexture.png',
]
export const INPUT_FILES = ['texture1.png', 'texture2.png', 'grayscaleTexture.png']
