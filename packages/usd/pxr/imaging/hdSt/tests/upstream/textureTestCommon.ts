// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStDynamicUvTexture.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSamplerObjectRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Shared pieces of the ported Storm texture image tests
// (pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp,
// testHdStTextureHandleRegistry.cpp, testHdStSamplerObjectRegistry.cpp,
// testHdStDynamicUvTexture.cpp): the output texture each OffscreenTest
// creates first and the _CheckEqual helpers. Upstream's _CheckEqual prints
// the message and exits with EXIT_FAILURE; here it throws.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiFormat,
  HgiGetDataSize,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  type Hgi,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'

/** HdSt_UnitTestGLDrawing's default window size
 *  (pxr/imaging/hdSt/unitTestGLDrawing.cpp:193). */
export const TEST_WIDTH = 640
export const TEST_HEIGHT = 480

/** testHdStTextureObjectRegistry.cpp:76-104 (and the same preamble in the
 *  other texture tests): the output texture, filled with dark gray. */
export function MakeOutputTexture(hgi: Hgi, width = TEST_WIDTH, height = TEST_HEIGHT): HgiTextureHandle {
  // Make output texture
  const texDesc = new HgiTextureDesc()
  texDesc.debugName = 'Output My_TestGLDrawing'
  texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
  texDesc.type = HgiTextureType.HgiTextureType2D
  texDesc.dimensions = new GfVec3i(width, height, 1)
  texDesc.layerCount = 1
  texDesc.format = HgiFormat.HgiFormatFloat32Vec4
  texDesc.mipLevels = 1
  texDesc.pixelsByteSize = HgiGetDataSize(texDesc.format, texDesc.dimensions)

  // Fill output texture with dark gray
  const initialData = new Float32Array(width * height * 4)
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      initialData[width * 4 * i + 4 * j + 0] = 0.1
      initialData[width * 4 * i + 4 * j + 1] = 0.1
      initialData[width * 4 * i + 4 * j + 2] = 0.1
      initialData[width * 4 * i + 4 * j + 3] = 1.0
    }
  }
  texDesc.initialData = initialData

  return hgi.createTexture(texDesc)
}

export class TextureTestFailure extends Error {}

/** _CheckEqual(const T &a, const T &b, const char *msg) */
export function CheckEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new TextureTestFailure(`${msg} (values: ${String(a)} ${String(b)})`)
  }
}

/** _CheckEqual of two std::set's (element-wise equality). */
export function CheckEqualSet<T>(a: ReadonlySet<T>, b: readonly T[], msg: string): void {
  const expected = new Set(b)
  if (a.size !== expected.size || [...a].some((x) => !expected.has(x))) {
    throw new TextureTestFailure(msg)
  }
}
