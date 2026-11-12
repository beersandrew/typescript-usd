// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStSamplerObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStSamplerObjectRegistry.cpp
// (OpenUSD 26.11.1), registered at pxr/imaging/hdSt/CMakeLists.txt:2897-2908
// (--offscreen; IMAGE_DIFF_COMPARE outSampler1.png, outSampler2.png,
// outHiResSampler.png).
//
// Divergences: texture loading is asynchronous (each Commit() is preceded
// by `await LoadAsync()`); dropping a shared pointer is an explicit
// Release() (samplerObject.ts, textureObject.ts headers).

import { Token as TfToken } from 'typescript-usd/tf'
import {
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
} from 'typescript-usd/hd'
import type { Hgi } from 'typescript-usd/hgi'
import { HdStTextureType } from '../../src/enums.ts'
import { HdStUvSamplerObject } from '../../src/samplerObject.ts'
import { HdSt_SamplerObjectRegistry } from '../../src/samplerObjectRegistry.ts'
import { HdStTextureIdentifier } from '../../src/textureIdentifier.ts'
import { HdStUvTextureObject } from '../../src/textureObject.ts'
import { HdSt_TextureObjectRegistry } from '../../src/textureObjectRegistry.ts'
import { HdSt_TextureTestDriver, type HdSt_TextureTestImage } from '../../src/textureTestDriver.ts'
import { MakeOutputTexture, TextureTestFailure } from './textureTestCommon.ts'

/** testHdStSamplerObjectRegistry.cpp:26-55 My_TestGLDrawing */
export class My_TestGLDrawing {
  private _driver: HdSt_TextureTestDriver | null = null
  private _textureRegistry: HdSt_TextureObjectRegistry | null = null
  private _samplerRegistry: HdSt_SamplerObjectRegistry | null = null

  constructor(private readonly _hgi: Hgi,
    private readonly _writer: (image: HdSt_TextureTestImage) => void) {}

  /** testHdStSamplerObjectRegistry.cpp:44-55 */
  initTest(): void {
    this._driver = new HdSt_TextureTestDriver(this._hgi)
    this._driver.setImageWriter(this._writer)
    this._textureRegistry =
      new HdSt_TextureObjectRegistry(this._driver.getResourceRegistry())
    this._samplerRegistry =
      new HdSt_SamplerObjectRegistry(this._driver.getResourceRegistry())
  }

  /** testHdStSamplerObjectRegistry.cpp:72-229 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const textureRegistry = this._textureRegistry!
    const samplerRegistry = this._samplerRegistry!
    const hgi = driver.getHgi()

    hgi.startFrame()

    const dstTexture = MakeOutputTexture(hgi)

    const texture = textureRegistry.allocateTextureObject(
      new HdStTextureIdentifier(TfToken('texture.png')), HdStTextureType.Uv)!

    // Call Commit on both registries to ensure that the shared HgiBlitCmds
    // is submitted in the resource registry.
    await textureRegistry.loadAsync()
    textureRegistry.commit()

    const uv = (t: unknown): HdStUvTextureObject => {
      if (!(t instanceof HdStUvTextureObject)) {
        throw new TextureTestFailure('Invalid UV texture object')
      }
      return t
    }
    const uvSampler = (s: unknown): HdStUvSamplerObject => {
      if (!(s instanceof HdStUvSamplerObject)) {
        throw new TextureTestFailure('Invalid UV sampler object')
      }
      return s
    }

    {
      const sampler1 = samplerRegistry.allocateSampler(
        texture,
        new HdSamplerParameters(
          HdWrap.HdWrapRepeat,
          HdWrap.HdWrapMirror,
          HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterNearest,
          HdMagFilter.HdMagFilterNearest))!

      driver.draw(dstTexture, uv(texture).getTexture(), uvSampler(sampler1).getSampler())
      await driver.writeToFile(dstTexture, 'outSampler1.png')

      sampler1.release()
    }
    samplerRegistry.markGarbageCollectionNeeded()

    // Should garbage collect above sampler handle.
    samplerRegistry.garbageCollect()

    // Ensure Hgi's internal garbage collector runs to destroy gpu resources.
    hgi.endFrame()

    hgi.startFrame()
    const sampler2 = samplerRegistry.allocateSampler(
      texture,
      new HdSamplerParameters(
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapClamp,
        HdWrap.HdWrapMirror,
        HdMinFilter.HdMinFilterLinearMipmapLinear,
        HdMagFilter.HdMagFilterNearest))!
    {
      driver.draw(dstTexture, uv(texture).getTexture(), uvSampler(sampler2).getSampler())
      await driver.writeToFile(dstTexture, 'outSampler2.png')
    }

    // Use a high res texture to see whether mipmaps are generated and used.
    const hiResTexture = textureRegistry.allocateTextureObject(
      new HdStTextureIdentifier(TfToken('hiResTexture.png')), HdStTextureType.Uv)!

    // Call Commit on both registries to ensure that the shared HgiBlitCmds
    // is submitted in the resource registry.
    await textureRegistry.loadAsync()
    textureRegistry.commit()

    const hiResSampler = samplerRegistry.allocateSampler(
      texture,
      new HdSamplerParameters(
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapClamp,
        HdWrap.HdWrapMirror,
        HdMinFilter.HdMinFilterLinearMipmapLinear,
        HdMagFilter.HdMagFilterNearest))!

    {
      driver.draw(dstTexture, uv(hiResTexture).getTexture(), uvSampler(hiResSampler).getSampler())
      await driver.writeToFile(dstTexture, 'outHiResSampler.png')
    }

    hgi.destroyTexture(dstTexture)

    hgi.endFrame()
  }
}

export const OUTPUT_IMAGES = ['outSampler1.png', 'outSampler2.png', 'outHiResSampler.png']
export const INPUT_FILES = ['texture.png', 'hiResTexture.png']
