// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStDynamicUvTexture.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStDynamicUvTexture.cpp
// (OpenUSD 26.11.1), registered at pxr/imaging/hdSt/CMakeLists.txt:2479-2490
// (--offscreen; IMAGE_DIFF_COMPARE outTextureDarkBlue.png,
// outTextureLightBlue.png).
//
// Divergences: texture loading is asynchronous (Commit() is preceded by
// `await LoadAsync()`); C++ subclassing of HdStTextureCpuData /
// HdStDynamicUvSubtextureIdentifier / HdStDynamicUvTextureImplementation
// is TypeScript subclassing / interface implementation.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { Token as TfToken } from 'typescript-usd/tf'
import {
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
} from 'typescript-usd/hd'
import {
  HgiFormat,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  type Hgi,
} from 'typescript-usd/hgi'
import type { HdStDynamicUvTextureImplementation } from '../../src/dynamicUvTextureImplementation.ts'
import type { HdStDynamicUvTextureObject } from '../../src/dynamicUvTextureObject.ts'
import { HdStTextureType } from '../../src/enums.ts'
import { HdSt_MaterialNetworkShader } from '../../src/materialNetworkShader.ts'
import { HdStUvSamplerObject } from '../../src/samplerObject.ts'
import {
  HdStDynamicUvSubtextureIdentifier,
  type HdStSubtextureIdentifier,
  type HdStSubtextureIdentifierID,
} from '../../src/subtextureIdentifier.ts'
import type { HdStTextureCpuData } from '../../src/textureCpuData.ts'
import { HdSt_TextureHandleRegistry } from '../../src/textureHandleRegistry.ts'
import { HdStTextureIdentifier } from '../../src/textureIdentifier.ts'
import { HdStUvTextureObject } from '../../src/textureObject.ts'
import { HdSt_TextureTestDriver, type HdSt_TextureTestImage } from '../../src/textureTestDriver.ts'
import { CheckEqualSet, MakeOutputTexture, TextureTestFailure } from './textureTestCommon.ts'

/** testHdStDynamicUvTexture.cpp:69-114. A class to store CPU data between
 *  loading the texture data and uploading them to the GPU. This example is
 *  generating a red-green gradient with a fixed blue value. */
class My_TextureCpuData implements HdStTextureCpuData {
  // The descriptor containing a pointer to the data.
  private readonly _desc = new HgiTextureDesc()
  // Owns the texture data.
  private readonly _data: Uint8Array

  constructor(blue: number) {
    // Data are stored and owned by a Uint8Array in this example.
    this._data = new Uint8Array(256 * 256 * 4)
    for (let i = 0; i < 256; i++) {
      for (let j = 0; j < 256; j++) {
        this._data[256 * 4 * i + 4 * j + 0] = i
        this._data[256 * 4 * i + 4 * j + 1] = j
        this._data[256 * 4 * i + 4 * j + 2] = blue
        this._data[256 * 4 * i + 4 * j + 3] = 255
      }
    }

    this._desc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
    this._desc.format = HgiFormat.HgiFormatUNorm8Vec4
    this._desc.type = HgiTextureType.HgiTextureType2D
    this._desc.dimensions = new GfVec3i(256, 256, 1)
    this._desc.pixelsByteSize = this._data.length

    // Pointer to the above data is in the texture descriptor.
    this._desc.initialData = this._data
  }

  // Descriptor used to upload data to GPU.
  getTextureDesc(): HgiTextureDesc { return this._desc }
  getGenerateMipmaps(): boolean { return false }
  isValid(): boolean { return true }
}

/** testHdStDynamicUvTexture.cpp:116-145. Our own subtexture identifier that
 *  simply contains one value for the blue component. */
class My_SubtextureIdentifier extends HdStDynamicUvSubtextureIdentifier {
  constructor(private readonly _blue: number) {
    super()
  }

  override Clone(): HdStSubtextureIdentifier {
    return new My_SubtextureIdentifier(this._blue)
  }

  // The data of the subtexture identifier.
  getBlue(): number { return this._blue }

  // What implements the loading of the texture identified by this
  // subtexture identifier.
  override getTextureImplementation(): HdStDynamicUvTextureImplementation {
    return _impl
  }

  // Hash (size_t of an unsigned char).
  protected override _hash(): HdStSubtextureIdentifierID {
    return BigInt(this._blue)
  }
}

/** testHdStDynamicUvTexture.cpp:147-195. Implements loading a texture
 *  identified by our subtexture identifier. */
