// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rendererPluginHandle.cpp,
//  pxr/imaging/hd/rendererPluginHandle.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/rendererPluginHandle.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: C++ copy/move construction and destruction adjust the plugin's
// reference count with the registry. JavaScript has neither copy
// constructors nor destructors, so:
// - Copy() is the copy constructor (rendererPluginHandle.cpp:16-23);
// - Reset() is operator=(nullptr) / the destructor
//   (rendererPluginHandle.cpp:32-35, 62-67): it releases the reference;
// - IsValid() is `explicit operator bool`.
// Passing a handle object around shares it (like a C++ move); a holder that
// is done with a handle calls Reset().

import type { HdRendererPlugin } from './rendererPlugin.ts'
import { HdRendererPluginRegistry } from './rendererPluginRegistry.ts'

/**
 * rendererPluginHandle.h:23-71. A handle for HdRendererPlugin also storing the
 * plugin id.
 *
 * Alleviates the need to ever call, e.g., ReleasePlugin since it
 * automatically decreases and increases the plugin's reference
 * counts with the plugin registry.
 */
export class HdRendererPluginHandle {
  /** rendererPluginHandle.h:33-34, 67-68. Constructing from a plugin pointer
   *  is private upstream (friends HdRendererPluginRegistry and
   *  HdRendererPlugin); the reference was already taken by the caller. */
  constructor(plugin: HdRendererPlugin | null = null) {
    this._plugin = plugin
  }

  /** rendererPluginHandle.cpp:16-23 (copy constructor) */
  copy(): HdRendererPluginHandle {
    if (this._plugin) {
      HdRendererPluginRegistry.GetInstance().addPluginReference(this._plugin)
    }
    return new HdRendererPluginHandle(this._plugin)
  }

  /** rendererPluginHandle.cpp:32-35, 62-67 (destructor; operator=(nullptr)) */
  Reset(): void {
    const plugin = this._plugin
    this._plugin = null
    HdRendererPluginRegistry.GetInstance().releasePlugin(plugin)
  }

  /** rendererPluginHandle.h:54-55. Get the wrapped HdRendererPlugin */
  Get(): HdRendererPlugin | null { return this._plugin }

  /** rendererPluginHandle.h:60-61. Is the wrapped HdRendererPlugin valid? */
  isValid(): boolean { return this._plugin !== null }

  private _plugin: HdRendererPlugin | null
}
