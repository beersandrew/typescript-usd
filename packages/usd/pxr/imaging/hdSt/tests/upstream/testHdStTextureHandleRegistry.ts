// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp
// (OpenUSD 26.11.1), registered at pxr/imaging/hdSt/CMakeLists.txt:2918-2934
// (--offscreen; IMAGE_DIFF_COMPARE outTextureBasic.png,
// outTextureSampler1LowRes.png, outTextureSampler1.png,
// outTextureSampler2.png, outTextureBeforeFileChange.png,
// outTextureAfterFileChange.png, outTextureAfterReload.png,
// outTextureWithLowGlobalMemoryRequest.png,
// outTextureWithHighGlobalMemoryRequest.png).
//
// Divergences:
// - Texture loading is asynchronous: each Commit() is preceded by
//   `await registry.LoadAsync()` (textureHandleRegistry.ts header).
// - Dropping a shared pointer is an explicit Release() (texture handles)
//   or setting `_expired` (shader code) at the end of the C++ scope holding
//   it (textureHandle.ts, shaderCode.ts headers).
// - The file change on disk (TfDeleteFile + copy,
//   testHdStTextureHandleRegistry.cpp:381-387) goes through the
//   `replaceFile` callback the caller gives, which updates what the asset
//   resolver serves.

import { Token as TfToken } from 'typescript-usd/tf'
import {
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
} from 'typescript-usd/hd'
import type { Hgi } from 'typescript-usd/hgi'
import { HdStTextureType } from '../../src/enums.ts'
import { HdSt_MaterialNetworkShader } from '../../src/materialNetworkShader.ts'
import { HdStUvSamplerObject } from '../../src/samplerObject.ts'
import type { HdStTextureHandle } from '../../src/textureHandle.ts'
import { HdSt_TextureHandleRegistry } from '../../src/textureHandleRegistry.ts'
import { HdStTextureIdentifier } from '../../src/textureIdentifier.ts'
import { HdStUvTextureObject } from '../../src/textureObject.ts'
import { HdSt_TextureTestDriver, type HdSt_TextureTestImage } from '../../src/textureTestDriver.ts'
import { CheckEqual, CheckEqualSet, MakeOutputTexture, TextureTestFailure } from './textureTestCommon.ts'

/** testHdStTextureHandleRegistry.cpp:31-52 My_TestGLDrawing */
export class My_TestGLDrawing {
  private _driver: HdSt_TextureTestDriver | null = null
  private _textureHandleRegistry: HdSt_TextureHandleRegistry | null = null

  constructor(private readonly _hgi: Hgi,
    private readonly _writer: (image: HdSt_TextureTestImage) => void,
    private readonly _replaceFile: (dst: string, src: string) => void) {}

  /** testHdStTextureHandleRegistry.cpp:44-52 */
  initTest(): void {
    this._driver = new HdSt_TextureTestDriver(this._hgi)
    this._driver.setImageWriter(this._writer)
    this._textureHandleRegistry =
      new HdSt_TextureHandleRegistry(this._driver.getResourceRegistry())
  }

  /** Draws the texture and sampler of `handle` and writes `filename`
   *  (the block repeated after every commit in the upstream test). */
  private async _drawHandle(dstTexture: Parameters<HdSt_TextureTestDriver['draw']>[0],
    handle: HdStTextureHandle, filename: string): Promise<void> {
    const uvTextureObject = handle.getTextureObject()
    if (!(uvTextureObject instanceof HdStUvTextureObject)) {
      throw new TextureTestFailure('Invalid UV texture object')
    }
    const uvSamplerObject = handle.getSamplerObject()
    if (!(uvSamplerObject instanceof HdStUvSamplerObject)) {
      throw new TextureTestFailure('Invalid UV sampler object')
    }
    this._driver!.draw(dstTexture, uvTextureObject.getTexture(), uvSamplerObject.getSampler())
    await this._driver!.writeToFile(dstTexture, filename)
  }

