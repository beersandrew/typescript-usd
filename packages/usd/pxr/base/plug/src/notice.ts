// Ported from OpenUSD 26.11.1: pxr/base/plug/notice.cpp,
//  pxr/base/plug/notice.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/plug/notice.h:19-48.
import type { PlugPlugin } from './plugin.ts'

export class PlugNotice {
  private constructor() {}

  static Base = class Base {}

  static DidRegisterPlugins = class DidRegisterPlugins {
    readonly #plugins: PlugPlugin[]
    constructor(newPlugins: readonly PlugPlugin[]) {
      this.#plugins = [...newPlugins]
    }
    getNewPlugins(): PlugPlugin[] { return [...this.#plugins] }
  }
}
