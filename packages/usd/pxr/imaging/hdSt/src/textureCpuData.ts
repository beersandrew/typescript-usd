// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureCpuData.cpp,
//  pxr/imaging/hdSt/textureCpuData.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureCpuData.{h,cpp} (OpenUSD 26.11.1).

import type { HgiTextureDesc } from 'typescript-usd/hgi'

/** textureCpuData.h:17-39. Represents CPU data that can be stored in a
 *  HdStUvTextureObject, mostly, likely during the load phase to be committed
 *  to the GPU. */
export interface HdStTextureCpuData {
  /** textureCpuData.h:26-28. The metadata of the texture (width, height,
   *  ...) including the CPU data (as initialData). */
  getTextureDesc(): HgiTextureDesc

  /** textureCpuData.h:30-33. Make GPU generate mipmaps. The number of
   *  mipmaps is specified in the texture descriptor and the mipmaps are
   *  generate from the mip level 0 data. */
  getGenerateMipmaps(): boolean

  /** textureCpuData.h:35-36. Are the data valid (e.g., false if file could
   *  not be found). */
  isValid(): boolean
}