  /** Commit() with its load phase first (see the header). */
  private async _commit() {
    await this._textureHandleRegistry!.loadAsync()
    return this._textureHandleRegistry!.commit()
  }

  /** testHdStTextureHandleRegistry.cpp:70-496 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const registry = this._textureHandleRegistry!
    const hgi = driver.getHgi()

    hgi.startFrame()

    const dstTexture = MakeOutputTexture(hgi)

    const shader1 = new HdSt_MaterialNetworkShader()
    {
      // Basic test, create a handle and drop it.
      const textureHandle = registry.allocateTextureHandle(
        new HdStTextureIdentifier(TfToken('texture.png')),
        HdStTextureType.Uv,
        new HdSamplerParameters(
          HdWrap.HdWrapRepeat,
          HdWrap.HdWrapMirror,
          HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          HdMagFilter.HdMagFilterNearest),
        /* memoryRequest = */ 2000,
        shader1)!

      // Shader1 needs to be updated since the texture handle
      // was committed for the first time.
      CheckEqualSet(await this._commit(), [shader1], 'Expected shader1 from first commit')

      await this._drawHandle(dstTexture, textureHandle, 'outTextureBasic.png')

      textureHandle.release()
    }

    // Texture was dropped, check that shader gets notified.
    CheckEqualSet(await this._commit(), [shader1],
      'Expected shader1 from commit after texture was dropped')

    // Ensure Hgi's internal garbage collector runs to destroy gpu resources.
    hgi.endFrame()

    // Calling commit again should do nothing
    CheckEqualSet(await this._commit(), [], 'Expected no shaders')

    hgi.startFrame()

    {
      // Allocated two textures to the same handle.

      // Start with one.
      const textureHandle1 = registry.allocateTextureHandle(
        new HdStTextureIdentifier(TfToken('texture.png')),
        HdStTextureType.Uv,
        new HdSamplerParameters(
          HdWrap.HdWrapRepeat,
          HdWrap.HdWrapMirror,
          HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          HdMagFilter.HdMagFilterNearest),
        /* memoryRequest = */ 100,
        shader1)!

      CheckEqualSet(await this._commit(), [shader1], 'Expected shader1 from re-commit')

      // Check that target memory was correctly computed.
      CheckEqual(textureHandle1.getTextureObject().getTargetMemory(), 100,
        'Expected target memory 100')

      // Let's draw it.
      await this._drawHandle(dstTexture, textureHandle1, 'outTextureSampler1LowRes.png')

      {
        // Now allocate a second shader requesting a second
        // texture handle to the same texture.
        const shader2 = new HdSt_MaterialNetworkShader()

        const textureHandle2 = registry.allocateTextureHandle(
          new HdStTextureIdentifier(TfToken('texture.png')),
          HdStTextureType.Uv,
          new HdSamplerParameters(
            HdWrap.HdWrapRepeat,
            HdWrap.HdWrapRepeat,
            HdWrap.HdWrapClamp,
            HdMinFilter.HdMinFilterLinearMipmapLinear,
            HdMagFilter.HdMagFilterNearest),
          /* memoryRequest = */ 10000,
          shader2)!

        // The target memory changed and thus the underlying texture.
        // Both shaders need to be updated.
        CheckEqualSet(await this._commit(), [shader1, shader2],
          'Expected shader1 and shader2 from re-commit')

        // The underlying texture should be de-duplicated
        CheckEqual(textureHandle1.getTextureObject(), textureHandle2.getTextureObject(),
          'Texture object not deduplicated.')

        // The target memory should be max of the above two requests.
        CheckEqual(textureHandle1.getTextureObject().getTargetMemory(), 10000,
          'Expected target memory 10000')

        // Redraw handle1, we should get a new texture sampler handle
        // to the texture which has now been loaded at a much better
        // resolution.
        await this._drawHandle(dstTexture, textureHandle1, 'outTextureSampler1.png')

        await this._drawHandle(dstTexture, textureHandle2, 'outTextureSampler2.png')

        textureHandle2.release()
        shader2._expired = true
      }

      // Target memory changed, all shaders need to be updated,
      // except that shader2 no longer exists.
      CheckEqualSet(await this._commit(), [shader1],
        'Expected shader1 after shader2 was dropped')

      // Target memory should go back.
      CheckEqual(textureHandle1.getTextureObject().getTargetMemory(), 100,
        'Expected target memory to be back at 100')

      textureHandle1.release()
    }

    CheckEqualSet(await this._commit(), [shader1], 'Expected shader1 after it dropped texture')

    {
      // Test reloading
      const shader = new HdSt_MaterialNetworkShader()

      const textureHandle = registry.allocateTextureHandle(
        new HdStTextureIdentifier(TfToken('reloadingTexture.png')),
        HdStTextureType.Uv,
        new HdSamplerParameters(
          HdWrap.HdWrapRepeat,
          HdWrap.HdWrapMirror,
          HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          HdMagFilter.HdMagFilterLinear),
        /* memoryRequest = */ 0,
        shader)!

      CheckEqualSet(await this._commit(), [shader], 'Exepected shader from commit')

      await this._drawHandle(dstTexture, textureHandle, 'outTextureBeforeFileChange.png')

      // TfDeleteFile("reloadingTexture.png") and copy reloadingTexture2.png
      // over it (see the header).
      this._replaceFile('reloadingTexture.png', 'reloadingTexture2.png')

      CheckEqualSet(await this._commit(), [], 'Expected no commits before reloading')

      await this._drawHandle(dstTexture, textureHandle, 'outTextureAfterFileChange.png')

      const reg = registry.getTextureObjectRegistry()
      reg.markTextureFilePathDirty(TfToken('reloadingTexture.png'))

      CheckEqualSet(await this._commit(), [shader],
        'Exepected shader from commit after reloading')

      await this._drawHandle(dstTexture, textureHandle, 'outTextureAfterReload.png')

      textureHandle.release()
      shader._expired = true
    }

    {
      // Test reloading
      const shader = new HdSt_MaterialNetworkShader()

      const textureHandle = registry.allocateTextureHandle(
        new HdStTextureIdentifier(TfToken('texture.png')),
        HdStTextureType.Uv,
        new HdSamplerParameters(
          HdWrap.HdWrapRepeat,
          HdWrap.HdWrapMirror,
          HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          HdMagFilter.HdMagFilterNearest),
        /* memoryRequest = */ 0,
        shader)!

      registry.setMemoryRequestForTextureType(HdStTextureType.Uv, 3000)

      CheckEqualSet(await this._commit(), [shader],
        'Exepected shader from commit with low global memory request')

      await this._drawHandle(dstTexture, textureHandle,
        'outTextureWithLowGlobalMemoryRequest.png')

      registry.setMemoryRequestForTextureType(HdStTextureType.Uv, 15000)

      CheckEqualSet(await this._commit(), [shader],
        'Exepected shader from commit with high global memory request')

      await this._drawHandle(dstTexture, textureHandle,
        'outTextureWithHighGlobalMemoryRequest.png')

      textureHandle.release()
      shader._expired = true
    }

    hgi.destroyTexture(dstTexture)

    hgi.endFrame()
  }
}

export const OUTPUT_IMAGES = [
  'outTextureBasic.png',
  'outTextureSampler1LowRes.png',
  'outTextureSampler1.png',
  'outTextureSampler2.png',
  'outTextureBeforeFileChange.png',
  'outTextureAfterFileChange.png',
  'outTextureAfterReload.png',
  'outTextureWithLowGlobalMemoryRequest.png',
  'outTextureWithHighGlobalMemoryRequest.png',
]
export const INPUT_FILES = ['texture.png', 'reloadingTexture.png', 'reloadingTexture2.png']
