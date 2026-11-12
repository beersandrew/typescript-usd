// Ported from OpenUSD 26.11.1: pxr/base/plug/interfaceFactory.cpp,
//  pxr/base/plug/interfaceFactory.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/plug/interfaceFactory.h:17-36.
export class Plug_InterfaceFactory<T> {
  readonly #factory: () => T
  #instance: T | undefined

  constructor(factory: () => T) {
    this.#factory = factory
  }

  new(): T {
    return (this.#instance ??= this.#factory())
  }
}
