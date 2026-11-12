// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/pluginRenderDelegateUniqueHandle.cpp,
//  pxr/imaging/hd/pluginRenderDelegateUniqueHandle.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/pluginRenderDelegateUniqueHandle.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: JavaScript has no destructors or move semantics. Reset() is the
// destructor / operator=(nullptr) (pluginRenderDelegateUniqueHandle.cpp:21-26,
// 42-53); IsValid() is `explicit operator bool`. The handle object is passed
// on (as std::move would) and its final owner calls Reset().

import { Token as TfToken } from 'typescript-usd/tf'
import type { HdRenderDelegate } from './renderDelegate.ts'
import { HdRendererPluginHandle } from './rendererPluginHandle.ts'

/**
 * pluginRenderDelegateUniqueHandle.h:20-75. A (movable) handle for a render
 * delegate that was created using a a plugin.
 *
 * The handle owns the render delegate (render delegate is destroyed
 * when handle is dropped). The handle also can be queried what
 * plugin was used to create the render delegate and ensures the
 * plugin is kept alive until the render delegate is destroyed.
 * In other words, the handle can be used just like a std::unique_ptr.
 */
export class HdPluginRenderDelegateUniqueHandle {
  /** pluginRenderDelegateUniqueHandle.h:33-35, 69-71. Constructing from a
   *  plugin and delegate is private upstream (friend HdRendererPlugin). */
  constructor(
    plugin: HdRendererPluginHandle = new HdRendererPluginHandle(),
    delegate: HdRenderDelegate | null = null,
  ) {
    this._plugin = plugin
    this._delegate = delegate
  }

  /** pluginRenderDelegateUniqueHandle.cpp:21-26, 42-53 */
  Reset(): void {
    if (this._delegate) {
      this._plugin.Get()!.deleteRenderDelegate(this._delegate)
      this._delegate = null
    }
    this._plugin.Reset()
  }

  /** pluginRenderDelegateUniqueHandle.h:53-54. Get render delegate */
  Get(): HdRenderDelegate | null { return this._delegate }

  /** pluginRenderDelegateUniqueHandle.h:59-60. Is the wrapped
   *  HdRenderDelegate valid? */
  isValid(): boolean { return this._delegate !== null }

  /** pluginRenderDelegateUniqueHandle.cpp:55-63. Get the id of the plugin
   *  used to create render delegate */
  getPluginId(): TfToken {
    const plugin = this._plugin.Get()
    if (plugin) {
      return plugin.getPluginId()
    }

    return TfToken()
  }

  private _plugin: HdRendererPluginHandle
  private _delegate: HdRenderDelegate | null
}