class My_DynamicUvTextureImplementation implements HdStDynamicUvTextureImplementation {
  Load(texture: HdStDynamicUvTextureObject): void {
    // Get the subtexture identifier.
    const subId = texture.GetTextureIdentifier().getSubtextureIdentifier()
    if (!(subId instanceof My_SubtextureIdentifier)) {
      return
    }

    // Ignore file name of texture identifier, just use data
    // from subidentifier.
    const blue = subId.getBlue()

    // Allocate CPU data.
    texture.setCpuData(new My_TextureCpuData(blue))
  }

  commit(texture: HdStDynamicUvTextureObject): void {
    // Destroy old GPU texture.
    texture.destroyTexture()

    // Upload CPU data to GPU.
    const cpuData = texture.getCpuData()
    if (cpuData) {
      if (cpuData.isValid()) {
        texture.createTexture(cpuData.getTextureDesc())
        if (cpuData.getGenerateMipmaps()) {
          texture.generateMipmaps()
        }
      }
    }

    // Delete CPU data.
    texture.setCpuData(null)
  }

  isValid(texture: HdStDynamicUvTextureObject): boolean {
    return texture.getTexture().isSet()
  }
}

// Use implementation as singleton.
const _impl = new My_DynamicUvTextureImplementation()

/** testHdStDynamicUvTexture.cpp:31-52 My_TestGLDrawing */
export class My_TestGLDrawing {
  private _driver: HdSt_TextureTestDriver | null = null
  private _textureHandleRegistry: HdSt_TextureHandleRegistry | null = null

  constructor(private readonly _hgi: Hgi,
    private readonly _writer: (image: HdSt_TextureTestImage) => void) {}

  /** testHdStDynamicUvTexture.cpp:44-52 */
  initTest(): void {
    this._driver = new HdSt_TextureTestDriver(this._hgi)
    this._driver.setImageWriter(this._writer)
    this._textureHandleRegistry =
      new HdSt_TextureHandleRegistry(this._driver.getResourceRegistry())
  }

  /** testHdStDynamicUvTexture.cpp:204-324 */
  async offscreenTest(): Promise<void> {
    const driver = this._driver!
    const registry = this._textureHandleRegistry!
    const hgi = driver.getHgi()

    const dstTexture = MakeOutputTexture(hgi)

    const shader = new HdSt_MaterialNetworkShader()

    // Create texture handle using our own subtexture identifier.
    // Low blue component.
    const textureHandle1 = registry.allocateTextureHandle(
      new HdStTextureIdentifier(TfToken(), new My_SubtextureIdentifier(90)),
      HdStTextureType.Uv,
      new HdSamplerParameters(
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapClamp,
        HdMinFilter.HdMinFilterNearest,
        HdMagFilter.HdMagFilterNearest),
      /* memoryRequest = */ 2000,
      shader)!

    // High blue component.
    const textureHandle2 = registry.allocateTextureHandle(
      new HdStTextureIdentifier(TfToken(), new My_SubtextureIdentifier(230)),
      HdStTextureType.Uv,
      new HdSamplerParameters(
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapRepeat,
        HdWrap.HdWrapClamp,
        HdMinFilter.HdMinFilterNearest,
        HdMagFilter.HdMagFilterNearest),
      /* memoryRequest = */ 2000,
      shader)!

    // Shader needs to be updated since the texture handle
    // was committed for the first time.
    await registry.loadAsync()
    CheckEqualSet(registry.commit(), [shader], 'Expected shader1 from first commit')

    for (const [handle, filename] of [
      [textureHandle1, 'outTextureDarkBlue.png'],
      [textureHandle2, 'outTextureLightBlue.png']] as const) {
      const uvTextureObject = handle.getTextureObject()
      if (!(uvTextureObject instanceof HdStUvTextureObject)) {
        throw new TextureTestFailure('Invalid UV texture object')
      }
      const uvSamplerObject = handle.getSamplerObject()
      if (!(uvSamplerObject instanceof HdStUvSamplerObject)) {
        throw new TextureTestFailure('Invalid UV sampler object')
      }
      driver.draw(dstTexture, uvTextureObject.getTexture(), uvSamplerObject.getSampler())
      await driver.writeToFile(dstTexture, filename)
    }

    hgi.destroyTexture(dstTexture)
  }
}

export const OUTPUT_IMAGES = ['outTextureDarkBlue.png', 'outTextureLightBlue.png']
export const INPUT_FILES: string[] = []
