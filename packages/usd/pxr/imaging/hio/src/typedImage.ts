// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Float pixel storage produced by the Radiance HDR decoder (stb_image's HDR
// path, pxr/imaging/hio/stbImage.cpp) before Hio_StbImage copies it into a
// HioImageStorageSpec.
export interface HioTypedImage {
  storage: 'typed'
  data: Uint16Array<ArrayBuffer> | Float32Array<ArrayBuffer>
  width: number
  height: number
  format: 'float16vec4' | 'float32vec4'
  bytesPerRow: number
  isColorSpaceSRGB: false
}
