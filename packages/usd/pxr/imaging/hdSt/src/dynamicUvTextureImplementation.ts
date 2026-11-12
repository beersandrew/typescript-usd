// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/dynamicUvTextureImplementation.h,
//  pxr/imaging/hdSt/textureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/dynamicUvTextureImplementation.h
// (OpenUSD 26.11.1).
//
// Divergence: Load may return a promise. Upstream calls it on a worker
// thread during the load phase of the texture system
// (textureObjectRegistry.cpp:238-243); HdSt_TextureObjectRegistry.LoadAsync
// awaits it.

import type { HdStDynamicUvTextureObject } from './dynamicUvTextureObject.ts'

/** dynamicUvTextureImplementation.h:17-39. Allows external clients to
 *  specify how a UV texture is loaded from, e.g., a file and how it is
 *  committed to the GPU. */
export interface HdStDynamicUvTextureImplementation {
  /** dynamicUvTextureImplementation.h:23-28. Called during the load phase
   *  of the Storm texture system when a texture file is supposed to be
   *  loaded to the CPU. */
  Load(textureObject: HdStDynamicUvTextureObject): void | Promise<void>

  /** dynamicUvTextureImplementation.h:30-32. Called during the commit phase
   *  of the Storm texture system when the CPU texture is committed to the
   *  GPU. */
  commit(textureObject: HdStDynamicUvTextureObject): void

  /** dynamicUvTextureImplementation.h:34-36. Queried by, e.g., the material
   *  system to determine whether to use, e.g., the fallback value of a
   *  texture node. */
  isValid(textureObject: HdStDynamicUvTextureObject): boolean
}
