// Ported from OpenUSD 26.11.1: pxr/imaging/hd/pluginRendererUniqueHandle.cpp,
//  pxr/imaging/hd/pluginRendererUniqueHandle.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/pluginRendererUniqueHandle.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: JavaScript has no destructors or move semantics. Reset() is the
// destructor / operator=(nullptr) (pluginRendererUniqueHandle.cpp:32,
// 38-46): it destroys the renderer (HdRenderer.destroy) and then releases the
// plugin reference. IsValid() is `explicit operator bool`.

import { Token as TfToken } from 'typescript-usd/tf'
import type { HdRenderer } from './renderer.ts'
import { HdRendererPluginHandle } from './rendererPluginHandle.ts'

/**
 * pluginRendererUniqueHandle.h:20-70. A handle for a renderer that was
 * created by a renderer plugin. Its semantics are similar to std::unique_ptr.
 *
 * The handle owns the renderer and ensures that the plugin is kept alive
 * until the renderer is destroyed. The handle can also be queried for the
 * id of the plugin used to create the renderer.
 */
export class HdPluginRendererUniqueHandle {
  /** pluginRendererUniqueHandle.cpp:14-30. Constructing from a plugin and a
   *  renderer is private upstream (friend HdRendererPlugin). */
  constructor(
    plugin: HdRendererPluginHandle = new HdRendererPluginHandle(),
    renderer: HdRenderer | null = null,
  ) {
    this._plugin = plugin
    this._renderer = renderer
  }

  /** pluginRendererUniqueHandle.cpp:38-46 (operator=(nullptr); the
   *  destructor destroys the members in the same order). */
  Reset(): void {
    const renderer = this._renderer
    this._renderer = null
    renderer?.destroy()
    this._plugin.Reset()
  }

  /** pluginRendererUniqueHandle.h:49 */
  Get(): HdRenderer | null { return this._renderer }

  /** pluginRendererUniqueHandle.h:54-55. Is the wrapped HdRenderer valid? */
  isValid(): boolean { return this._renderer !== null }

  /** pluginRendererUniqueHandle.cpp:48-56. Id of the plugin used to create
   *  the renderer. */
  getPluginId(): TfToken {
    const plugin = this._plugin.Get()
    if (plugin) {
      return plugin.getPluginId()
    }

    return TfToken()
  }

  private _plugin: HdRendererPluginHandle
  private _renderer: HdRenderer | null
}
