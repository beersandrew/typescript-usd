// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderer.cpp,
//  pxr/imaging/hd/renderer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderer.{h,cpp} (OpenUSD 26.11.1).

import type { HdLegacyRenderControlInterface } from './legacyRenderControlInterface.ts'

/**
 * renderer.h:17-36. A Hydra 2.0 renderer, created by HdRendererPlugin::
 * CreateRenderer from a (typically terminal) scene index.
 */
export abstract class HdRenderer {
  /** renderer.cpp:13-17 */
  getLegacyRenderControl(): HdLegacyRenderControlInterface | null {
    return null
  }

  /** JavaScript lifecycle counterpart of the virtual destructor
   *  (renderer.h:32, renderer.cpp:11). HdPluginRendererUniqueHandle calls it
   *  when it drops the renderer. The base implementation does nothing. */
  destroy(): void {}
}
