// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The pixel decoding of Hio_StbImage (stbImage.ts, stbImage.cpp:400-460's
// stbi_load_from_memory / stbi_loadf_from_memory with req_comp 0): a pure
// function of the file bytes and extension, so it can run on a worker
// (stbImageDecodePool.ts). The routes per format are described in
// stbImage.ts's header. No imports beyond the decoders, so the worker module
// stays small.

import { _decodeRadianceHdr } from './hdrImage.ts'
import { ExrError } from './openexrCoreCoding.ts'
import { nanoexr_read_exr } from './openexrNanoexr.ts'
import { stbi_load_from_memory } from './stbImageDecode.ts'

/** Decoded pixels: stb's packed rows, top row first, `channels` components
 *  of the output type each. */
export interface Hio_StbDecoded {
  width: number
  height: number
  channels: number
  data: Uint8Array
}

/** Decodes `bytes` as stbi_load_from_memory / stbi_loadf_from_memory with
 *  req_comp 0 would (see stbImage.ts's header for the routes). `warn`
 *  receives the messages to report (called on the decoding thread; the pool
 *  reports them on the page's). */
export async function Hio_StbDecodePixels(bytes: Uint8Array, ext: string, warn: (message: string) => void): Promise<Hio_StbDecoded | null> {
  if (ext === 'hdr') {
    // stbi_loadf on a Radiance file yields three float channels.
    const img = _decodeRadianceHdr(bytes)
    const src = img.data as Float32Array
    const out = new Float32Array(img.width * img.height * 3)
    for (let i = 0; i < img.width * img.height; i++) {
      out[3 * i] = src[4 * i]!
      out[3 * i + 1] = src[4 * i + 1]!
      out[3 * i + 2] = src[4 * i + 2]!
    }
    return { width: img.width, height: img.height, channels: 3, data: new Uint8Array(out.buffer) }
  }
  // stbi_load_from_memory (stbImage.cpp:454-456). Upstream a file stb cannot
  // read fails without a message of its own (stbi_info_from_memory returns
  // 0, :383-386); data for a stb decoder that is not ported is reported.
  return stbi_load_from_memory(bytes, reason => {
    if (reason.endsWith('not ported')) warn(`Hio_StbImage: ${reason}`)
  })
}

/** The pixels of Hio_OpenEXRImage (openexrHioImage.ts): nanoexr_read_exr's
 *  image, or its result code (exrErrorCode, 0 for success, with no data
 *  when nanoexr read nothing). */
export interface Hio_OpenEXRDecoded {
  exrErrorCode: number
  message: string
  width: number
  height: number
  channelCount: number
  pixelType: number
  data: Uint8Array | null
}

/** nanoexr_read_exr(bytes, layerName null, channels, part, mip)
 *  (openexrNanoexr.ts), as Hio_OpenEXRImage::ReadCropped calls it
 *  (OpenEXRImage.cpp:367-381). A pure function of its arguments, so it can
 *  run on a worker. */
export async function Hio_OpenEXRDecodePixels(bytes: Uint8Array, channels: number, part: number,
  mip: number): Promise<Hio_OpenEXRDecoded> {
  try {
    const img = await nanoexr_read_exr(bytes, null, channels, part, mip)
    if (!img) return { exrErrorCode: 0, message: '', width: 0, height: 0, channelCount: 0, pixelType: 0, data: null }
    return { exrErrorCode: 0, message: '', width: img.width, height: img.height,
      channelCount: img.channelCount, pixelType: img.pixelType, data: img.data }
  } catch (error) {
    if (!(error instanceof ExrError)) throw error
    return { exrErrorCode: error.code, message: error.message, width: 0, height: 0, channelCount: 0, pixelType: 0, data: null }
  }
}
