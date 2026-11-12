// Ported from OpenUSD 26.11.1: pxr/base/plug/staticInterface.cpp,
//  pxr/base/plug/staticInterface.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/plug/staticInterface.h:21-199.
export class Plug_StaticInterfaceBase<T> {
  protected _initialized = false
  protected _ptr: T | null = null

  isInitialized(): boolean { return this._initialized }
}

export class PlugStaticInterface<T> extends Plug_StaticInterfaceBase<T> {
  readonly #load: () => T | null

  constructor(load: () => T | null) {
    super()
    this.#load = load
  }

  Get(): T | null {
    if (!this._initialized) {
      this._initialized = true
      this._ptr = this.#load()
    }
    return this._ptr
  }
}
